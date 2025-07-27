// controllers/consolidatedSmartTokenController.js - COMPLETE UNIFIED VERSION
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
// ENHANCED EMERGENCY ALERT SYSTEM
// ============================================================================

/**
 * Enhanced device fingerprinting and alert system
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
    const userAgent = req.headers["user-agent"] || "";
    const ipAddress = getRealUserIP(req);

    // ✅ IMPROVED VALIDATION (keep existing validation logic)
    const isValidPatientUserId =
      patientUserId &&
      (typeof patientUserId === "string" ||
        typeof patientUserId === "number") &&
      String(patientUserId).trim() !== "" &&
      String(patientUserId).trim() !== "null" &&
      String(patientUserId).trim() !== "undefined" &&
      !String(patientUserId).includes(",") &&
      !isNaN(parseInt(String(patientUserId))) &&
      parseInt(String(patientUserId)) > 0;

    const isValidPatientName =
      patientName &&
      typeof patientName === "string" &&
      patientName.trim() !== "" &&
      patientName.trim() !== "null" &&
      !patientName.includes(",");

    console.log(`🔍 FingerprintJS Pro Device Check Validation:`);
    console.log(
      `   - PatientUserId: "${patientUserId}" (valid: ${isValidPatientUserId})`
    );
    console.log(
      `   - PatientName: "${patientName}" (valid: ${isValidPatientName})`
    );

    if (!isValidPatientUserId) {
      console.log(
        `⚠️ SmartToken ${tokenId} accessed but no valid patientUserId. Skipping device check.`
      );
      return {
        isRegisteredDevice: false,
        deviceInfo: { type: "unknown", error: "No valid patient assignment" },
        enhancedLogId: null,
        alertsTriggered: false,
        skippedReason: "No valid patient assignment",
        tokenStatus: "unassigned",
        service: "fingerprintjs_pro",
      };
    }

    const cleanPatientUserId = parseInt(String(patientUserId));
    const cleanPatientName = isValidPatientName
      ? String(patientName).trim()
      : "Unknown Patient";

    console.log(
      `✅ Proceeding with FingerprintJS Pro device check for patient: ${cleanPatientUserId}`
    );

    // ✅ ENHANCED: Get comprehensive location data (keep existing location logic)
    let comprehensiveLocation;
    try {
      const gpsCoordinates = req.body?.gpsCoordinates || null;
      comprehensiveLocation = await locationService.getComprehensiveLocation(
        req,
        gpsCoordinates
      );
    } catch (locationError) {
      console.error("Error getting comprehensive location:", locationError);
      comprehensiveLocation = {
        primary: null,
        fallback: await locationService.getLocationFromIP(ipAddress),
        best: await locationService.getLocationFromIP(ipAddress),
        hasGPS: false,
        hasIP: true,
      };
    }

    // ✅ UPDATED: Check for FingerprintJS Pro client fingerprint
    let deviceFingerprint = null;
    let deviceMetadata = null;
    let usingClientFingerprint = false;

    // Try to get FingerprintJS Pro fingerprint from request body
    if (req.body && req.body.deviceFingerprint) {
      deviceFingerprint = req.body.deviceFingerprint;
      deviceMetadata = req.body.deviceMetadata;
      usingClientFingerprint = true;

      // ✅ NEW: Validate FingerprintJS Pro format
      if (deviceFingerprint.hash && deviceFingerprint.details) {
        console.log(
          `📱 Using FingerprintJS Pro fingerprint: ${deviceFingerprint.hash.substring(
            0,
            16
          )}...`
        );
        console.log(
          `   - Confidence: ${
            deviceFingerprint.metadata?.confidenceScore || "unknown"
          }`
        );
        console.log(
          `   - Method: ${deviceFingerprint.metadata?.method || "unknown"}`
        );
        console.log(
          `   - Service: ${deviceFingerprint.metadata?.service || "unknown"}`
        );
      } else {
        console.warn(`⚠️ Invalid FingerprintJS Pro format received`);
        usingClientFingerprint = false;
        deviceFingerprint = null;
      }
    }

    // ✅ UPDATED: Enhanced fallback fingerprint with FingerprintJS Pro compatibility
    if (!deviceFingerprint && !skipAlertsUntilClientFingerprint) {
      console.log(
        "📱 Generating FingerprintJS Pro compatible fallback fingerprint..."
      );
      // ✅ FIXED: Stable fingerprint
      const stableDeviceString = [
        userAgent,
        req.headers["accept-language"] || "",
        req.headers["accept-encoding"] || "",
        req.headers["accept"] || "",
      ].join("|");

      deviceFingerprint = {
        hash: require("crypto")
          .createHash("sha256")
          .update(stableDeviceString) // ← FIXED: No date dependency
          .digest("hex")
          .substring(0, 20),
        details: {
          userAgent: userAgent,
          ipAddress: ipAddress,
          timestamp: new Date().toISOString(),
          method: "fallback_server_side",
          isFallback: true,
        },
        metadata: {
          method: "server_fallback",
          service: "fallback_fingerprintjs_compatible",
          confidenceScore: 0.5, // Lower confidence for fallback
          consistency: "fallback_only",
        },
      };

      deviceMetadata = {
        deviceName: getDeviceNameFromUserAgent(userAgent),
        browserName: getBrowserFromUserAgent(userAgent),
        osName: getOSFromUserAgent(userAgent),
        deviceType: getDeviceTypeFromUserAgent(userAgent),
        method: "server_fallback",
        service: "fallback_fingerprintjs_compatible",
      };
    }

    // ✅ UPDATED: Early return for pending client verification
    if (!deviceFingerprint && skipAlertsUntilClientFingerprint) {
      console.log(
        "⏳ Waiting for FingerprintJS Pro client fingerprint before device check..."
      );
      return {
        isRegisteredDevice: null,
        deviceInfo: { type: "pending", waiting: "fingerprintjs_pro_client" },
        enhancedLogId: null,
        alertsTriggered: false,
        pendingClientVerification: true,
        service: "fingerprintjs_pro",
      };
    }

    await pool.connect();

    // ✅ UPDATED: Enhanced device lookup for FingerprintJS Pro
    console.log(`🔍 Checking FingerprintJS Pro device registration...`);
    console.log(`   - Visitor ID: ${deviceFingerprint.hash}`);
    console.log(`   - Patient ID: ${cleanPatientUserId}`);
    console.log(
      `   - Service: ${
        usingClientFingerprint ? "FingerprintJS Pro" : "Fallback"
      }`
    );
    console.log(
      `   - Confidence: ${deviceFingerprint.metadata?.confidenceScore || "N/A"}`
    );

    const deviceCheck = await pool
      .request()
      .input("fingerprintHash", sql.NVarChar, deviceFingerprint.hash)
      .input("userId", sql.Int, cleanPatientUserId)
      .input("userAgent", sql.NVarChar, userAgent)
      .input(
        "screenResolution",
        sql.NVarChar,
        deviceFingerprint.details?.screen
          ? `${deviceFingerprint.details.screen.width}x${deviceFingerprint.details.screen.height}`
          : "unknown"
      )
      .input(
        "platform",
        sql.NVarChar,
        deviceFingerprint.details?.platform || "unknown"
      ).query(`
    SELECT df.*, 
           CASE WHEN df.registeredBy = @userId THEN 1 ELSE 0 END as isOwnedByPatient
    FROM DeviceFingerprints df
    WHERE df.userId = @userId
      AND df.isActive = 1
      AND (
        JSON_VALUE(df.fingerprint, '$.hash') = @fingerprintHash
        OR (df.userAgent = @userAgent AND @userAgent != '' AND LEN(@userAgent) > 10)
        OR (@platform != 'unknown' AND df.platform = @platform AND df.platform IS NOT NULL)
      )
    ORDER BY 
      CASE 
        WHEN JSON_VALUE(df.fingerprint, '$.hash') = @fingerprintHash THEN 1 
        WHEN df.userAgent = @userAgent THEN 2
        ELSE 3 
      END,
      df.registeredAt DESC
  `);

    const isRegisteredDevice = deviceCheck.recordset.length > 0;

    console.log(`🔍 Device check results:`);
    console.log(
      `   - Found ${deviceCheck.recordset.length} matching device(s)`
    );
    console.log(`   - Is registered: ${isRegisteredDevice}`);

    if (deviceCheck.recordset.length > 0) {
      const device = deviceCheck.recordset[0];
      console.log(`   - Matched device: ${device.deviceName}`);
      console.log(`   - Registered: ${device.registeredAt}`);
      console.log(`   - Last updated: ${device.lastUpdated}`);
    }

    // ✅ ENHANCED: Create comprehensive device info with FingerprintJS Pro data
    const deviceInfo = {
      type: deviceMetadata?.deviceType || getDeviceTypeFromUserAgent(userAgent),
      browser:
        deviceMetadata?.browserName || getBrowserFromUserAgent(userAgent),
      os: deviceMetadata?.osName || getOSFromUserAgent(userAgent),
      deviceName:
        deviceMetadata?.deviceName || getDeviceNameFromUserAgent(userAgent),
      isRegistered: isRegisteredDevice,
      visitorId: deviceFingerprint.hash, // Use visitor ID instead of hash
      fingerprintHash: deviceFingerprint.hash, // Keep for backward compatibility
      method: deviceMetadata?.method || "unknown",
      service:
        deviceMetadata?.service ||
        (usingClientFingerprint ? "fingerprintjs_pro" : "fallback"),
      confidence: deviceFingerprint.metadata?.confidenceScore || 0,
      isLocalhost: isLocalhost(ipAddress),
      usingClientFingerprint: usingClientFingerprint,
      isFingerprintJSPro:
        usingClientFingerprint && !deviceFingerprint.details?.isFallback,
    };

    console.log(`🔍 FingerprintJS Pro device check results:`);
    console.log(
      `   - Found ${deviceCheck.recordset.length} matching device(s)`
    );
    console.log(`   - Is registered: ${isRegisteredDevice}`);
    console.log(`   - Device: ${deviceInfo.deviceName}`);
    console.log(`   - Browser: ${deviceInfo.browser} on ${deviceInfo.os}`);
    console.log(`   - Service: ${deviceInfo.service}`);
    console.log(`   - Confidence: ${deviceInfo.confidence}`);
    console.log(`   - Visitor ID: ${deviceInfo.visitorId}`);

    // ✅ UPDATED: Enhanced access logging with FingerprintJS Pro data
    const accessMode = usingClientFingerprint
      ? isRegisteredDevice
        ? "fpjs_registered"
        : "fpjs_unregistered"
      : isRegisteredDevice
      ? "fallback_registered"
      : "fallback_unregistered";

    const logResult = await pool
      .request()
      .input("tokenId", sql.NVarChar, tokenId)
      .input("containerName", sql.NVarChar, "patient-data")
      .input("folderName", sql.NVarChar, "emergency-access")
      .input("ipAddress", sql.NVarChar, ipAddress)
      .input("accessMode", sql.NVarChar, accessMode)
      .input(
        "deviceFingerprint",
        sql.NVarChar,
        JSON.stringify(deviceFingerprint)
      )
      .input("isRegisteredDevice", sql.Bit, isRegisteredDevice ? 1 : 0)
      .input("deviceName", sql.NVarChar, deviceInfo.deviceName)
      .input("deviceType", sql.NVarChar, deviceInfo.type)
      .input("patientUserId", sql.Int, cleanPatientUserId)
      .input("userAgent", sql.NVarChar, userAgent)
      .input(
        "locationData",
        sql.NVarChar,
        JSON.stringify(comprehensiveLocation.best)
      ).query(`
    INSERT INTO EnhancedTokenAccessLog (
      tokenId, containerName, folderName, ipAddress, accessMode,
      deviceFingerprint, isRegisteredDevice, deviceName, deviceType,
      patientUserId, userAgent, locationData, alertsSent
    )
    OUTPUT INSERTED.logId
    VALUES (
      @tokenId, @containerName, @folderName, @ipAddress, @accessMode,
      @deviceFingerprint, @isRegisteredDevice, @deviceName, @deviceType,
      @patientUserId, @userAgent, @locationData, 0
    )
  `);

    const enhancedLogId = logResult.recordset[0].logId;
    console.log(
      `📝 Enhanced FingerprintJS Pro access logged with ID: ${enhancedLogId}`
    );

    // ✅ UPDATED: Enhanced alert triggering for FingerprintJS Pro
    let alertsTriggered = false;
    if (!isRegisteredDevice) {
      console.log(`🚨 UNREGISTERED DEVICE DETECTED`);
      console.log(`   - Fingerprint: ${deviceFingerprint.hash}`);
      console.log(`   - User Agent: ${userAgent.substring(0, 50)}...`);
      console.log(`   - Service: ${deviceInfo.service}`);

      await triggerEmergencyAlerts(
        tokenId,
        cleanPatientUserId,
        cleanPatientName,
        enhancedLogId,
        deviceInfo,
        comprehensiveLocation.best,
        req
      );
      alertsTriggered = true;
    } else if (isRegisteredDevice) {
      console.log(
        `✅ REGISTERED DEVICE (FingerprintJS Pro) - No alerts needed`
      );
      const registeredDevice = deviceCheck.recordset[0];
      console.log(
        `   - Device registered by user ID: ${registeredDevice.registeredBy}`
      );
      console.log(`   - Registration date: ${registeredDevice.registeredAt}`);
      console.log(`   - Device name: ${registeredDevice.deviceName}`);
      console.log(`   - Visitor ID: ${deviceInfo.visitorId}`);
    } else if (!usingClientFingerprint) {
      console.log(
        `⏳ Using fallback fingerprint - skipping alerts until FingerprintJS Pro verification`
      );
    }

    return {
      isRegisteredDevice,
      deviceInfo,
      enhancedLogId,
      alertsTriggered,
      locationData: comprehensiveLocation.best,
      fingerprintMethod: deviceMetadata?.method || "fallback",
      usingClientFingerprint,
      service: deviceInfo.service,
      confidence: deviceInfo.confidence,
      visitorId: deviceInfo.visitorId,
    };
  } catch (error) {
    console.error("❌ Error in FingerprintJS Pro device check:", error);
    return {
      isRegisteredDevice: false,
      deviceInfo: {
        type: "unknown",
        error: error.message,
        service: "fingerprintjs_pro_error",
      },
      enhancedLogId: null,
      alertsTriggered: false,
      error: error.message,
      service: "fingerprintjs_pro",
    };
  }
};

/**
 * ✅ NEW: Helper function to get device name from user agent (fallback)
 */
const getDeviceNameFromUserAgent = (userAgent) => {
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) {
    const match = userAgent.match(/Android.*?;\s*(.*?)\s*Build/);
    return match ? match[1] : "Android Device";
  }
  if (/Mac/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows PC";
  if (/Linux/i.test(userAgent)) return "Linux PC";
  return "Unknown Device";
};

/**
 * Trigger emergency alerts for unregistered device access
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
    // ✅ IMPROVED VALIDATION (keep existing validation logic)
    const isValidPatientUserId =
      patientUserId &&
      (typeof patientUserId === "string" ||
        typeof patientUserId === "number") &&
      String(patientUserId).trim() !== "" &&
      String(patientUserId).trim() !== "null" &&
      String(patientUserId).trim() !== "undefined" &&
      !isNaN(parseInt(String(patientUserId))) &&
      parseInt(String(patientUserId)) > 0;

    if (!isValidPatientUserId) {
      console.log(
        `⚠️ Cannot trigger alerts: invalid patientUserId "${patientUserId}"`
      );
      return {
        success: false,
        reason: "Invalid patient user ID",
        patientUserId: patientUserId,
        service: "fingerprintjs_pro",
      };
    }

    const cleanPatientUserId = parseInt(String(patientUserId));
    const cleanPatientName =
      patientName && typeof patientName === "string"
        ? String(patientName).trim()
        : "Unknown Patient";

    console.log(`🚨 FingerprintJS Pro EMERGENCY ALERT SYSTEM ACTIVATED`);
    console.log(`   - Token: ${tokenId}`);
    console.log(
      `   - Patient: ${cleanPatientName} (ID: ${cleanPatientUserId})`
    );
    console.log(
      `   - Device: ${deviceInfo.type} - ${deviceInfo.browser} on ${deviceInfo.os}`
    );
    console.log(`   - Service: ${deviceInfo.service}`);
    console.log(`   - Confidence: ${deviceInfo.confidence}`);
    console.log(`   - Visitor ID: ${deviceInfo.visitorId}`);
    console.log(`   - Location: ${locationData?.type || "unknown"}`);

    await pool.connect();

    // ✅ ENHANCED: Create FingerprintJS Pro-aware alert message
    const deviceDescription = `${deviceInfo.type} (${deviceInfo.browser} on ${deviceInfo.os})`;
    const serviceInfo =
      deviceInfo.service === "fingerprintjs_pro"
        ? `with high-confidence device identification (${Math.round(
            deviceInfo.confidence * 100
          )}% confidence)`
        : "with basic device identification";

    const alertMessage = locationService.formatLocationForAlert(
      locationData,
      cleanPatientName,
      `unregistered ${deviceDescription} ${serviceInfo}`
    );

    console.log(
      `📱 FingerprintJS Pro alert message preview: ${alertMessage.substring(
        0,
        100
      )}...`
    );

    // ✅ ENHANCED: Create emergency alert record with FingerprintJS Pro data
    const alertResult = await pool
      .request()
      .input("tokenId", sql.NVarChar, tokenId)
      .input("patientUserId", sql.Int, cleanPatientUserId)
      .input("enhancedLogId", sql.Int, enhancedLogId)
      .input("alertType", sql.NVarChar, "unregistered_device_access")
      .input("alertMessage", sql.NVarChar, alertMessage)
      .input("deviceFingerprint", sql.NVarChar, JSON.stringify(deviceInfo))
      .input(
        "deviceInfo",
        sql.NVarChar,
        `${deviceDescription} (${deviceInfo.service})`
      )
      .input("deviceType", sql.NVarChar, deviceInfo.type)
      .input("locationInfo", sql.NVarChar, JSON.stringify(locationData))
      .input(
        "ipAddress",
        sql.NVarChar,
        locationData?.ipAddress || getRealUserIP(req)
      )
      .input("severity", sql.NVarChar, "high").query(`
    INSERT INTO SmartTokenEmergencyAlerts (
      tokenId, patientUserId, enhancedLogId, alertType, alertMessage,
      deviceFingerprint, deviceInfo, deviceType, locationInfo, ipAddress, severity
    )
    OUTPUT INSERTED.alertId
    VALUES (
      @tokenId, @patientUserId, @enhancedLogId, @alertType, @alertMessage,
      @deviceFingerprint, @deviceInfo, @deviceType, @locationInfo, @ipAddress, @severity
    )
  `);

    const alertId = alertResult.recordset[0].alertId;
    console.log(
      `✅ FingerprintJS Pro emergency alert record created with ID: ${alertId}`
    );

    // ✅ Continue with existing emergency contact notification logic...
    // (Keep the rest of the function unchanged)

    const contactsResult = await pool
      .request()
      .input("patientUserId", sql.Int, cleanPatientUserId).query(`
        SELECT contactId, contactName, phoneNumber, relationship, isPrimary
        FROM EmergencyContacts 
        WHERE patientUserId = @patientUserId AND isActive = 1
        ORDER BY isPrimary DESC, contactName ASC
      `);

    const emergencyContacts = contactsResult.recordset;

    if (emergencyContacts.length === 0) {
      console.log(
        `⚠️ No emergency contacts found for patient ${cleanPatientUserId}`
      );
      await pool.request().input("alertId", sql.Int, alertId).query(`
        UPDATE SmartTokenEmergencyAlerts 
        SET smsAlertsSent = 0, 
            emergencyContactsNotified = 0,
            smsDeliveryStatus = 'NO_CONTACTS_AVAILABLE'
        WHERE alertId = @alertId
      `);

      return {
        success: false,
        reason: "No emergency contacts found",
        alertId: alertId,
        patientUserId: cleanPatientUserId,
        contactCount: 0,
        service: "fingerprintjs_pro",
      };
    }

    // ✅ Enhanced SMS sending with FingerprintJS Pro context
    let smsResults = [];
    let successfulSMS = 0;
    let failedSMS = 0;

    console.log(
      `📤 Sending FingerprintJS Pro security alerts to ${emergencyContacts.length} contacts...`
    );

    for (const contact of emergencyContacts) {
      try {
        const smsResult = await twilioSMSService.sendEmergencyAlert(
          contact.phoneNumber,
          alertMessage,
          contact.contactName
        );

        if (smsResult.success) {
          successfulSMS++;
          console.log(
            `   ✅ SMS sent to ${contact.contactName} (SID: ${smsResult.sid})`
          );
        } else {
          failedSMS++;
          console.log(
            `   ❌ SMS failed to ${contact.contactName}: ${smsResult.error}`
          );
        }

        smsResults.push({
          contactId: contact.contactId,
          contactName: contact.contactName,
          phoneNumber: contact.phoneNumber,
          success: smsResult.success,
          messageSid: smsResult.sid,
          error: smsResult.error,
          sentAt: new Date().toISOString(),
        });

        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (smsError) {
        failedSMS++;
        console.error(`   ❌ SMS error for ${contact.contactName}:`, smsError);
        smsResults.push({
          contactId: contact.contactId,
          contactName: contact.contactName,
          phoneNumber: contact.phoneNumber,
          success: false,
          error: smsError.message,
          sentAt: new Date().toISOString(),
        });
      }
    }

    const deliveryStatus =
      successfulSMS > 0
        ? failedSMS > 0
          ? "PARTIAL_SUCCESS"
          : "ALL_SENT"
        : "ALL_FAILED";

    await pool
      .request()
      .input("alertId", sql.Int, alertId)
      .input("smsAlertsSent", sql.Int, successfulSMS)
      .input("emergencyContactsNotified", sql.Int, emergencyContacts.length)
      .input("smsDeliveryStatus", sql.NVarChar, deliveryStatus).query(`
        UPDATE SmartTokenEmergencyAlerts 
        SET smsAlertsSent = @smsAlertsSent,
            emergencyContactsNotified = @emergencyContactsNotified,
            smsDeliveryStatus = @smsDeliveryStatus
        WHERE alertId = @alertId
      `);

    console.log(`🏁 FingerprintJS Pro EMERGENCY ALERT SUMMARY:`);
    console.log(`   - Alert ID: ${alertId}`);
    console.log(`   - Service: ${deviceInfo.service}`);
    console.log(`   - Confidence: ${deviceInfo.confidence}`);
    console.log(`   - Visitor ID: ${deviceInfo.visitorId}`);
    console.log(`   - Contacts notified: ${emergencyContacts.length}`);
    console.log(`   - SMS sent: ${successfulSMS}`);
    console.log(`   - SMS failed: ${failedSMS}`);
    console.log(`   - Status: ${deliveryStatus}`);

    return {
      success: true,
      alertId: alertId,
      patientUserId: cleanPatientUserId,
      patientName: cleanPatientName,
      contactCount: emergencyContacts.length,
      smsSuccessful: successfulSMS,
      smsFailed: failedSMS,
      deliveryStatus: deliveryStatus,
      smsResults: smsResults,
      locationData: locationData,
      deviceInfo: deviceInfo,
      service: "fingerprintjs_pro",
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

/**
 * Create alert message with location information
 */
const createAlertMessage = (patientName, deviceInfo, locationData) => {
  const deviceDesc = `${deviceInfo.type} (${deviceInfo.browser} on ${deviceInfo.os})`;

  if (locationData.type === "gps" && locationData.address) {
    return `🚨 SECURITY ALERT: Someone at GPS coordinates ${locationData.latitude}, ${locationData.longitude} (${locationData.address}) just accessed ${patientName}'s SmartToken with an unregistered ${deviceDesc}. If this was not authorized, please contact medical staff immediately.`;
  } else if (locationData.type === "gps") {
    return `🚨 SECURITY ALERT: Someone at GPS coordinates ${locationData.latitude}, ${locationData.longitude} just accessed ${patientName}'s SmartToken with an unregistered ${deviceDesc}. If this was not authorized, please contact medical staff immediately.`;
  } else if (locationData.type === "ip" && locationData.city !== "Unknown") {
    return `🚨 SECURITY ALERT: Someone in the ${locationData.city}, ${locationData.region} area just accessed ${patientName}'s SmartToken with an unregistered ${deviceDesc}. Location determined from internet connection. If this was not authorized, please contact medical staff immediately.`;
  } else {
    return `🚨 SECURITY ALERT: Someone just accessed ${patientName}'s SmartToken with an unregistered ${deviceDesc}. If this was not authorized, please contact medical staff immediately.`;
  }
};

// Helper functions for device detection
const getDeviceTypeFromUserAgent = (userAgent) => {
  if (
    /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(userAgent)
  ) {
    return "mobile";
  }
  return "desktop";
};

const getBrowserFromUserAgent = (userAgent) => {
  if (/Chrome/i.test(userAgent)) return "Chrome";
  if (/Firefox/i.test(userAgent)) return "Firefox";
  if (/Safari/i.test(userAgent)) return "Safari";
  if (/Edge/i.test(userAgent)) return "Edge";
  return "Unknown";
};

const getOSFromUserAgent = (userAgent) => {
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Mac OS X/i.test(userAgent)) return "macOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone OS/i.test(userAgent)) return "iOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Unknown";
};

// ============================================================================
// HELPER FUNCTIONS (Enhanced with Emergency Features)
// ============================================================================

/**
 * Get the real user IP address from request headers
 * Handles proxies, load balancers, CDNs, and direct connections
 */
const getRealUserIP = (req) => {
  // Check various headers that proxies/load balancers use to forward real IP
  const forwardedFor = req.headers["x-forwarded-for"];
  const realIP = req.headers["x-real-ip"];
  const cfConnectingIP = req.headers["cf-connecting-ip"]; // Cloudflare
  const xClientIP = req.headers["x-client-ip"];
  const xForwardedForAlt = req.headers["x-forwarded"];
  const forwardedForAlt = req.headers["forwarded-for"];
  const forwarded = req.headers["forwarded"];

  // x-forwarded-for can contain multiple IPs (client, proxy1, proxy2, ...)
  // The first IP is the original client
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    // Return the first non-private IP or the first IP if all are private
    for (const ip of ips) {
      if (isValidPublicIP(ip)) {
        return ip;
      }
    }
    return ips[0]; // Fallback to first IP even if private
  }

  // Check other headers in order of preference
  if (realIP && isValidIP(realIP)) return realIP;
  if (cfConnectingIP && isValidIP(cfConnectingIP)) return cfConnectingIP;
  if (xClientIP && isValidIP(xClientIP)) return xClientIP;
  if (xForwardedForAlt && isValidIP(xForwardedForAlt)) return xForwardedForAlt;
  if (forwardedForAlt && isValidIP(forwardedForAlt)) return forwardedForAlt;

  // Parse the forwarded header (more complex format)
  if (forwarded) {
    const forMatch = forwarded.match(/for=([^;,\s]+)/);
    if (forMatch && forMatch[1]) {
      const ip = forMatch[1].replace(/"/g, "").replace(/\[|\]/g, "");
      if (isValidIP(ip)) return ip;
    }
  }

  // Fallback to connection-level IPs
  return (
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.req?.connection?.remoteAddress ||
    req.ip ||
    "unknown"
  );
};

/**
 * Validate if a string is a valid IP address
 */
const isValidIP = (ip) => {
  if (!ip || typeof ip !== "string") return false;

  // Remove IPv6 brackets if present
  ip = ip.replace(/\[|\]/g, "");

  // IPv4 regex
  const ipv4Regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  // IPv6 regex (simplified)
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;

  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
};

/**
 * Check if IP is a public IP (not private/local)
 */
const isValidPublicIP = (ip) => {
  if (!isValidIP(ip)) return false;

  // Private IP ranges to exclude
  const privateRanges = [
    /^10\./, // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./, // 192.168.0.0/16
    /^127\./, // 127.0.0.0/8 (localhost)
    /^169\.254\./, // 169.254.0.0/16 (link-local)
    /^::1$/, // IPv6 localhost
    /^fc00:/, // IPv6 private
    /^fe80:/, // IPv6 link-local
  ];

  return !privateRanges.some((range) => range.test(ip));
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

// ============================================================================
// PUBLIC ROUTES (No Authentication Required) - ENHANCED WITH EMERGENCY ALERTS
// ============================================================================

// Main verification endpoint - ENHANCED with device detection and alerts
exports.verifySmartToken = async (req, res) => {
  try {
    const { id } = req.params;
    const { s: signature } = req.query;

    console.log(`🔍 Starting SmartToken verification for: ${id}`);

    // Validate input
    if (!id || !signature) {
      return res.status(400).render("error", {
        title: "Invalid Token",
        message: "Invalid token format. Please scan a valid SmartToken.",
        errorCode: "INVALID_FORMAT",
        instructions:
          "Please ensure you are scanning a valid SmartToken device.",
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
      console.log(`🔑 Calling VivoKey API for signature validation...`);

      // Call VivoKey Verify API
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

      // Enhanced token lookup with better error handling
      let tokenRecord = await pool
        .request()
        .input("smartTokenId", id)
        .input("secureChipId", secureChipId).query(`
          SELECT 
            st.smartTokenId,
            st.secureChipId,
            st.productCode,
            st.devId,
            st.status,
            st.containerName,
            st.folderName,
            st.patientDateOfBirth,
            st.assignedAt,
            st.createdAt,
            st.revokedAt,
            st.revokedBy,
            st.revokeReason,
            COALESCE(u.name, st.patientName) as patientName,
            st.patientUserId as tokenPatientUserId,
            u.userId as userPatientUserId,
            u.username as patientUsername,
            COALESCE(st.patientUserId, u.userId) as finalPatientUserId
          FROM SmartTokens st
          LEFT JOIN Users u ON st.patientUserId = u.userId
          WHERE st.smartTokenId = @smartTokenId AND st.secureChipId = @secureChipId
        `);

      // Fallback if no match
      if (tokenRecord.recordset.length === 0) {
        console.log(`⚠️ Primary query failed, trying fallback query...`);

        tokenRecord = await pool.request().input("smartTokenId", id).query(`
          SELECT st.*, u.name as patientName, u.userId as patientUserId
          FROM SmartTokens st
          LEFT JOIN Users u ON st.patientUserId = u.userId
          WHERE st.smartTokenId = @smartTokenId
        `);

        if (tokenRecord.recordset.length > 0) {
          console.log(`✅ Fallback query found the token!`);
          // Update the secureChipId for future use
          await pool
            .request()
            .input("smartTokenId", id)
            .input("secureChipId", secureChipId).query(`
              UPDATE SmartTokens 
              SET secureChipId = @secureChipId 
              WHERE smartTokenId = @smartTokenId
            `);
        }
      }

      // Auto-enrollment for completely new tokens
      if (tokenRecord.recordset.length === 0) {
        console.log(`📝 Auto-enrolling new token...`);

        await pool
          .request()
          .input("smartTokenId", id)
          .input("secureChipId", secureChipId)
          .input("productCode", decoded.product || 7)
          .input("devId", decoded.dev_id).query(`
            INSERT INTO SmartTokens (smartTokenId, secureChipId, productCode, devId, status, createdAt)
            VALUES (@smartTokenId, @secureChipId, @productCode, @devId, 'unclaimed', GETDATE())
          `);

        return res.render("tokenStatus", {
          title: "Token Registered",
          message:
            "SmartToken has been registered in the system but is not yet assigned to a patient.",
          status: "unclaimed",
          tokenId: id,
          instructions:
            "Please contact the medical facility to assign this token to a patient record.",
        });
      }

      const token = tokenRecord.recordset[0];
      console.log(`✅ Token found and ready for processing:`);
      console.log(`   - Patient: ${token.patientName || "Not assigned"}`);
      console.log(`   - PatientUserId: ${token.patientUserId || "NULL"}`);
      console.log(`   - Status: ${token.status}`);

      const cleanTokenData = {
        smartTokenId: token.smartTokenId,
        status: token.status,
        patientName: token.patientName
          ? String(token.patientName).trim()
          : null,
        patientUserId: token.finalPatientUserId
          ? String(token.finalPatientUserId).trim()
          : null,
        patientUsername: token.patientUsername,
        patientDateOfBirth: token.patientDateOfBirth,
        containerName: token.containerName,
        folderName: token.folderName,
        assignedAt: token.assignedAt,
      };

      // Handle different token statuses
      if (token.status === "unclaimed") {
        return res.render("tokenStatus", {
          title: "Token Not Assigned",
          message:
            "This SmartToken is registered but not yet assigned to a patient.",
          status: "unassigned",
          tokenId: id,
          instructions:
            "Please contact the medical facility to assign this token to a patient record.",
        });
      }

      if (token.status === "inactive") {
        return res.status(403).render("error", {
          title: "Token Inactive",
          message: "This SmartToken has been deactivated.",
          errorCode: "TOKEN_INACTIVE",
          instructions: "Please contact the medical facility for assistance.",
        });
      }

      // ✅ ENHANCED: Get comprehensive location data BEFORE device check
      let comprehensiveLocation;
      try {
        // Try to get GPS coordinates from request body if available
        const gpsCoordinates = req.body?.gpsCoordinates || null;
        comprehensiveLocation = await locationService.getComprehensiveLocation(
          req,
          gpsCoordinates
        );

        console.log("📍 Location Collection Results:", {
          hasGPS: comprehensiveLocation.hasGPS,
          hasIP: comprehensiveLocation.hasIP,
          bestType: comprehensiveLocation.best?.type,
          gpsFromBody: !!req.body?.gpsCoordinates,
        });
      } catch (locationError) {
        console.error("Error getting comprehensive location:", locationError);
        // Fallback to basic IP location
        comprehensiveLocation = {
          primary: null,
          fallback: await locationService.getLocationFromIP(getRealUserIP(req)),
          best: await locationService.getLocationFromIP(getRealUserIP(req)),
          hasGPS: false,
          hasIP: true,
        };
      }

      // ✅ ENHANCED: Check device and trigger alerts with location data
      console.log(
        `🔍 Starting device check for patient: ${token.patientUserId}`
      );

      const deviceCheckResult = await checkDeviceAndTriggerAlerts(
        req,
        id,
        cleanTokenData.patientUserId,
        cleanTokenData.patientName,
        false
      );

      console.log(`✅ Device check completed:`);
      console.log(
        `   - Registered Device: ${deviceCheckResult.isRegisteredDevice}`
      );
      console.log(
        `   - Alerts Triggered: ${deviceCheckResult.alertsTriggered}`
      );
      console.log(
        `   - Location Type: ${
          deviceCheckResult.locationData?.type || "unknown"
        }`
      );

      // Continue with normal patient data display...
      const accessTime = new Date().toISOString();

      // Log the basic access
      await logTokenAccess(
        id,
        token.containerName,
        token.folderName,
        getRealUserIP(req),
        "emergency"
      );

      // Get patient files
      const containerName = token.assignedContainer || token.containerName;
      const folderName = token.assignedFolder || token.folderName;

      if (!containerName || !folderName) {
        return res.render("tokenStatus", {
          title: "No Files Assigned",
          message:
            "This SmartToken is valid but no medical files have been assigned yet.",
          status: "no_files",
          tokenId: id,
          patientName: token.patientName,
          instructions:
            "Please contact the medical facility to assign medical files to this token.",
        });
      }

      // Get files from Azure Storage
      const patientFiles = await getPatientFilesFromAzure(
        containerName,
        folderName
      );

      // Files will use view-only access through the emergency endpoint
      const filesForDisplay = patientFiles.map((file) => ({
        ...file,
        emergencyAccess: true,
      }));

      // Format patient date of birth
      const formattedDOB = formatDateOfBirth(token.patientDateOfBirth);

      console.log(`🎉 Successfully rendering patient data page`);

      // ✅ ENHANCED: Use the best available location data for display
      const displayLocationData =
        deviceCheckResult.locationData || comprehensiveLocation.best;

      // Render patient data page with enhanced location info
      return res.render("patientData", {
        title: `Patient Data - ${token.patientName || token.folderName}`,
        patientName: cleanTokenData.patientName || "Unknown Patient",
        patientDateOfBirth: formattedDOB,
        containerName: containerName,
        folderName: folderName,
        files: filesForDisplay,
        isEmergencyAccess: true,
        accessTime: accessTime,
        tokenId: id,
        formatFileSize: formatFileSize,
        // ✅ ENHANCED: Device and location information
        deviceInfo: deviceCheckResult.deviceInfo,
        isRegisteredDevice: deviceCheckResult.isRegisteredDevice,
        alertsTriggered: deviceCheckResult.alertsTriggered,
        securityNotice: !deviceCheckResult.isRegisteredDevice
          ? "Emergency contacts have been notified of this access from an unregistered device."
          : null,
        // ✅ ENHANCED: Comprehensive location data
        locationData: displayLocationData,
        hasGPS: comprehensiveLocation?.hasGPS || false,
        hasIP: comprehensiveLocation?.hasIP || false,
        accessIP: getRealUserIP(req),
      });
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

        return res.render("patientData", {
          title: `Patient Data - ${
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
// ADMIN API ENDPOINTS (Authentication Required)
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

// ✅ Get all tokens with user associations (ENHANCED)
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

// ✅ Get patients for assignment dropdown (ENHANCED)
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

// ✅ Get doctors for patient (ENHANCED)
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

// ✅ Enhanced token assignment (ENHANCED)
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

// ✅ Get assigned folders for container (ENHANCED) - FIXES 404 ERROR!
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

// ✅ Delete token (ENHANCED)
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

// ✅ Get my alerts (using recent access logs as alerts)
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

// ✅ Mark alert as read (placeholder)
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

// ✅ Get device logs for a token
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

exports.triggerEmergencyAlerts = triggerEmergencyAlerts;

module.exports = exports;
