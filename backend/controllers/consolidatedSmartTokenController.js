// controllers/consolidatedSmartTokenController.js - COMPLETE FingerprintJS Pro ONLY Implementation
const { pool, sql } = require("../config/database");
const { blobServiceClient } = require("../config/azure-storage");
const fingerprintjsService = require("../services/fingerprintjsService");
const {
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} = require("@azure/storage-blob");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const twilioSMSService = require("../services/twilioSMSService");
const locationService = require("../services/locationService");

// ============================================================================
// FINGERPRINTJS PRO ONLY DEVICE VERIFICATION - NO FALLBACKS
// ============================================================================

/**
 * FingerprintJS Pro ONLY device verification and alert system
 * Detects unregistered devices and triggers emergency alerts
 */
const checkDeviceAndTriggerAlerts = async (
  req,
  tokenId,
  patientUserId,
  patientName,
  skipAlertsUntilClientFingerprint = false
) => {
  try {
    console.log(`🔐 FingerprintJS Pro ONLY device verification started:`);
    console.log(`   - Token: ${tokenId}`);
    console.log(`   - Patient: ${patientName} (ID: ${patientUserId})`);

    // ✅ CRITICAL: Only accept FingerprintJS Pro fingerprints
    if (!req.body?.deviceFingerprint) {
      console.warn("⚠️ No FingerprintJS Pro fingerprint provided");

      // ✅ FIX: Don't trigger alerts on GET requests OR if we already sent cancelled timer alert
      if (req.method === "GET") {
        console.log(
          "📍 GET request - skipping alerts, waiting for FingerprintJS Pro data"
        );
        return {
          isRegisteredDevice: false,
          alertsTriggered: false,
          error:
            "Missing FingerprintJS Pro fingerprint - waiting for client data",
          service: "fingerprintjs_pro_required",
        };
      }
      await pool.connect();
      // ✅ NEW: Check if we already sent a cancelled timer alert recently
      const recentTimerAlert = await pool
        .request()
        .input("tokenId", sql.NVarChar, tokenId)
        .input("patientUserId", sql.Int, patientUserId)
        .input("timeWindow", sql.DateTime, new Date(Date.now() - 5 * 60 * 1000)) // Last 5 minutes
        .query(`
    SELECT TOP 1 alertId, alertType, triggeredAt
    FROM SmartTokenEmergencyAlerts
    WHERE tokenId = @tokenId 
      AND patientUserId = @patientUserId
      AND alertType LIKE '%timer%'
      AND triggeredAt > @timeWindow
    ORDER BY triggeredAt DESC
  `);

      if (recentTimerAlert.recordset.length > 0) {
        console.log(
          "⏰ Recent timer alert already sent, skipping device verification alert"
        );
        return {
          isRegisteredDevice: false,
          alertsTriggered: false,
          error: "Recent timer alert already processed",
          service: "fingerprintjs_pro_timer_handled",
        };
      }

      // Only trigger alert for POST requests without fingerprint (actual security issue)
      // ✅ Get location data for early alerts
      const combinedLocationData = await getCombinedLocationData(req);
      const primaryLocation = combinedLocationData.primaryLocation;

      await triggerEmergencyAlerts(
        tokenId,
        patientUserId,
        patientName,
        null,
        {
          error: "No FingerprintJS Pro fingerprint provided",
          service: "missing_fpjs",
          visitorId: "unknown",
        },
        primaryLocation, // ✅ Now properly defined
        req
      );

      return {
        isRegisteredDevice: false,
        alertsTriggered: true,
        error: "Missing FingerprintJS Pro fingerprint",
        service: "fingerprintjs_pro_required",
      };
    }

    const deviceFingerprint = req.body.deviceFingerprint;
    const visitorId = deviceFingerprint.visitorId;

    // ✅ Validate FingerprintJS Pro data structure
    if (!visitorId) {
      console.warn("⚠️ No FingerprintJS Pro visitorId found");

      // ✅ Ensure location data is available
      const combinedLocationDataForAlert =
        combinedLocationData || (await getCombinedLocationData(req));
      const primaryLocationForAlert =
        combinedLocationDataForAlert.primaryLocation;

      await triggerEmergencyAlerts(
        tokenId,
        patientUserId,
        patientName,
        null,
        {
          error: "Invalid FingerprintJS Pro data - no visitorId",
          service: "invalid_fpjs",
          visitorId: "missing",
        },
        primaryLocationForAlert, // ✅ Properly defined
        req
      );

      return {
        isRegisteredDevice: false,
        alertsTriggered: true,
        error: "No valid FingerprintJS Pro visitorId",
        service: "fingerprintjs_pro_required",
      };
    }

    // ✅ Validate this is actually FingerprintJS Pro data
    const service = deviceFingerprint.metadata?.service;
    if (service !== "fingerprintjs_pro") {
      console.warn(`⚠️ Invalid fingerprint service: ${service}`);

      // ✅ Ensure location data is available
      const combinedLocationDataForService =
        combinedLocationData || (await getCombinedLocationData(req));
      const primaryLocationForService =
        combinedLocationDataForService.primaryLocation;

      await triggerEmergencyAlerts(
        tokenId,
        patientUserId,
        patientName,
        null,
        {
          error: `Invalid service: ${service}`,
          service: service || "unknown",
          visitorId: visitorId,
        },
        primaryLocationForService, // ✅ Properly defined
        req
      );

      return {
        isRegisteredDevice: false,
        alertsTriggered: true,
        error: "Invalid fingerprint service - FingerprintJS Pro required",
        service: "fingerprintjs_pro_required",
      };
    }

    console.log(`🔍 FingerprintJS Pro Device Check:`);
    console.log(`   - Visitor ID: ${visitorId}`);
    console.log(`   - Request ID: ${deviceFingerprint.requestId}`);
    console.log(`   - Confidence: ${deviceFingerprint.confidence}`);
    console.log(`   - Patient ID: ${patientUserId}`);

    // ✅ ENHANCED: Get combined GPS + IP location data
    const combinedLocationData = await getCombinedLocationData(req);
    const primaryLocation = combinedLocationData.primaryLocation;

    console.log(`🌐 Combined location result:`, {
      hasGPS: combinedLocationData.hasGPS,
      hasIP: combinedLocationData.hasIP,
      primaryType: primaryLocation?.type,
      city: primaryLocation?.city || primaryLocation?.address || "Unknown",
      coordinates:
        primaryLocation?.latitude && primaryLocation?.longitude
          ? `${primaryLocation.latitude}, ${primaryLocation.longitude}`
          : "None",
    });
    await pool.connect();

    // ✅ Check if this FingerprintJS Pro visitorId is registered for this patient
    const deviceCheck = await pool
      .request()
      .input("patientUserId", sql.Int, patientUserId)
      .input("visitorId", sql.NVarChar, visitorId).query(`
        SELECT 
          fingerprintId,
          deviceName,
          deviceType,
          registeredAt,
          registeredBy,
          isActive,
          confidence,
          requestId
        FROM DeviceFingerprints 
        WHERE isActive = 1
        AND (userId = @patientUserId OR registeredBy = @patientUserId)
        AND visitorId = @visitorId
        ORDER BY registeredAt DESC
      `);

    const isRegistered = deviceCheck.recordset.length > 0;
    let alertsTriggered = false;

    console.log(`✅ FingerprintJS Pro device check result:`);
    console.log(`   - Is registered: ${isRegistered}`);
    console.log(`   - Matches found: ${deviceCheck.recordset.length}`);

    // ✅ Log the access attempt with FingerprintJS Pro data
    const enhancedLogId = await logSmartTokenAccess(
      tokenId,
      patientUserId,
      patientName,
      deviceFingerprint,
      req,
      isRegistered
    );
    if (!isRegistered) {
      console.log("🚨 UNREGISTERED DEVICE DETECTED - FingerprintJS Pro");
      console.log("   - Visitor ID:", visitorId);
      console.log("   - Confidence:", deviceFingerprint.confidence);
      console.log("   - Request ID:", deviceFingerprint.requestId);

      // ✅ NEW: Check if we already sent a recent timer alert to prevent duplicates
      const recentTimerAlertCheck = await pool
        .request()
        .input("tokenId", sql.NVarChar, tokenId)
        .input("patientUserId", sql.Int, patientUserId)
        .input("timeWindow", sql.DateTime, new Date(Date.now() - 5 * 60 * 1000)) // Last 5 minutes
        .query(`
      SELECT TOP 1 alertId, alertType, triggeredAt
      FROM SmartTokenEmergencyAlerts
      WHERE tokenId = @tokenId 
        AND patientUserId = @patientUserId
        AND (alertType LIKE '%timer%' OR alertType LIKE '%cancelled%')
        AND triggeredAt > @timeWindow
      ORDER BY triggeredAt DESC
    `);

      if (recentTimerAlertCheck.recordset.length > 0) {
        console.log(
          "⏰ Recent timer/cancelled alert already sent, skipping duplicate FingerprintJS alert"
        );
        alertsTriggered = false;
      } else {
        console.log(`🚨 About to trigger emergency alerts with location:`, {
          hasGPS: combinedLocationData.hasGPS,
          hasIP: combinedLocationData.hasIP,
          primaryType: primaryLocation?.type,
          locationCity: primaryLocation?.city,
          locationCountry: primaryLocation?.country,
          locationCoordinates:
            primaryLocation?.latitude && primaryLocation?.longitude
              ? `${primaryLocation.latitude}, ${primaryLocation.longitude}`
              : "None",
        });

        // ✅ Get FRESH combined location data for main alert
        const alertLocationData = await getCombinedLocationData(req);
        const alertPrimaryLocation = alertLocationData.primaryLocation;

        console.log(`🌐 FRESH alert location data:`, {
          hasGPS: alertLocationData.hasGPS,
          hasIP: alertLocationData.hasIP,
          primaryType: alertPrimaryLocation?.type,
          city: alertPrimaryLocation?.city,
          coordinates:
            alertPrimaryLocation?.latitude && alertPrimaryLocation?.longitude
              ? `${alertPrimaryLocation.latitude}, ${alertPrimaryLocation.longitude}`
              : "None",
        });

        // ✅ Enhanced device info with location
        const enhancedDeviceInfo = {
          ...extractDeviceInfo(deviceFingerprint),
          combinedLocation: alertLocationData,
          ipLocation: alertLocationData.ipLocation,
          gpsLocation: alertLocationData.gpsLocation,
          hasLocation: alertLocationData.hasGPS || alertLocationData.hasIP,
          // ✅ Explicitly set location properties for alert message
          type: extractDeviceInfo(deviceFingerprint).deviceType,
          deviceType: extractDeviceInfo(deviceFingerprint).deviceType,
        };

        console.log(`📝 Enhanced device info for alert:`, {
          hasLocation: enhancedDeviceInfo.hasLocation,
          ipLocationCity: enhancedDeviceInfo.ipLocation?.city,
          type: enhancedDeviceInfo.type,
          deviceType: enhancedDeviceInfo.deviceType,
        });

        // Trigger emergency alerts for unregistered device
        const alertResult = await triggerEmergencyAlerts(
          tokenId,
          patientUserId,
          patientName,
          enhancedLogId,
          enhancedDeviceInfo,
          alertPrimaryLocation, // ✅ Pass fresh primary location
          req
        );

        alertsTriggered = alertResult.success;
      }
    } else {
      console.log(
        "✅ REGISTERED DEVICE - No alerts needed (FingerprintJS Pro)"
      );
      const registeredDevice = deviceCheck.recordset[0];
      console.log("   - Device Name:", registeredDevice.deviceName);
      console.log("   - Device Type:", registeredDevice.deviceType);
      console.log("   - Registered:", registeredDevice.registeredAt);
      console.log("   - Visitor ID:", visitorId);
    }

    return {
      isRegisteredDevice: isRegistered,
      deviceInfo: extractDeviceInfo(deviceFingerprint),
      combinedLocation: combinedLocationData, // ✅ Include full location data
      ipLocation: combinedLocationData.ipLocation, // ✅ From combined data
      gpsLocation: combinedLocationData.gpsLocation, // ✅ From combined data
      primaryLocation: primaryLocation, // ✅ Primary location
      hasLocation: combinedLocationData.hasGPS || combinedLocationData.hasIP, // ✅ From combined data
      enhancedLogId,
      alertsTriggered,
      service: "fingerprintjs_pro",
      confidence: deviceFingerprint.confidence,
      visitorId: visitorId,
      registeredDevice: isRegistered ? deviceCheck.recordset[0] : null,
    };
  } catch (error) {
    console.error("❌ Error in FingerprintJS Pro device verification:", error);

    // On error, trigger alerts as a safety measure
    try {
      // ✅ Get location data for error case
      let errorLocationData;
      try {
        errorLocationData = await getCombinedLocationData(req);
      } catch (locationError) {
        console.warn(
          "Could not get location for error alert:",
          locationError.message
        );
        errorLocationData = { primaryLocation: null };
      }

      await triggerEmergencyAlerts(
        tokenId,
        patientUserId,
        patientName,
        null,
        {
          error: error.message,
          service: "fingerprintjs_pro_error",
          visitorId: "error",
        },
        errorLocationData.primaryLocation, // ✅ Safely handle location
        req
      );
    } catch (alertError) {
      console.error("❌ Error triggering emergency alerts:", alertError);
    }

    return {
      isRegisteredDevice: false,
      alertsTriggered: true,
      error: error.message,
      service: "fingerprintjs_pro",
    };
  }
};

/**
 * Extract device information from FingerprintJS Pro fingerprint (WITHOUT IP location)
 */
const extractDeviceInfo = (fingerprint) => {
  const metadata = fingerprint.metadata || {};
  const details = fingerprint.details || {};

  // ✅ REMOVED: FingerprintJS Pro IP location extraction
  // Will use separate IP geolocation service instead

  return {
    visitorId: fingerprint.visitorId,
    requestId: fingerprint.requestId,
    confidence: fingerprint.confidence,
    service: "fingerprintjs_pro",
    deviceName:
      metadata.deviceName ||
      getDeviceNameFromUserAgent(details.userAgent || ""),
    browserName:
      metadata.browserName ||
      getBrowserNameFromUserAgent(details.userAgent || ""),
    osName: metadata.osName || getOSNameFromUserAgent(details.userAgent || ""),
    deviceType:
      metadata.deviceType ||
      getDeviceTypeFromUserAgent(details.userAgent || ""),
    userAgent: details.userAgent || "",
    hasLocation: false, // Will be set separately
    timestamp: new Date().toISOString(),
  };
};

/**
 * Log SmartToken access with FingerprintJS Pro data
 */
const logSmartTokenAccess = async (
  tokenId,
  patientUserId,
  patientName,
  deviceFingerprint,
  req,
  isRegistered
) => {
  try {
    await pool.connect();

    const result = await pool
      .request()
      .input("tokenId", sql.NVarChar, tokenId)
      .input("patientUserId", sql.Int, patientUserId)
      .input("patientName", sql.NVarChar, patientName)
      .input("accessMode", sql.NVarChar, "smarttoken_fpjs_scan")
      .input("ipAddress", sql.NVarChar, getRealUserIP(req))
      .input("userAgent", sql.NVarChar, req.headers["user-agent"] || "")
      .input(
        "deviceFingerprint",
        sql.NVarChar,
        JSON.stringify(deviceFingerprint)
      )
      .input("visitorId", sql.NVarChar, deviceFingerprint.visitorId)
      .input("confidenceScore", sql.Float, deviceFingerprint.confidence)
      .input("fingerprintService", sql.NVarChar, "fingerprintjs_pro")
      .input("isRegisteredDevice", sql.Bit, isRegistered ? 1 : 0).query(`
   INSERT INTO EnhancedTokenAccessLog (
      tokenId, patientUserId, accessMode,
      ipAddress, userAgent, deviceFingerprint,
      visitorId, confidenceScore, fingerprintService,
      isRegisteredDevice, accessTime
    )
    OUTPUT INSERTED.logId
    VALUES (
      @tokenId, @patientUserId, @accessMode,
      @ipAddress, @userAgent, @deviceFingerprint,
      @visitorId, @confidenceScore, @fingerprintService,
      @isRegisteredDevice, GETDATE()
    )
 `);

    const logId = result.recordset[0].logId;

    console.log("📝 SmartToken access logged:", {
      logId: logId,
      visitorId: deviceFingerprint.visitorId,
      confidence: deviceFingerprint.confidence,
      isRegistered: isRegistered,
      service: "fingerprintjs_pro",
    });

    return logId;
  } catch (error) {
    console.error("❌ Error logging SmartToken access:", error);
    return null;
  }
};

/**
 * Trigger emergency alerts for unregistered FingerprintJS Pro device access
 */
const triggerEmergencyAlerts = async (
  tokenId,
  patientUserId,
  patientName,
  enhancedLogId,
  deviceInfo,
  locationData,
  req
) => {
  try {
    console.log("🚨 FingerprintJS Pro EMERGENCY ALERT SYSTEM ACTIVATED");
    console.log("   - Token:", tokenId);
    console.log("   - Patient:", patientName, "(ID:", patientUserId, ")");
    console.log("   - Visitor ID:", deviceInfo.visitorId || "unknown");
    console.log("   - Service: FingerprintJS Pro");
    console.log("   - Confidence:", deviceInfo.confidence || "unknown");

    await pool.connect();

    // Get emergency contacts
    const contactsResult = await pool
      .request()
      .input("patientUserId", sql.Int, patientUserId).query(`
        SELECT contactId, contactName, phoneNumber, relationship, isPrimary
        FROM EmergencyContacts 
        WHERE patientUserId = @patientUserId AND isActive = 1
        ORDER BY isPrimary DESC, contactName ASC
      `);

    const emergencyContacts = contactsResult.recordset;

    if (emergencyContacts.length === 0) {
      console.log("⚠️ No emergency contacts found for patient", patientUserId);
      return {
        success: false,
        reason: "No emergency contacts found",
        patientUserId: patientUserId,
        contactCount: 0,
        service: "fingerprintjs_pro",
      };
    }

    // ✅ ENHANCED: Create alert message with proper location data
    console.log(`📝 Creating alert message with:`, {
      patientName,
      deviceInfo: {
        type: deviceInfo.type || deviceInfo.deviceType,
        hasLocation: deviceInfo.hasLocation,
        ipLocationCity: deviceInfo.ipLocation?.city,
      },
      locationData: {
        city: locationData?.city,
        country: locationData?.country,
        coordinates:
          locationData?.latitude && locationData?.longitude
            ? `${locationData.latitude}, ${locationData.longitude}`
            : "None",
      },
    });

    // Use locationData parameter first, then fallback to deviceInfo.ipLocation
    const finalLocationData = locationData || deviceInfo.ipLocation || {};
    console.log(`📍 Final location data for alert:`, finalLocationData);

    const alertMessage = await twilioSMSService.createEmergencyMessage(
      patientName,
      deviceInfo,
      finalLocationData
    );

    console.log(`📨 Generated alert message:`, alertMessage);

    // Create alert record
    const alertResult = await pool
      .request()
      .input("tokenId", sql.NVarChar, tokenId)
      .input("patientUserId", sql.Int, patientUserId)
      .input("enhancedLogId", sql.Int, enhancedLogId)
      .input("alertType", sql.NVarChar, "unregistered_device_fpjs")
      .input("alertMessage", sql.NVarChar, alertMessage)
      .input("deviceFingerprint", sql.NVarChar, JSON.stringify(deviceInfo))
      .input(
        "deviceInfo",
        sql.NVarChar,
        `Device from ${deviceInfo.ipLocation?.city || "Unknown City"}`
      )
      .input("deviceType", sql.NVarChar, deviceInfo.deviceType || "unknown")
      .input("ipAddress", sql.NVarChar, getRealUserIP(req))
      .input("severity", sql.NVarChar, "HIGH").query(`
        INSERT INTO SmartTokenEmergencyAlerts (
          tokenId, patientUserId, enhancedLogId, alertType, alertMessage,
          deviceFingerprint, deviceInfo, deviceType, ipAddress, severity
        )
        OUTPUT INSERTED.alertId
        VALUES (
          @tokenId, @patientUserId, @enhancedLogId, @alertType, @alertMessage,
          @deviceFingerprint, @deviceInfo, @deviceType, @ipAddress, @severity
        )
      `);

    const alertId = alertResult.recordset[0].alertId;

    // ✅ Enhanced SMS sending with trial account handling
    console.log(
      `📤 Sending emergency alerts to ${emergencyContacts.length} contacts...`
    );
    // 🚫 DEVELOPMENT: Comment out Twilio API calls to avoid costs
    console.log(`🚫 [DEVELOPMENT MODE] Twilio API disabled`);
    console.log(`📱 Would send SMS to ${emergencyContacts.length} contacts:`);
    emergencyContacts.forEach((contact, index) => {
      console.log(
        `   ${index + 1}. ${contact.contactName} (${contact.phoneNumber}): ${
          contact.relationship
        }`
      );
    });
    console.log(`📨 Alert message would be: "${alertMessage}"`);

    // Simulate successful batch result for development
    const batchResult = {
      total: emergencyContacts.length,
      successful: emergencyContacts.length, // Simulate all successful
      failed: 0,
      trialUnverified: 0,
      details: emergencyContacts.map((contact) => ({
        contact: contact,
        result: {
          success: true,
          messageId: `DEV_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`,
          status: "simulated",
        },
      })),
    };

    console.log(`✅ [SIMULATED] Batch SMS result:`, {
      successful: batchResult.successful,
      failed: batchResult.failed,
      total: batchResult.total,
    });
    // const batchResult = await twilioSMSService.sendBatchEmergencyAlerts(
    //   emergencyContacts,
    //   alertMessage
    // );

    // ✅ Enhanced response handling
    const response = {
      alertId: alertId,
      contactsTotal: batchResult.total,
      contactsSuccessful: batchResult.successful,
      contactsFailed: batchResult.failed,
      contactsUnverified: batchResult.trialUnverified || 0,
      details: batchResult.details,
    };

    // ✅ Special handling for trial accounts with unverified numbers
    if (batchResult.trialUnverified > 0) {
      console.warn(
        `⚠️ TRIAL ACCOUNT LIMITATION: ${batchResult.trialUnverified} contacts have unverified numbers`
      );

      // Log trial verification instructions
      const verificationInstructions =
        twilioSMSService.getTrialVerificationInstructions();
      console.log("📋 To resolve unverified numbers:");
      verificationInstructions.steps.forEach((step) =>
        console.log(`   ${step}`)
      );

      response.trialAccountLimitation = true;
      response.verificationInstructions = verificationInstructions;

      // ✅ Track unverified contacts in the alert details
      const unverifiedContacts = batchResult.details
        .filter(
          (detail) => detail.result.errorCode === "UNVERIFIED_NUMBER_TRIAL"
        )
        .map((detail) => ({
          contactName: detail.contact.contactName,
          phoneNumber: detail.contact.phoneNumber,
          relationship: detail.contact.relationship,
        }));

      response.unverifiedContacts = unverifiedContacts;
    }

    // Update alert delivery status
    const deliveryStatus =
      batchResult.successful > 0
        ? batchResult.failed > 0
          ? "PARTIAL"
          : "DELIVERED"
        : "FAILED";

    await pool
      .request()
      .input("alertId", sql.Int, alertId)
      .input("smsAlertsSent", sql.Int, batchResult.successful)
      .input("emergencyContactsNotified", sql.Int, emergencyContacts.length)
      .input("smsDeliveryStatus", sql.NVarChar, deliveryStatus)
      .input("trialUnverified", sql.Int, batchResult.trialUnverified || 0)
      .query(`
        UPDATE SmartTokenEmergencyAlerts 
        SET smsAlertsSent = @smsAlertsSent,
            emergencyContactsNotified = @emergencyContactsNotified,
            smsDeliveryStatus = @smsDeliveryStatus
        WHERE alertId = @alertId
      `);

    console.log("📋 FingerprintJS Pro EMERGENCY ALERT SUMMARY:");
    console.log("   - Alert ID:", alertId);
    console.log("   - Service: FingerprintJS Pro");
    console.log("   - Visitor ID:", deviceInfo.visitorId);
    console.log("   - Contacts notified:", emergencyContacts.length);
    console.log("   - SMS sent:", batchResult.successful);
    console.log("   - SMS failed:", batchResult.failed);
    if (batchResult.trialUnverified > 0) {
      console.log("   - Trial unverified:", batchResult.trialUnverified);
    }
    console.log("   - Status:", deliveryStatus);

    return {
      success: true,
      alertId: alertId,
      patientUserId: patientUserId,
      patientName: patientName,
      contactCount: emergencyContacts.length,
      smsSuccessful: batchResult.successful,
      smsFailed: batchResult.failed,
      smsUnverified: batchResult.trialUnverified || 0,
      deliveryStatus: deliveryStatus,
      service: "fingerprintjs_pro",
      trialAccountLimitation: batchResult.trialUnverified > 0,
      ...response,
    };
  } catch (error) {
    console.error(
      "❌ CRITICAL ERROR in FingerprintJS Pro emergency alert system:",
      error
    );
    return {
      success: false,
      reason: "System error",
      error: error.message,
      tokenId: tokenId,
      patientUserId: patientUserId,
      service: "fingerprintjs_pro",
    };
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Enhanced helper function to check if localhost
const isLocalhost = (ipAddress) => {
  return (
    ipAddress === "127.0.0.1" ||
    ipAddress === "::1" ||
    ipAddress === "localhost" ||
    ipAddress.startsWith("192.168.") ||
    ipAddress.startsWith("10.") ||
    ipAddress.startsWith("172.")
  );
};

// Helper functions for device detection
const getRealUserIP = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  const realIP = req.headers["x-real-ip"];
  const cfConnectingIP = req.headers["cf-connecting-ip"];

  if (forwardedFor) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    return ips[0];
  }

  return (
    realIP ||
    cfConnectingIP ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    "unknown"
  );
};

const getDeviceNameFromUserAgent = (userAgent) => {
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) {
    const match = userAgent.match(/Android.*?;\s*(.*?)\s*Build/);
    return match ? match[1].trim() : "Android Device";
  }
  if (/Mac/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows PC";
  return "Unknown Device";
};

const getBrowserNameFromUserAgent = (userAgent) => {
  if (/Edg/i.test(userAgent)) return "Edge";
  if (/Chrome/i.test(userAgent) && !/Edg/i.test(userAgent)) return "Chrome";
  if (/Firefox/i.test(userAgent)) return "Firefox";
  if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) return "Safari";
  if (/SamsungBrowser/i.test(userAgent)) return "Samsung Internet";
  return "Unknown Browser";
};

const getOSNameFromUserAgent = (userAgent) => {
  if (/iPhone|iPad/i.test(userAgent)) return "iOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Mac OS X/i.test(userAgent)) return "macOS";
  if (/Windows/i.test(userAgent)) return "Windows";
  return "Unknown OS";
};

const getDeviceTypeFromUserAgent = (userAgent) => {
  return /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(
    userAgent
  )
    ? "mobile"
    : "desktop";
};

const getIPLocationForDevice = async (ipAddress) => {
  try {
    const locationResult = await locationService.getLocationFromIP(ipAddress);
    return locationResult;
  } catch (error) {
    console.error("❌ Error getting IP location:", error);
    return null;
  }
};

// Helper function to check if token is revoked/disabled
const checkTokenStatus = async (smartTokenId) => {
  try {
    await pool.connect();
    const result = await pool
      .request()
      .input("smartTokenId", smartTokenId)
      .query(
        "SELECT status, revokedAt, revokedBy, revokeReason FROM SmartTokens WHERE smartTokenId = @smartTokenId"
      );

    if (result.recordset.length === 0) {
      return { exists: false };
    }

    const token = result.recordset[0];
    return {
      exists: true,
      status: token.status,
      isRevoked: token.status === "revoked",
      revokedAt: token.revokedAt,
      revokedBy: token.revokedBy,
      revokeReason: token.revokeReason,
    };
  } catch (error) {
    console.error("Error checking token status:", error);
    return { exists: false, error: true };
  }
};

// Helper function to get patient files from Azure
const getPatientFilesFromAzure = async (containerName, folderName) => {
  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobs = [];
    const folderPrefix = `${folderName}/`;
    const blobIterator = containerClient.listBlobsFlat({
      prefix: folderPrefix,
    });

    for await (const blob of blobIterator) {
      if (blob.name === folderPrefix) continue;

      const blobName = blob.name.replace(folderPrefix, "");
      blobs.push({
        name: blobName,
        fullPath: blob.name,
        contentType: blob.properties.contentType,
        contentLength: blob.properties.contentLength,
        createdOn: blob.properties.createdOn,
        lastModified: blob.properties.lastModified,
      });
    }

    return blobs;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error fetching patient files:", error);
    }
    return [];
  }
};

// Helper function for file size formatting
const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// Helper function to format date of birth
const formatDateOfBirth = (dateString) => {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  } catch (error) {
    console.error("Error formatting date of birth:", error);
    return null;
  }
};

// Updated log token access with real IP detection
const logTokenAccess = async (
  tokenId,
  containerName,
  folderName,
  ipAddress,
  mode = "online"
) => {
  try {
    await pool.connect();
    await pool
      .request()
      .input("tokenId", tokenId)
      .input("containerName", containerName)
      .input("folderName", folderName)
      .input("ipAddress", ipAddress)
      .input("accessMode", mode).query(`
        INSERT INTO TokenAccessLog (tokenId, containerName, folderName, ipAddress, accessMode, accessTime)
        VALUES (@tokenId, @containerName, @folderName, @ipAddress, @accessMode, GETDATE())
      `);

    // Optional: Log to console in development for debugging
    if (process.env.NODE_ENV === "development") {
      console.log(
        `📍 SmartToken Access Logged: ${tokenId.substring(
          0,
          8
        )}... from IP ${ipAddress} (${mode} mode)`
      );
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error logging token access:", error);
    }
  }
};

/**
 * ✅ NEW: Combine GPS and IP location data for comprehensive location info
 */
const getCombinedLocationData = async (req) => {
  try {
    // Get IP location
    const ipLocation = await getIPLocationForDevice(getRealUserIP(req));

    // Check for GPS coordinates from frontend
    const gpsCoordinates =
      req.body?.gpsCoordinates || req.body?.deviceFingerprint?.gpsCoordinates;

    let combinedLocation = {
      hasGPS: false,
      hasIP: !!ipLocation,
      ipLocation: ipLocation,
      gpsLocation: null,
      primaryLocation: ipLocation, // Default to IP
      timestamp: new Date().toISOString(),
    };

    // If GPS coordinates are provided, use them as primary
    if (gpsCoordinates && gpsCoordinates.latitude && gpsCoordinates.longitude) {
      console.log(`📍 GPS coordinates received:`, {
        latitude: gpsCoordinates.latitude,
        longitude: gpsCoordinates.longitude,
        accuracy: gpsCoordinates.accuracy,
      });

      // Create GPS location object
      const gpsLocation = {
        type: "gps",
        latitude: parseFloat(gpsCoordinates.latitude),
        longitude: parseFloat(gpsCoordinates.longitude),
        accuracy: gpsCoordinates.accuracy || "unknown",
        timestamp: gpsCoordinates.timestamp || new Date().toISOString(),
        source: "device_gps",
      };

      // Try to get address from GPS coordinates
      try {
        const locationService = require("../services/locationService");
        const gpsLocationWithAddress = await locationService.getLocationFromGPS(
          gpsLocation.latitude,
          gpsLocation.longitude
        );

        if (gpsLocationWithAddress && gpsLocationWithAddress.address) {
          gpsLocation.address = gpsLocationWithAddress.address;
          gpsLocation.city = gpsLocationWithAddress.city;
          gpsLocation.region = gpsLocationWithAddress.region;
          gpsLocation.country = gpsLocationWithAddress.country;
        }
      } catch (gpsError) {
        console.warn(
          "⚠️ Could not get address from GPS coordinates:",
          gpsError.message
        );
      }

      combinedLocation.hasGPS = true;
      combinedLocation.gpsLocation = gpsLocation;
      combinedLocation.primaryLocation = gpsLocation; // GPS takes priority
    }

    console.log(`🌐 Combined location data:`, {
      hasGPS: combinedLocation.hasGPS,
      hasIP: combinedLocation.hasIP,
      primaryType: combinedLocation.primaryLocation?.type,
      coordinates:
        combinedLocation.primaryLocation?.latitude &&
        combinedLocation.primaryLocation?.longitude
          ? `${combinedLocation.primaryLocation.latitude}, ${combinedLocation.primaryLocation.longitude}`
          : "None",
    });

    return combinedLocation;
  } catch (error) {
    console.error("❌ Error getting combined location:", error);
    return {
      hasGPS: false,
      hasIP: false,
      ipLocation: null,
      gpsLocation: null,
      primaryLocation: null,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};

// ============================================================================
// PUBLIC ROUTES (No Authentication Required) - FINGERPRINTJS PRO ONLY
// ============================================================================

// FIXED: Main verification endpoint with SmartToken auto-registration using existing tokenStatus.ejs
exports.verifySmartToken = async (req, res) => {
  try {
    const { id } = req.params;
    const { s: signature } = req.query;

    console.log(
      `🔍 Starting SmartToken verification with auto-registration: ${id}`
    );

    // Validate input
    if (!id || !signature) {
      return res.status(400).render("error", {
        title: "Invalid Token",
        message: "Invalid token format. Please scan a valid SmartToken.",
        errorCode: "INVALID_FORMAT",
      });
    }

    // Check if token is revoked/disabled FIRST
    const tokenStatus = await checkTokenStatus(id);
    if (tokenStatus.isRevoked) {
      return res.status(403).render("tokenRevoked", {
        title: "Token Revoked",
        message:
          "This SmartToken has been remotely disconnected and is no longer valid.",
        tokenId: id,
        revokedAt: tokenStatus.revokedAt,
        revokeReason:
          tokenStatus.revokeReason || "Token reported lost or compromised",
        instructions:
          "Please contact the medical facility for a replacement token.",
      });
    }

    // Validate signature format
    if (!signature.match(/^[A-F0-9-]+$/i)) {
      return res.status(400).render("error", {
        title: "Invalid Signature",
        message: "Invalid token signature format.",
        errorCode: "INVALID_SIGNATURE",
        instructions: "Please scan the SmartToken again or contact support.",
      });
    }

    let vivoKeyResponse;

    try {
      // Call VivoKey Verify API
      console.log(`🔑 Calling VivoKey API for signature validation...`);
      vivoKeyResponse = await axios.post(
        "https://auth.vivokey.com/validate",
        {
          signature: signature,
        },
        {
          headers: {
            "X-API-VIVOKEY": process.env.VIVOKEY_API_KEY,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );
      console.log(`✅ VivoKey API Response: ${vivoKeyResponse.data.result}`);
    } catch (apiError) {
      console.log(`❌ VivoKey API Error: ${apiError.message}`);
      // Handle network/API errors - fallback to offline mode
      return await handleOfflineMode(req, res, id);
    }

    // Handle VivoKey API responses
    if (vivoKeyResponse.data.result === "success") {
      const jwtToken = vivoKeyResponse.data.token;

      // Decode JWT to get secure chip ID
      const decoded = jwt.decode(jwtToken);
      if (!decoded || !decoded.sub) {
        return res.status(400).render("error", {
          title: "Token Error",
          message: "Invalid token response from verification service.",
          errorCode: "INVALID_JWT",
          instructions: "Please try scanning the token again.",
        });
      }

      const secureChipId = decoded.sub;
      console.log(`🔐 Extracted secureChipId from JWT: ${secureChipId}`);

      // Check database for token
      await pool.connect();
      let tokenRecord = await pool
        .request()
        .input("smartTokenId", sql.NVarChar, id)
        .input("secureChipId", sql.NVarChar, secureChipId).query(`
          SELECT 
            st.smartTokenId,
            st.secureChipId,
            st.containerName,
            st.folderName,
            st.patientDateOfBirth,
            st.status,
            st.productCode,
            st.devId,
            COALESCE(u.name, st.patientName) as patientName,
            COALESCE(st.patientUserId, u.userId) as patientUserId
          FROM SmartTokens st
          LEFT JOIN Users u ON st.patientUserId = u.userId
          WHERE st.smartTokenId = @smartTokenId AND st.secureChipId = @secureChipId
        `);

      // ✅ AUTO-REGISTRATION: Auto-enrollment for new tokens
      if (tokenRecord.recordset.length === 0) {
        console.log(`🆕 NEW SMARTTOKEN DETECTED - Auto-registering: ${id}`);
        console.log(`   - SmartToken ID: ${id}`);
        console.log(`   - Secure Chip ID: ${secureChipId}`);

        try {
          const productCode = decoded.product
            ? parseInt(decoded.product, 10)
            : 7;
          const devId = decoded.dev_id || decoded.iss || "unknown";
          await pool
            .request()
            .input("smartTokenId", sql.NVarChar, id)
            .input("secureChipId", sql.NVarChar, secureChipId)
            .input("productCode", sql.Int, productCode)
            .input("devId", sql.NVarChar, devId)
            .input("status", sql.NVarChar, "unclaimed").query(`
              INSERT INTO SmartTokens (smartTokenId, secureChipId, productCode, devId, status, createdAt)
              VALUES (@smartTokenId, @secureChipId, @productCode, @devId, @status, GETDATE())
            `);

          console.log(
            `✅ SmartToken auto-registered successfully as 'unclaimed'`
          );

          // ✅ Use existing tokenStatus.ejs template for newly registered tokens
          return res.render("tokenStatus", {
            title: "Token Registered",
            message:
              "SmartToken has been registered in the system but is not yet assigned to a patient.",
            status: "unclaimed",
            tokenId: id,
            instructions:
              "Please contact the medical facility to assign this token to a patient record.",
          });
        } catch (registrationError) {
          console.error(
            `❌ Failed to auto-register SmartToken:`,
            registrationError
          );
          return res.status(500).render("error", {
            title: "Registration Failed",
            message: "Failed to register new SmartToken in the system.",
            errorCode: "AUTO_REGISTRATION_FAILED",
            instructions: "Please contact technical support.",
          });
        }
      }

      const token = tokenRecord.recordset[0];
      console.log(`✅ Existing SmartToken found in database`);

      // Double-check token status from database
      if (token.status === "revoked") {
        return res.status(403).render("tokenRevoked", {
          title: "Token Revoked",
          message: "This SmartToken has been remotely disconnected.",
          tokenId: id,
          revokedAt: token.revokedAt,
          revokeReason:
            token.revokeReason || "Token reported lost or compromised",
          instructions: "Please contact the medical facility for assistance.",
        });
      }

      // ✅ Handle unclaimed tokens (use existing template)
      if (token.status === "unclaimed") {
        console.log(`📋 SmartToken is unclaimed - showing status page`);
        return res.render("tokenStatus", {
          title: "Token Registered",
          message:
            "This SmartToken is registered but not yet assigned to a patient.",
          status: "unclaimed",
          tokenId: id,
          instructions:
            "Please contact the medical facility to assign this token to a patient record.",
        });
      }

      // Check if token is assigned to patient
      if (
        token.containerName &&
        token.folderName &&
        token.status === "assigned"
      ) {
        console.log(
          `✅ SmartToken is assigned to patient: ${token.patientName}`
        );
        console.log(`   - Container: ${token.containerName}`);
        console.log(`   - Folder: ${token.folderName}`);

        // Perform device verification for assigned tokens
        const deviceVerification = await checkDeviceAndTriggerAlerts(
          req,
          id,
          token.patientUserId,
          token.patientName,
          true
        );

        console.log(`✅ Device verification completed:`);
        console.log(
          `   - Registered Device: ${deviceVerification.isRegisteredDevice}`
        );
        console.log(
          `   - Alerts Triggered: ${deviceVerification.alertsTriggered}`
        );

        // Get patient files from Azure
        const patientFiles = await getPatientFilesFromAzure(
          token.containerName,
          token.folderName
        );

        // Files will use view-only access through the emergency endpoint
        const filesForDisplay = patientFiles.map((file) => ({
          ...file,
          // Add emergency access info
          emergencyAccess: true,
        }));

        // Log access for audit with real user IP
        await logTokenAccess(
          id,
          token.containerName,
          token.folderName,
          getRealUserIP(req),
          "online"
        );

        // Format patient date of birth
        const formattedDOB = formatDateOfBirth(token.patientDateOfBirth);

        // Security notice
        let securityNotice = null;
        if (
          !deviceVerification.isRegisteredDevice &&
          deviceVerification.alertsTriggered
        ) {
          securityNotice =
            "Emergency contacts have been notified of this access from an unregistered device.";
        }

        // Render timer screen FIRST (for ALL devices) - then patient data
        return res.render("timerScreen", {
          title: `Emergency Access Timer - ${
            token.patientName || token.folderName
          }`,
          patientName: token.patientName || token.folderName,
          patientDateOfBirth: formattedDOB,
          containerName: token.containerName,
          folderName: token.folderName,
          files: filesForDisplay,
          isEmergencyAccess: true,
          accessTime: new Date().toISOString(),
          tokenId: id,
          formatFileSize: formatFileSize,
          deviceInfo: deviceVerification.deviceInfo,
          isRegisteredDevice: deviceVerification.isRegisteredDevice,
          alertsTriggered: deviceVerification.alertsTriggered,
          securityNotice: securityNotice,
          accessIP: getRealUserIP(req),
          // Timer-specific data
          timerDuration: 10, // 10 seconds
          emergencyContactsAvailable: true, // Will be used to show/hide timer based on contacts
        });
      } else {
        // ✅ Use existing template for unassigned tokens
        return res.render("tokenStatus", {
          title: "Token Not Assigned",
          message:
            "This SmartToken is registered but not assigned to any patient.",
          status: "unassigned",
          tokenId: id,
          instructions:
            "Please contact the medical facility to assign this token to a patient record.",
        });
      }
    } else if (vivoKeyResponse.data.result === "expired") {
      return res.render("tokenExpired", {
        title: "Token Expired",
        message: "This SmartToken link has expired.",
        instructions:
          "Please scan the SmartToken again to generate a new link.",
        tokenId: id,
      });
    } else if (vivoKeyResponse.data.result === "invalid") {
      return res.status(400).render("error", {
        title: "Invalid Token",
        message: "This SmartToken signature is invalid.",
        errorCode: "INVALID_TOKEN",
        instructions:
          "Please ensure you are scanning a valid SmartToken device.",
      });
    } else {
      return res.status(400).render("error", {
        title: "Unknown Response",
        message: "Received unknown response from verification service.",
        errorCode: "UNKNOWN_RESPONSE",
        instructions: "Please try again or contact technical support.",
      });
    }
  } catch (error) {
    console.error("SmartToken verification error:", error);
    return res.status(500).render("error", {
      title: "System Error",
      message: "An error occurred while verifying the SmartToken.",
      errorCode: "SYSTEM_ERROR",
      instructions: "Please try again or contact technical support.",
    });
  }
};

// Handle offline mode when VivoKey API is unavailable
const handleOfflineMode = async (req, res, tokenId) => {
  try {
    // Check token status even in offline mode
    const tokenStatus = await checkTokenStatus(tokenId);
    if (tokenStatus.isRevoked) {
      return res.status(403).render("tokenRevoked", {
        title: "Token Revoked",
        message: "This SmartToken has been remotely disconnected.",
        tokenId: tokenId,
        revokedAt: tokenStatus.revokedAt,
        revokeReason:
          tokenStatus.revokeReason || "Token reported lost or compromised",
        instructions: "Please contact the medical facility for assistance.",
        isOfflineMode: true,
      });
    }

    await pool.connect();
    const tokenRecord = await pool
      .request()
      .input("smartTokenId", tokenId)
      .query("SELECT * FROM SmartTokens WHERE smartTokenId = @smartTokenId");

    if (tokenRecord.recordset.length > 0) {
      const token = tokenRecord.recordset[0];

      if (
        token.containerName &&
        token.folderName &&
        token.status === "assigned"
      ) {
        // Get limited patient data in offline mode
        const patientFiles = await getPatientFilesFromAzure(
          token.containerName,
          token.folderName
        );

        // Files will use view-only access
        const filesForDisplay = patientFiles.map((file) => ({
          ...file,
          emergencyAccess: true,
        }));

        // Log offline access with real user IP
        await logTokenAccess(
          tokenId,
          token.containerName,
          token.folderName,
          getRealUserIP(req),
          "offline"
        );

        // Format patient date of birth
        const formattedDOB = formatDateOfBirth(token.patientDateOfBirth);

        return res.render("timerScreen", {
          title: `Emergency Access Timer - ${
            token.patientName || token.folderName
          } (Limited Access)`,
          patientName: token.patientName || token.folderName,
          patientDateOfBirth: formattedDOB,
          containerName: token.containerName,
          folderName: token.folderName,
          files: filesForDisplay,
          isEmergencyAccess: true,
          isOfflineMode: true,
          warning: "Limited access - Token verification service unavailable",
          accessTime: new Date().toISOString(),
          tokenId: tokenId,
          formatFileSize: formatFileSize,
          timerDuration: 10,
          isOfflineMode: true,
          emergencyContactsAvailable: true,
        });
      } else {
        return res.render("tokenStatus", {
          title: "Token Not Assigned",
          message: "Token found but not assigned to any patient.",
          status: "unassigned",
          isOfflineMode: true,
          tokenId: tokenId,
          instructions:
            "Please contact the medical facility when connection is restored.",
        });
      }
    } else {
      return res.render("error", {
        title: "Token Not Found",
        message:
          "SmartToken not recognized and verification service is unavailable.",
        errorCode: "OFFLINE_UNKNOWN_TOKEN",
        instructions:
          "Network connection is required for new tokens. Please try again when connection is restored.",
      });
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Offline mode error:", error);
    }
    return res.status(500).render("error", {
      title: "Database Error",
      message: "Unable to access token database.",
      errorCode: "DATABASE_ERROR",
      instructions: "Please contact technical support.",
    });
  }
};

// Emergency file access endpoint that works with all browsers
exports.getPatientFileViewOnly = async (req, res) => {
  try {
    const { containerName, folderName, fileName } = req.params;

    // Get container client
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const fullBlobName = `${folderName}/${fileName}`;
    const blobClient = containerClient.getBlobClient(fullBlobName);

    // Check if blob exists
    const blobExists = await blobClient.exists();
    if (!blobExists) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>File Not Found</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
              text-align: center; 
              padding: 20px; 
              background: #f5f5f5; 
              margin: 0;
            }
            .error-box { 
              background: white; 
              border-radius: 8px; 
              padding: 2rem; 
              box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
              max-width: 400px; 
              margin: 0 auto; 
            }
          </style>
        </head>
        <body>
          <div class="error-box">
            <h1>File Not Found</h1>
            <p>The requested medical file could not be found.</p>
            <button onclick="window.history.back()">Go Back</button>
          </div>
        </body>
        </html>
      `);
    }

    // Get blob properties to determine content type
    const properties = await blobClient.getProperties();
    const contentType = properties.contentType || "application/octet-stream";

    // Download blob content
    const downloadResponse = await blobClient.download();

    // Set headers for viewing only (prevent download) - Universal browser compatible
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");

    // For PDF files, explicitly prevent download
    if (contentType.includes("pdf")) {
      res.setHeader(
        "Content-Disposition",
        'inline; filename="medical_document.pdf"'
      );
    }

    // For images, ensure they display inline
    if (contentType.includes("image")) {
      res.setHeader("Content-Disposition", "inline");
    }

    // Stream the file content directly to response
    if (
      contentType.includes("text") ||
      fileName.toLowerCase().endsWith(".txt")
    ) {
      try {
        // Read the text content
        const chunks = [];
        for await (const chunk of downloadResponse.readableStreamBody) {
          chunks.push(chunk);
        }
        const textContent = Buffer.concat(chunks).toString("utf8");

        // Set content type to HTML for better display
        res.setHeader("Content-Type", "text/html; charset=utf-8");

        // Create enhanced HTML wrapper with improved typography
        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Medical Document - ${fileName}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            font-size: 18px;
            line-height: 1.8;
            color: #2d3748;
            background-color: #ffffff;
            max-width: 900px;
            margin: 0 auto;
            padding: 25px;
            box-sizing: border-box;
        }
        .document-header {
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 12px;
            margin-bottom: 25px;
            font-size: 14px;
            color: #718096;
        }
        .emergency-badge {
            background: #f56565;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            margin-left: 10px;
        }
        .document-content {
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 18px;
            line-height: 1.8;
        }
        @media (max-width: 768px) {
            body {
                padding: 20px;
                font-size: 17px;
            }
            .document-content {
                font-size: 17px;
            }
        }
        @media print {
            body {
                font-size: 14px;
                line-height: 1.6;
                max-width: none;
                margin: 0;
                padding: 15px;
            }
        }
    </style>
</head>
<body>
    <div class="document-header">
        <strong>Medical Document:</strong> ${fileName}
        <span class="emergency-badge">EMERGENCY ACCESS</span>
        ${
          properties.metadata?.originalPdfFileName
            ? `<br><em>Converted from PDF: ${properties.metadata.originalPdfFileName}</em>`
            : ""
        }
        ${
          properties.metadata?.originalRtfFileName
            ? `<br><em>Converted from RTF: ${properties.metadata.originalRtfFileName}</em>`
            : ""
        }
    </div>
    <div class="document-content">${textContent
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</div>
</body>
</html>`;

        // Send the enhanced HTML content
        return res.send(htmlContent);
      } catch (error) {
        console.error("Text file processing error:", error);
        // Fallback to original streaming if there's an error
        res.setHeader("Content-Type", contentType);
        downloadResponse.readableStreamBody.pipe(res);
        return;
      }
    } else {
      // For non-text files, use original streaming
      downloadResponse.readableStreamBody.pipe(res);
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("File view error:", error);
    }
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Server Error</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
            text-align: center; 
            padding: 20px; 
            background: #f5f5f5; 
            margin: 0;
          }
          .error-box { 
            background: white; 
            border-radius: 8px; 
            padding: 2rem; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
            max-width: 400px; 
            margin: 0 auto; 
          }
        </style>
      </head>
      <body>
        <div class="error-box">
          <h1>Server Error</h1>
          <p>An error occurred while accessing the medical file.</p>
          <button onclick="window.history.back()">Go Back</button>
        </div>
      </body>
      </html>
    `);
  }
};

// ============================================================================
// ADMIN API ENDPOINTS (Authentication Required) - UNCHANGED
// ============================================================================

// Get unclaimed tokens
exports.getUnclaimedTokens = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    await pool.connect();

    const result = await pool.request().query(`
      SELECT smartTokenId, secureChipId, productCode, devId, createdAt, status
      FROM SmartTokens 
      WHERE status = 'unclaimed' 
      ORDER BY createdAt DESC
    `);

    res.json({
      success: true,
      tokens: result.recordset,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in getUnclaimedTokens:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch unclaimed tokens",
    });
  }
};

// Get all tokens with user associations
exports.getAllAssignedTokens = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    await pool.connect();

    const result = await pool.request().query(`
      SELECT 
        st.smartTokenId,
        st.secureChipId,
        st.productCode,
        st.containerName,
        st.folderName,
        st.patientName,
        st.patientDateOfBirth,
        st.status,
        st.assignedAt,
        st.createdAt,
        pu.name as patientUserName,
        pu.username as patientUsername,
        pu.userId as patientUserId,
        du.name as doctorName,
        du.username as doctorUsername,
        du.userId as doctorUserId,
        ISNULL(df.registeredDevices, 0) as registeredDevices
      FROM SmartTokens st
      LEFT JOIN Users pu ON st.patientUserId = pu.userId
      LEFT JOIN Users du ON st.doctorUserId = du.userId
      LEFT JOIN (
        SELECT userId, COUNT(*) as registeredDevices
        FROM DeviceFingerprints 
        WHERE isActive = 1
        GROUP BY userId
      ) df ON st.patientUserId = df.userId
      WHERE st.status = 'assigned'
      ORDER BY st.createdAt DESC
    `);

    res.json({
      success: true,
      tokens: result.recordset,
    });
  } catch (error) {
    console.error("Error getting all tokens with users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tokens with user associations",
    });
  }
};

// Get patients for assignment dropdown
exports.getPatientsForAssignment = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    await pool.connect();

    const result = await pool.request().query(`
      SELECT 
        u.userId,
        u.name,
        u.username,
        u.role,
        COUNT(st.smartTokenId) as assignedTokens
      FROM Users u
      LEFT JOIN SmartTokens st ON u.userId = st.patientUserId AND st.status = 'assigned'
      WHERE u.role = 'patient'
      GROUP BY u.userId, u.name, u.username, u.role
      ORDER BY u.name
    `);

    res.json({
      success: true,
      patients: result.recordset,
    });
  } catch (error) {
    console.error("Error getting patients:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch patients",
    });
  }
};

// Get doctors for patient
exports.getDoctorsForPatient = async (req, res) => {
  try {
    const { patientUserId } = req.params;

    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    await pool.connect();

    const result = await pool.request().input("patientUserId", patientUserId)
      .query(`
        SELECT DISTINCT
          u.userId,
          u.name,
          u.username,
          u.role
        FROM Users u
        WHERE u.role = 'doctor'
        ORDER BY u.name
      `);

    res.json({
      success: true,
      doctors: result.recordset,
    });
  } catch (error) {
    console.error("Error getting doctors for patient:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch doctors for patient",
    });
  }
};

// Enhanced token assignment
exports.assignTokenEnhanced = async (req, res) => {
  try {
    const {
      tokenId,
      containerName,
      folderName,
      patientName,
      patientDateOfBirth,
      patientUserId,
      doctorUserId,
    } = req.body;

    if (!tokenId || !containerName || !folderName) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    await pool.connect();

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Verify patient user exists if provided
      if (patientUserId) {
        const patientCheck = await transaction
          .request()
          .input("patientUserId", patientUserId)
          .query(
            "SELECT userId, name FROM Users WHERE userId = @patientUserId AND role = 'patient'"
          );

        if (patientCheck.recordset.length === 0) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: "Invalid patient user selected",
          });
        }
      }

      // Verify doctor user exists if provided
      if (doctorUserId) {
        const doctorCheck = await transaction
          .request()
          .input("doctorUserId", doctorUserId)
          .query(
            "SELECT userId, name FROM Users WHERE userId = @doctorUserId AND role = 'doctor'"
          );

        if (doctorCheck.recordset.length === 0) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: "Invalid doctor user selected",
          });
        }
      }

      // Check if the patient folder is already assigned to another token
      const existingAssignment = await transaction
        .request()
        .input("containerName", containerName)
        .input("folderName", folderName)
        .input("currentTokenId", tokenId).query(`
          SELECT smartTokenId, patientName, assignedAt, status, patientUserId, doctorUserId
          FROM SmartTokens 
          WHERE containerName = @containerName 
            AND folderName = @folderName 
            AND smartTokenId != @currentTokenId
            AND status = 'assigned'
        `);

      let previousTokenInfo = null;

      // If patient folder is already assigned to another token, revoke the old assignment
      if (existingAssignment.recordset.length > 0) {
        const existingToken = existingAssignment.recordset[0];
        previousTokenInfo = {
          tokenId: existingToken.smartTokenId,
          patientName: existingToken.patientName,
          assignedAt: existingToken.assignedAt,
          patientUserId: existingToken.patientUserId,
          doctorUserId: existingToken.doctorUserId,
        };

        // Revoke the existing token assignment
        await transaction
          .request()
          .input("existingTokenId", existingToken.smartTokenId)
          .input("revokeReason", "Patient folder reassigned to new token")
          .input("revokedBy", req.user.name || "System").query(`
            UPDATE SmartTokens 
            SET status = 'revoked',
                revokedAt = GETDATE(),
                revokedBy = @revokedBy,
                revokeReason = @revokeReason
            WHERE smartTokenId = @existingTokenId
          `);
      }

      // Check if the current token exists and its status
      const currentTokenCheck = await transaction
        .request()
        .input("tokenId", tokenId).query(`
          SELECT containerName, folderName, patientName, status
          FROM SmartTokens 
          WHERE smartTokenId = @tokenId
        `);

      if (currentTokenCheck.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "Token not found",
        });
      }

      const currentToken = currentTokenCheck.recordset[0];

      // Check if token is already revoked
      if (currentToken.status === "revoked") {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message:
            "Cannot assign a revoked token. Please reactivate the token first.",
        });
      }

      // Assign the token to the new patient folder with user linking
      await transaction
        .request()
        .input("smartTokenId", tokenId)
        .input("containerName", containerName)
        .input("folderName", folderName)
        .input("patientName", patientName)
        .input("patientDateOfBirth", patientDateOfBirth || null)
        .input("patientUserId", patientUserId || null)
        .input("doctorUserId", doctorUserId || null).query(`
          UPDATE SmartTokens 
          SET containerName = @containerName, 
              folderName = @folderName,
              patientName = @patientName,
              patientDateOfBirth = @patientDateOfBirth,
              patientUserId = @patientUserId,
              doctorUserId = @doctorUserId,
              status = 'assigned', 
              assignedAt = GETDATE()
          WHERE smartTokenId = @smartTokenId
        `);

      await transaction.commit();

      let message = "Token assigned to patient successfully";
      let additionalInfo = {};

      if (previousTokenInfo) {
        message = "Patient folder reassigned successfully";
        additionalInfo = {
          reassignment: true,
          previousToken: {
            tokenId:
              previousTokenInfo.tokenId.substring(0, 8) +
              "..." +
              previousTokenInfo.tokenId.substring(
                previousTokenInfo.tokenId.length - 8
              ),
            patientName: previousTokenInfo.patientName,
            assignedAt: previousTokenInfo.assignedAt,
          },
          message: `Previous token has been automatically revoked and this patient folder is now assigned to the new token.`,
        };
      }

      res.json({
        success: true,
        message: message,
        tokenId: tokenId,
        patientFolder: `${containerName}/${folderName}`,
        patientName: patientName,
        patientUserId: patientUserId,
        doctorUserId: doctorUserId,
        assignedAt: new Date().toISOString(),
        assignedBy: req.user.name,
        ...additionalInfo,
      });
    } catch (transactionError) {
      await transaction.rollback();
      throw transactionError;
    }
  } catch (error) {
    console.error("Error assigning token:", error);
    res.status(500).json({
      success: false,
      message: "Failed to assign token",
      error:
        process.env.NODE_ENV === "development" ? error.message : "Server error",
    });
  }
};

// Get assigned folders for container
exports.getAssignedFolders = async (req, res) => {
  try {
    const { containerName } = req.params;

    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    await pool.connect();

    const result = await pool.request().input("containerName", containerName)
      .query(`
        SELECT 
          folderName, 
          smartTokenId, 
          patientName, 
          assignedAt,
          status
        FROM SmartTokens 
        WHERE containerName = @containerName 
          AND status = 'assigned'
          AND folderName IS NOT NULL
      `);

    // Create a map of assigned folders
    const assignedFolders = {};
    result.recordset.forEach((record) => {
      assignedFolders[record.folderName] = {
        tokenId: record.smartTokenId,
        patientName: record.patientName,
        assignedAt: record.assignedAt,
        status: record.status,
      };
    });

    res.json({
      success: true,
      assignedFolders: assignedFolders,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in getAssignedFolders:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch assigned folders",
      error:
        process.env.NODE_ENV === "development" ? error.message : "Server error",
    });
  }
};

// Delete token
exports.deleteSmartToken = async (req, res) => {
  try {
    const { tokenId } = req.params;

    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    await pool.connect();

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Check if token exists
      const tokenCheck = await transaction
        .request()
        .input("smartTokenId", tokenId)
        .query("SELECT * FROM SmartTokens WHERE smartTokenId = @smartTokenId");

      if (tokenCheck.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "Token not found",
        });
      }

      const token = tokenCheck.recordset[0];

      const tokenInfo = {
        tokenId: token.smartTokenId,
        patientName: token.patientName,
        containerName: token.containerName,
        folderName: token.folderName,
        status: token.status,
        assignedAt: token.assignedAt,
      };

      // Delete the token completely from database
      await transaction
        .request()
        .input("smartTokenId", tokenId)
        .query("DELETE FROM SmartTokens WHERE smartTokenId = @smartTokenId");

      await transaction.commit();

      res.json({
        success: true,
        message: "SmartToken deleted permanently",
        deletedToken: {
          tokenId:
            tokenInfo.tokenId.substring(0, 8) +
            "..." +
            tokenInfo.tokenId.substring(tokenInfo.tokenId.length - 8),
          patientName: tokenInfo.patientName,
          patientFolder:
            tokenInfo.containerName && tokenInfo.folderName
              ? `${tokenInfo.containerName}/${tokenInfo.folderName}`
              : "Not assigned",
          status: tokenInfo.status,
        },
        deletedAt: new Date().toISOString(),
        deletedBy: req.user.name,
      });
    } catch (transactionError) {
      await transaction.rollback();
      throw transactionError;
    }
  } catch (error) {
    console.error("Error deleting token:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete token",
    });
  }
};

// Revoke token
exports.revokeSmartToken = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const { tokenId, reason } = req.body;

    if (!tokenId) {
      return res.status(400).json({
        success: false,
        message: "Token ID is required",
      });
    }

    await pool.connect();

    // Check if token exists and is not already revoked
    const tokenCheck = await pool
      .request()
      .input("smartTokenId", tokenId)
      .query("SELECT * FROM SmartTokens WHERE smartTokenId = @smartTokenId");

    if (tokenCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Token not found",
      });
    }

    const token = tokenCheck.recordset[0];

    if (token.status === "revoked") {
      return res.status(400).json({
        success: false,
        message: "Token is already revoked",
      });
    }

    // Revoke the token
    await pool
      .request()
      .input("smartTokenId", tokenId)
      .input("revokedBy", req.user.userId)
      .input("revokeReason", reason || "Remotely disconnected by administrator")
      .query(`
        UPDATE SmartTokens 
        SET status = 'revoked',
            revokedAt = GETDATE(),
            revokedBy = @revokedBy,
            revokeReason = @revokeReason
        WHERE smartTokenId = @smartTokenId
      `);

    res.json({
      success: true,
      message: `SmartToken ${tokenId} has been remotely disconnected`,
      tokenId: tokenId,
      revokedBy: req.user.name,
      revokedAt: new Date().toISOString(),
      reason: reason || "Remotely disconnected by administrator",
    });
  } catch (error) {
    console.error("Error revoking token:", error);
    res.status(500).json({
      success: false,
      message: "Failed to revoke token",
    });
  }
};

// Reactivate token
exports.reactivateSmartToken = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const { tokenId } = req.body;

    if (!tokenId) {
      return res.status(400).json({
        success: false,
        message: "Token ID is required",
      });
    }

    await pool.connect();

    // Check if token exists and is revoked
    const tokenCheck = await pool
      .request()
      .input("smartTokenId", tokenId)
      .query("SELECT * FROM SmartTokens WHERE smartTokenId = @smartTokenId");

    if (tokenCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Token not found",
      });
    }

    const token = tokenCheck.recordset[0];

    if (token.status !== "revoked") {
      return res.status(400).json({
        success: false,
        message: "Token is not currently revoked",
      });
    }

    // Reactivate the token
    await pool.request().input("smartTokenId", tokenId).query(`
        UPDATE SmartTokens 
        SET status = 'assigned',
            revokedAt = NULL,
            revokedBy = NULL,
            revokeReason = NULL
        WHERE smartTokenId = @smartTokenId
      `);

    res.json({
      success: true,
      message: `SmartToken ${tokenId} has been reactivated`,
      tokenId: tokenId,
      reactivatedBy: req.user.name,
      reactivatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error reactivating token:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reactivate token",
    });
  }
};

// Get SmartToken logs
exports.getSmartTokenLogs = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const {
      tokenId,
      containerName,
      folderName,
      ipAddress,
      accessMode,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = req.query;

    await pool.connect();

    // First, get the total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM TokenAccessLog tal 
      LEFT JOIN SmartTokens st ON tal.tokenId = st.smartTokenId 
      WHERE 1=1`;

    const countParams = [];

    if (tokenId) {
      countQuery += " AND tal.tokenId = @tokenId";
      countParams.push({ name: "tokenId", value: tokenId });
    }

    if (containerName) {
      countQuery += " AND tal.containerName = @containerName";
      countParams.push({ name: "containerName", value: containerName });
    }

    if (folderName) {
      countQuery += " AND tal.folderName = @folderName";
      countParams.push({ name: "folderName", value: folderName });
    }

    if (ipAddress) {
      countQuery += " AND tal.ipAddress = @ipAddress";
      countParams.push({ name: "ipAddress", value: ipAddress });
    }

    if (accessMode) {
      countQuery += " AND tal.accessMode = @accessMode";
      countParams.push({ name: "accessMode", value: accessMode });
    }

    if (startDate) {
      countQuery += " AND tal.accessTime >= @startDate";
      countParams.push({ name: "startDate", value: new Date(startDate) });
    }

    if (endDate) {
      countQuery += " AND tal.accessTime <= @endDate";
      countParams.push({ name: "endDate", value: new Date(endDate) });
    }

    // Get total count
    const countRequest = pool.request();
    countParams.forEach((param) => {
      countRequest.input(param.name, param.value);
    });
    const countResult = await countRequest.query(countQuery);
    const totalCount = countResult.recordset[0].total;

    // Query TokenAccessLog with SmartTokens data
    let query = `
      SELECT 
        tal.tokenId,
        tal.containerName,
        tal.folderName,
        tal.ipAddress,
        tal.accessMode,
        tal.accessTime,
        st.patientName,
        st.status as tokenStatus,
        st.assignedAt
      FROM TokenAccessLog tal 
      LEFT JOIN SmartTokens st ON tal.tokenId = st.smartTokenId 
      WHERE 1=1`;

    const queryParams = [];

    if (tokenId) {
      query += " AND tal.tokenId = @tokenId";
      queryParams.push({ name: "tokenId", value: tokenId });
    }

    if (containerName) {
      query += " AND tal.containerName = @containerName";
      queryParams.push({ name: "containerName", value: containerName });
    }

    if (folderName) {
      query += " AND tal.folderName = @folderName";
      queryParams.push({ name: "folderName", value: folderName });
    }

    if (ipAddress) {
      query += " AND tal.ipAddress = @ipAddress";
      queryParams.push({ name: "ipAddress", value: ipAddress });
    }

    if (accessMode) {
      query += " AND tal.accessMode = @accessMode";
      queryParams.push({ name: "accessMode", value: accessMode });
    }

    if (startDate) {
      query += " AND tal.accessTime >= @startDate";
      queryParams.push({ name: "startDate", value: new Date(startDate) });
    }

    if (endDate) {
      query += " AND tal.accessTime <= @endDate";
      queryParams.push({ name: "endDate", value: new Date(endDate) });
    }

    query +=
      " ORDER BY tal.accessTime DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
    queryParams.push({ name: "offset", value: parseInt(offset) });
    queryParams.push({ name: "limit", value: parseInt(limit) });

    const request = pool.request();
    queryParams.forEach((param) => {
      request.input(param.name, param.value);
    });

    const result = await request.query(query);

    res.json({
      success: true,
      logs: result.recordset,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: totalCount,
        currentPage: Math.floor(parseInt(offset) / parseInt(limit)) + 1,
        totalPages: Math.ceil(totalCount / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching SmartToken logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch SmartToken logs",
    });
  }
};

// Get user's tokens
exports.getMyTokens = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    await pool.connect();

    let query;
    const params = [{ name: "userId", value: req.user.userId }];

    if (req.user.role === "patient") {
      query = `
        SELECT 
          st.smartTokenId,
          st.secureChipId,
          st.containerName,
          st.folderName,
          st.patientName,
          st.patientDateOfBirth,
          st.status,
          st.assignedAt,
          st.createdAt,
          du.name as doctorName,
          du.username as doctorUsername
        FROM SmartTokens st
        LEFT JOIN Users du ON st.doctorUserId = du.userId
        WHERE st.patientUserId = @userId 
        AND st.status = 'assigned'
        ORDER BY st.assignedAt DESC
      `;
    } else if (req.user.role === "doctor") {
      query = `
        SELECT 
          st.smartTokenId,
          st.secureChipId,
          st.containerName,
          st.folderName,
          st.patientName,
          st.patientDateOfBirth,
          st.status,
          st.assignedAt,
          st.createdAt,
          pu.name as patientUserName,
          pu.username as patientUsername
        FROM SmartTokens st
        LEFT JOIN Users pu ON st.patientUserId = pu.userId
        WHERE st.doctorUserId = @userId 
        AND st.status = 'assigned'
        ORDER BY st.assignedAt DESC
      `;
    } else {
      return res.status(403).json({
        success: false,
        message: "Access denied for this role",
      });
    }

    const request = pool.request();
    params.forEach((param) => {
      request.input(param.name, param.value);
    });

    const result = await request.query(query);

    res.json({
      success: true,
      tokens: result.recordset,
      userRole: req.user.role,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting user tokens:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user tokens",
    });
  }
};

// Get my alerts (using recent access logs as alerts)
exports.getMyAlerts = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    await pool.connect();

    let query;
    const params = [
      { name: "userId", value: req.user.userId },
      {
        name: "recentDate",
        value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    ];

    if (req.user.role === "patient") {
      query = `
        SELECT TOP 20
          'token_access' as alertType,
          'Your medical records were accessed' as message,
          'info' as severity,
          0 as isRead,
          tal.accessTime as createdAt,
          tal.tokenId,
          st.patientName,
          st.containerName,
          st.folderName,
          tal.ipAddress,
          tal.accessMode
        FROM TokenAccessLog tal
        JOIN SmartTokens st ON tal.tokenId = st.smartTokenId
        WHERE st.patientUserId = @userId
        AND tal.accessTime >= @recentDate
        ORDER BY tal.accessTime DESC
      `;
    } else if (req.user.role === "doctor") {
      query = `
        SELECT TOP 20
          'patient_token_access' as alertType,
          'Patient medical records were accessed: ' + st.patientName as message,
          'info' as severity,
          0 as isRead,
          tal.accessTime as createdAt,
          tal.tokenId,
          st.patientName,
          st.containerName,
          st.folderName,
          tal.ipAddress,
          tal.accessMode
        FROM TokenAccessLog tal
        JOIN SmartTokens st ON tal.tokenId = st.smartTokenId
        WHERE st.doctorUserId = @userId
        AND tal.accessTime >= @recentDate
        ORDER BY tal.accessTime DESC
      `;
    } else {
      return res.status(403).json({
        success: false,
        message: "Access denied for this role",
      });
    }

    const request = pool.request();
    params.forEach((param) => {
      request.input(param.name, param.value);
    });

    const result = await request.query(query);

    const alertsWithIds = result.recordset.map((alert, index) => ({
      ...alert,
      alertId: `temp_${alert.tokenId}_${alert.createdAt.getTime()}_${index}`,
    }));

    res.json({
      success: true,
      alerts: alertsWithIds,
      userRole: req.user.role,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting user alerts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user alerts",
    });
  }
};

// Mark alert as read (placeholder)
exports.markAlertAsRead = async (req, res) => {
  try {
    const { alertId } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    res.json({
      success: true,
      message: "Alert marked as read",
      alertId: alertId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error marking alert as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark alert as read",
    });
  }
};

// Get device logs for a token
exports.getDeviceLogs = async (req, res) => {
  try {
    const { tokenId } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    await pool.connect();

    let verifyQuery;
    const verifyParams = [
      { name: "tokenId", value: tokenId },
      { name: "userId", value: req.user.userId },
    ];

    if (req.user.role === "patient") {
      verifyQuery = `
        SELECT smartTokenId 
        FROM SmartTokens 
        WHERE smartTokenId = @tokenId AND patientUserId = @userId
      `;
    } else if (req.user.role === "doctor") {
      verifyQuery = `
        SELECT smartTokenId 
        FROM SmartTokens 
        WHERE smartTokenId = @tokenId AND doctorUserId = @userId
      `;
    } else {
      return res.status(403).json({
        success: false,
        message: "Access denied for this role",
      });
    }

    const verifyRequest = pool.request();
    verifyParams.forEach((param) => {
      verifyRequest.input(param.name, param.value);
    });

    const verifyResult = await verifyRequest.query(verifyQuery);

    if (verifyResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Token not found or access denied",
      });
    }

    const logsRequest = pool.request();
    logsRequest.input("tokenId", tokenId);

    const logsResult = await logsRequest.query(`
      SELECT 
        tal.accessTime,
        tal.ipAddress,
        tal.accessMode,
        tal.containerName,
        tal.folderName,
        'Unknown' as deviceName,
        'Web' as deviceType,
        1 as deviceIsActive
      FROM TokenAccessLog tal
      WHERE tal.tokenId = @tokenId
      ORDER BY tal.accessTime DESC
    `);

    res.json({
      success: true,
      logs: logsResult.recordset,
      tokenId: tokenId,
      userRole: req.user.role,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting device logs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch device logs",
    });
  }
};

exports.triggerManualEmergencyAlert = async (req, res) => {
  try {
    const { id } = req.params; // Token ID
    const {
      patientName,
      alertType = "manual_emergency_alert",
      deviceInfo,
      locationData,
      triggerSource = "patient_emergency_button",
    } = req.body;

    console.log(`🚨 MANUAL EMERGENCY ALERT TRIGGERED:`);
    console.log(`   - Token: ${id}`);
    console.log(`   - Patient: ${patientName}`);
    console.log(`   - Trigger: ${triggerSource}`);

    // Get token information from database
    await pool.connect();

    const tokenResult = await pool
      .request()
      .input("smartTokenId", sql.NVarChar, id).query(`
        SELECT 
          st.smartTokenId,
          st.patientUserId,
          st.patientName,
          st.containerName,
          st.folderName,
          st.status
        FROM SmartTokens st
        WHERE st.smartTokenId = @smartTokenId
      `);

    if (tokenResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "SmartToken not found",
        error: "TOKEN_NOT_FOUND",
      });
    }

    const token = tokenResult.recordset[0];

    if (token.status !== "assigned") {
      return res.status(400).json({
        success: false,
        message: "SmartToken is not assigned to a patient",
        error: "TOKEN_NOT_ASSIGNED",
      });
    }

    console.log(`✅ Token validated for manual emergency alert:`);
    console.log(`   - Patient ID: ${token.patientUserId}`);
    console.log(`   - Patient Name: ${token.patientName}`);
    let finalLocationData = locationData;
    if (!finalLocationData || !finalLocationData.city) {
      console.log(`🌐 Getting IP location for manual alert...`);
      finalLocationData = await getIPLocationForDevice(getRealUserIP(req));
      console.log(
        `🌐 Manual alert IP Location:`,
        finalLocationData
          ? `${finalLocationData.city}, ${finalLocationData.country}`
          : "Not available"
      );
    }
    // Trigger the emergency alert system
    const alertResult = await triggerEmergencyAlerts(
      id,
      token.patientUserId,
      token.patientName || patientName,
      null, // enhancedLogId - will be created in the function
      {
        ...deviceInfo,
        alertType: alertType,
        triggerSource: triggerSource,
        manualTrigger: true,
        visitorId: "manual_trigger",
        service: "manual_emergency_alert",
        confidence: 1.0,
        timestamp: new Date().toISOString(),
        ipLocation: finalLocationData, // ✅ Include IP location
        hasLocation: !!finalLocationData,
      },
      finalLocationData,
      req
    );

    // Log the manual trigger event
    try {
      await pool
        .request()
        .input("tokenId", sql.NVarChar, id)
        .input("patientUserId", sql.Int, token.patientUserId)
        .input("patientName", sql.NVarChar, token.patientName)
        .input("accessMode", sql.NVarChar, "manual_emergency_alert")
        .input("ipAddress", sql.NVarChar, getRealUserIP(req))
        .input("userAgent", sql.NVarChar, req.headers["user-agent"] || "")
        .input("deviceInfo", sql.NVarChar, JSON.stringify(deviceInfo))
        .input("locationData", sql.NVarChar, JSON.stringify(locationData))
        .query(`
          INSERT INTO EnhancedTokenAccessLog (
            tokenId, patientUserId, accessMode, ipAddress, userAgent,
            deviceFingerprint, visitorId, fingerprintService, 
            isRegisteredDevice, accessTime
          )
          VALUES (
            @tokenId, @patientUserId, @accessMode, @ipAddress, @userAgent,
            @deviceInfo, 'manual_trigger', 'manual_emergency_alert',
            1, GETDATE()
          )
        `);

      console.log("📝 Manual emergency alert trigger logged");
    } catch (logError) {
      console.error("❌ Error logging manual emergency alert:", logError);
      // Don't fail the request if logging fails
    }

    if (alertResult.success) {
      console.log("✅ Manual emergency alert sent successfully");

      res.json({
        success: true,
        message: "Emergency alert sent successfully",
        alertId: alertResult.alertId,
        patientName: token.patientName,
        contactCount: alertResult.contactCount,
        smsSuccessful: alertResult.smsSuccessful,
        smsFailed: alertResult.smsFailed,
        deliveryStatus: alertResult.deliveryStatus,
        triggerSource: triggerSource,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.error("❌ Manual emergency alert failed:", alertResult.reason);

      res.status(500).json({
        success: false,
        message: "Failed to send emergency alert",
        error: alertResult.reason || "Unknown error",
        reason: alertResult.reason,
        contactCount: alertResult.contactCount || 0,
        patientUserId: token.patientUserId,
      });
    }
  } catch (error) {
    console.error("❌ CRITICAL ERROR in manual emergency alert:", error);

    res.status(500).json({
      success: false,
      message: "System error while sending emergency alert",
      error: error.message,
      critical: true,
    });
  }
};

// New endpoint: Handle timer expiration and send automatic alert
exports.handleTimerExpiration = async (req, res) => {
  try {
    const { id } = req.params; // Token ID
    const {
      patientName,
      deviceInfo,
      locationData,
      timerExpired = true,
    } = req.body;

    console.log(`⏰ TIMER-BASED EMERGENCY ALERT TRIGGERED:`);
    console.log(`   - Token: ${id}`);
    console.log(`   - Patient: ${patientName}`);
    console.log(`   - Timer Expired: ${timerExpired}`);

    // Get token information from database
    await pool.connect();

    const tokenResult = await pool
      .request()
      .input("smartTokenId", sql.NVarChar, id).query(`
        SELECT 
          st.smartTokenId,
          st.patientUserId,
          st.patientName,
          st.containerName,
          st.folderName,
          st.status
        FROM SmartTokens st
        WHERE st.smartTokenId = @smartTokenId
      `);

    if (tokenResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "SmartToken not found",
        error: "TOKEN_NOT_FOUND",
      });
    }

    const token = tokenResult.recordset[0];

    if (token.status !== "assigned") {
      return res.status(400).json({
        success: false,
        message: "SmartToken is not assigned to a patient",
        error: "TOKEN_NOT_ASSIGNED",
      });
    }

    console.log(`✅ Token validated for timer-based emergency alert:`);
    console.log(`   - Patient ID: ${token.patientUserId}`);
    console.log(`   - Patient Name: ${token.patientName}`);

    console.log(`🌐 Getting combined location for timer-based alert...`);
    const combinedLocationData = await getCombinedLocationData(req);
    const primaryLocation = combinedLocationData.primaryLocation;
    console.log(
      `🌐 Timer alert combined location:`,
      primaryLocation
        ? `${primaryLocation.city || "Unknown"}, ${
            primaryLocation.country || "Unknown"
          } (${primaryLocation.latitude || "N/A"}, ${
            primaryLocation.longitude || "N/A"
          }) [${primaryLocation.type}]`
        : "Not available"
    );

    // Trigger the emergency alert system for timer expiration
    const alertResult = await triggerEmergencyAlerts(
      id,
      token.patientUserId,
      token.patientName || patientName,
      null, // enhancedLogId - will be created in the function
      {
        ...deviceInfo,
        alertType: "timer_based_emergency_alert",
        triggerSource: "10_second_timer_expiration",
        timerBased: true,
        visitorId: deviceInfo.visitorId || "timer_trigger",
        service: "timer_emergency_alert",
        confidence: deviceInfo.confidence || 1.0,
        timestamp: new Date().toISOString(),
        combinedLocation: combinedLocationData, // ✅ Include full location data
        ipLocation: combinedLocationData.ipLocation,
        gpsLocation: combinedLocationData.gpsLocation,
        hasLocation: combinedLocationData.hasGPS || combinedLocationData.hasIP,
      },
      primaryLocation, // ✅ Updated
      req
    );

    // Log the timer trigger event
    try {
      await pool
        .request()
        .input("tokenId", sql.NVarChar, id)
        .input("patientUserId", sql.Int, token.patientUserId)
        .input("patientName", sql.NVarChar, token.patientName)
        .input("accessMode", sql.NVarChar, "timer_emergency_alert")
        .input("ipAddress", sql.NVarChar, getRealUserIP(req))
        .input("userAgent", sql.NVarChar, req.headers["user-agent"] || "")
        .input("deviceInfo", sql.NVarChar, JSON.stringify(deviceInfo))
        .input("locationData", sql.NVarChar, JSON.stringify(locationData))
        .query(`
          INSERT INTO EnhancedTokenAccessLog (
            tokenId, patientUserId, accessMode, ipAddress, userAgent,
            deviceFingerprint, visitorId, fingerprintService, 
            isRegisteredDevice, accessTime
          )
          VALUES (
            @tokenId, @patientUserId, @accessMode, @ipAddress, @userAgent,
            @deviceInfo, 'timer_trigger', 'timer_emergency_alert',
            1, GETDATE()
          )
        `);

      console.log("📝 Timer-based emergency alert trigger logged");
    } catch (logError) {
      console.error("❌ Error logging timer emergency alert:", logError);
      // Don't fail the request if logging fails
    }

    if (alertResult.success) {
      console.log("✅ Timer-based emergency alert sent successfully");

      res.json({
        success: true,
        message: "Timer-based emergency alert sent successfully",
        alertId: alertResult.alertId,
        patientName: token.patientName,
        contactCount: alertResult.contactCount,
        smsSuccessful: alertResult.smsSuccessful,
        smsFailed: alertResult.smsFailed,
        deliveryStatus: alertResult.deliveryStatus,
        triggerSource: "10_second_timer_expiration",
        timestamp: new Date().toISOString(),
      });
    } else {
      console.error(
        "❌ Timer-based emergency alert failed:",
        alertResult.reason
      );

      res.status(500).json({
        success: false,
        message: "Failed to send timer-based emergency alert",
        error: alertResult.reason || "Unknown error",
        reason: alertResult.reason,
        contactCount: alertResult.contactCount || 0,
        patientUserId: token.patientUserId,
      });
    }
  } catch (error) {
    console.error("❌ CRITICAL ERROR in timer-based emergency alert:", error);

    res.status(500).json({
      success: false,
      message: "System error while sending timer-based emergency alert",
      error: error.message,
      critical: true,
    });
  }
};

// New endpoint: Get patient data after timer (cancelled or expired)
exports.getPatientDataAfterTimer = async (req, res) => {
  try {
    const { id } = req.params; // Token ID
    const { cancelled = false } = req.query;

    console.log(`📄 PATIENT DATA ACCESS AFTER TIMER:`);
    console.log(`   - Token: ${id}`);
    console.log(`   - Timer Cancelled: ${cancelled}`);

    // Get token information from database
    await pool.connect();

    const tokenResult = await pool
      .request()
      .input("smartTokenId", sql.NVarChar, id).query(`
        SELECT 
          st.smartTokenId,
          st.secureChipId,
          st.containerName,
          st.folderName,
          st.patientDateOfBirth,
          st.status,
          st.productCode,
          st.devId,
          COALESCE(u.name, st.patientName) as patientName,
          COALESCE(st.patientUserId, u.userId) as patientUserId
        FROM SmartTokens st
        LEFT JOIN Users u ON st.patientUserId = u.userId
        WHERE st.smartTokenId = @smartTokenId
      `);

    if (tokenResult.recordset.length === 0) {
      return res.status(404).render("error", {
        title: "Token Not Found",
        message: "SmartToken not found",
        errorCode: "TOKEN_NOT_FOUND",
      });
    }

    const token = tokenResult.recordset[0];

    if (
      token.status !== "assigned" ||
      !token.containerName ||
      !token.folderName
    ) {
      return res.status(400).render("error", {
        title: "Token Not Assigned",
        message: "SmartToken is not properly assigned to a patient",
        errorCode: "TOKEN_NOT_ASSIGNED",
      });
    }

    if (cancelled === "true" || cancelled === true) {
      console.log(
        `⏰ Timer was CANCELLED - checking if unregistered device alert needed`
      );

      // Get the most recent device verification for this token
      const recentVerification = await pool
        .request()
        .input("tokenId", sql.NVarChar, id)
        .input(
          "timeWindow",
          sql.DateTime,
          new Date(Date.now() - 10 * 60 * 1000)
        ) // Last 10 minutes
        .query(`
      SELECT TOP 1
        isRegisteredDevice,
        deviceName,
        accessTime,
        deviceType,
        visitorId
      FROM EnhancedTokenAccessLog
      WHERE tokenId = @tokenId
        AND accessTime > @timeWindow
      ORDER BY accessTime DESC
    `);

      const wasUnregisteredDevice =
        recentVerification.recordset.length > 0 &&
        !recentVerification.recordset[0].isRegisteredDevice;

      if (wasUnregisteredDevice) {
        console.log(
          `🚨 CANCELLED TIMER + UNREGISTERED DEVICE - Triggering alert`
        );

        // ✅ Get combined location for the alert
        const combinedLocationData = await getCombinedLocationData(req);
        const primaryLocation = combinedLocationData.primaryLocation;

        console.log(
          `🌐 Cancelled timer combined location:`,
          primaryLocation
            ? `${primaryLocation.city || "Unknown"}, ${
                primaryLocation.country || "Unknown"
              } [${primaryLocation.type}]`
            : "Not available"
        );

        // Trigger emergency alert for unregistered device (timer was cancelled)
        try {
          const alertResult = await triggerEmergencyAlerts(
            id,
            token.patientUserId,
            token.patientName,
            null, // enhancedLogId - will be created in the function
            {
              type: "desktop", // Can be determined from user agent if needed
              deviceType: "desktop",
              alertType: "unregistered_device_timer_cancelled",
              triggerSource: "timer_cancelled_unregistered_device",
              timerCancelled: true,
              visitorId:
                recentVerification.recordset[0].visitorId || "cancelled_timer",
              service: "timer_cancelled_alert",
              confidence: 1.0,
              timestamp: new Date().toISOString(),
              combinedLocation: combinedLocationData,
              ipLocation: combinedLocationData.ipLocation,
              gpsLocation: combinedLocationData.gpsLocation,
              hasLocation:
                combinedLocationData.hasGPS || combinedLocationData.hasIP,
            },
            primaryLocation, // ✅ Pass combined location data
            req
          );

          if (alertResult.success) {
            console.log(`✅ Cancelled timer alert sent successfully`);
          } else {
            console.error(
              `❌ Cancelled timer alert failed:`,
              alertResult.reason
            );
          }
        } catch (alertError) {
          console.error(
            "❌ Error triggering cancelled timer alert:",
            alertError
          );
        }
      } else {
        console.log(
          `✅ Timer cancelled but device was registered - no alert needed`
        );
      }
    } else {
      console.log(
        `⏰ Timer EXPIRED - alert was already sent in timer-expired endpoint`
      );
    }

    // Get patient files from Azure
    const patientFiles = await getPatientFilesFromAzure(
      token.containerName,
      token.folderName
    );

    // Files will use view-only access through the emergency endpoint
    const filesForDisplay = patientFiles.map((file) => ({
      ...file,
      emergencyAccess: true,
    }));

    // Log access for audit with real user IP
    await logTokenAccess(
      id,
      token.containerName,
      token.folderName,
      getRealUserIP(req),
      cancelled ? "timer_cancelled" : "timer_completed"
    );

    // Format patient date of birth
    const formattedDOB = formatDateOfBirth(token.patientDateOfBirth);

    // Create security notice for timer-based access
    let securityNotice = null;
    if (cancelled) {
      securityNotice = "Timer was cancelled - no emergency alert was sent.";
    } else {
      securityNotice =
        "Emergency contacts have been automatically notified after 10-second timer.";
    }

    // Render patient data page WITHOUT manual alert button
    return res.render("patientData", {
      title: `Patient Data - ${token.patientName || token.folderName}`,
      patientName: token.patientName || token.folderName,
      patientDateOfBirth: formattedDOB,
      containerName: token.containerName,
      folderName: token.folderName,
      files: filesForDisplay,
      isEmergencyAccess: true,
      accessTime: new Date().toISOString(),
      tokenId: id,
      formatFileSize: formatFileSize,
      isTimerBasedAccess: true, // NEW FLAG - tells template to hide manual alert button
      timerWasCancelled: cancelled,
      securityNotice: securityNotice,
      accessIP: getRealUserIP(req),
    });
  } catch (error) {
    console.error("❌ Error getting patient data after timer:", error);
    return res.status(500).render("error", {
      title: "System Error",
      message: "An error occurred while accessing patient data",
      errorCode: "SYSTEM_ERROR",
    });
  }
};

// Export the trigger function for use in other parts of the app
exports.triggerEmergencyAlerts = triggerEmergencyAlerts;

module.exports = exports;
