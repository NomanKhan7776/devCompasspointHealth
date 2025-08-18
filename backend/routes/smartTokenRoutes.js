// routes/smartTokenRoutes.js - FingerprintJS Pro ONLY Implementation
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/role-check");

// Import from FingerprintJS Pro-only consolidated controller
const {
  // Public routes (no auth)
  verifySmartToken,
  getPatientFileViewOnly,
  triggerManualEmergencyAlert,
  // Admin API routes (with auth) - Keep existing implementations
  getUnclaimedTokens,
  getAllAssignedTokens,
  getPatientsForAssignment,
  getDoctorsForPatient,
  assignTokenEnhanced,
  getAssignedFolders,
  deleteSmartToken,
  revokeSmartToken,
  reactivateSmartToken,
  getSmartTokenLogs,

  // User-specific routes (patients and doctors) - Keep existing
  getMyTokens,
  getMyAlerts,
  markAlertAsRead,
  getDeviceLogs,
} = require("../controllers/consolidatedSmartTokenController");

// Import device management functions
const {
  checkDeviceRegistration,
} = require("../controllers/deviceManagementController");

// =============================================================================
// PUBLIC ROUTES (no authentication required)
// =============================================================================

/**
 * GET /verify/:id - Initial SmartToken verification (VivoKey validation)
 * This loads the patient data page with FingerprintJS Pro integration
 */
router.get("/verify/:id", verifySmartToken);

/**
 * POST /verify/:id - FingerprintJS Pro ONLY device verification
 * This is called by the frontend after FingerprintJS Pro generates a fingerprint
 */
router.post("/verify/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { deviceFingerprint, gpsCoordinates, locationData } = req.body; // ✅ Add location data

    console.log(`📱 FingerprintJS Pro SmartToken verification: ${id}`);

    // Validate FingerprintJS Pro fingerprint
    if (!deviceFingerprint || !deviceFingerprint.visitorId) {
      console.warn("⚠️ No FingerprintJS Pro visitorId provided");
      return res.status(400).json({
        success: false,
        message: "FingerprintJS Pro visitorId is required",
        error: "MISSING_VISITOR_ID",
        service: "fingerprintjs_pro_required",
      });
    }

    // Validate service is FingerprintJS Pro
    const service = deviceFingerprint.metadata?.service;
    if (service !== "fingerprintjs_pro") {
      console.warn("⚠️ Invalid fingerprint service:", service);
      return res.status(400).json({
        success: false,
        message: "FingerprintJS Pro service is required",
        error: "INVALID_SERVICE",
        expected: "fingerprintjs_pro",
        received: service || "unknown",
      });
    }

    const visitorId = deviceFingerprint.visitorId;
    console.log("🔍 FingerprintJS Pro verification:", {
      visitorId: visitorId,
      requestId: deviceFingerprint.requestId,
      confidence: deviceFingerprint.confidence,
      service: service,
    });

    // Get token information from database
    const { pool, sql } = require("../config/database");
    await pool.connect();

    const tokenInfo = await pool.request().input("tokenId", sql.NVarChar, id)
      .query(`
        SELECT patientUserId, patientName, status
        FROM SmartTokens 
        WHERE smartTokenId = @tokenId
      `);

    if (tokenInfo.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Token not found",
        error: "TOKEN_NOT_FOUND",
      });
    }

    const token = tokenInfo?.recordset?.[0];

    if (token.status !== "assigned") {
      return res.status(400).json({
        success: false,
        message: "Token is not assigned to a patient",
        error: "TOKEN_NOT_ASSIGNED",
        status: token.status,
      });
    }

    // ✅ NEW: Check for recent timer-based alerts to prevent duplicates
    const recentTimerAlert = await pool
      .request()
      .input("tokenId", sql.NVarChar, id)
      .input("patientUserId", sql.Int, token.patientUserId)
      .input("timeWindow", sql.DateTime, new Date(Date.now() - 2 * 60 * 1000)) // Last 2 minutes
      .query(`
        SELECT TOP 1 alertId, alertType, createdAt
        FROM SmartTokenEmergencyAlerts
        WHERE tokenId = @tokenId 
          AND patientUserId = @patientUserId
          AND (alertType LIKE '%timer%' OR alertType LIKE '%cancelled%')
          AND createdAt > @timeWindow
        ORDER BY createdAt DESC
      `);

    if (recentTimerAlert.recordset.length > 0) {
      console.log(
        "⏰ Recent timer alert found, skipping device verification alert to prevent duplicates"
      );
      console.log(
        `   - Alert found at: ${recentTimerAlert.recordset[0].createdAt}`
      );
      console.log(
        `   - Alert type: ${recentTimerAlert.recordset[0].alertType}`
      );

      // Still log the access but don't trigger alerts
      await pool
        .request()
        .input("tokenId", sql.NVarChar, id)
        .input("patientUserId", sql.Int, token.patientUserId)
        .input(
          "accessMode",
          sql.NVarChar,
          "smarttoken_fpjs_verification_skipped"
        )
        .input("ipAddress", sql.NVarChar, getRealUserIP(req))
        .input("userAgent", sql.NVarChar, req.headers["user-agent"] || "")
        .input(
          "deviceFingerprint",
          sql.NVarChar,
          JSON.stringify(deviceFingerprint)
        )
        .input("visitorId", sql.NVarChar, visitorId)
        .input("confidenceScore", sql.Float, deviceFingerprint.confidence)
        .input("fingerprintService", sql.NVarChar, "fingerprintjs_pro")
        .input("isRegisteredDevice", sql.Bit, 0) // Assume unregistered since timer alert was sent
        .query(`
          INSERT INTO EnhancedTokenAccessLog (
            tokenId, patientUserId, accessMode, 
            ipAddress, userAgent, deviceFingerprint, 
            visitorId, confidenceScore, fingerprintService, 
            isRegisteredDevice, accessTime
          )
          VALUES (
            @tokenId, @patientUserId, @accessMode,
            @ipAddress, @userAgent, @deviceFingerprint,
            @visitorId, @confidenceScore, @fingerprintService,
            @isRegisteredDevice, GETDATE()
          )
        `);

      return res.json({
        success: true,
        message: "Device verification skipped - recent timer alert sent",
        tokenId: id,
        visitorId: visitorId,
        isRegisteredDevice: false,
        alertsTriggered: false,
        securityStatus: "timer_alert_sent",
        service: "fingerprintjs_pro",
        skipReason: "Recent timer alert prevents duplicate",
        recentAlert: {
          alertId: recentTimerAlert.recordset[0].alertId,
          alertType: recentTimerAlert.recordset[0].alertType,
          createdAt: recentTimerAlert.recordset[0].createdAt,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Check if FingerprintJS Pro visitorId is registered for this patient
    console.log(`🔍 Checking FingerprintJS Pro device registration:`, {
      visitorId: visitorId,
      patientUserId: token.patientUserId,
      patientName: token.patientName,
    });

    const deviceCheck = await checkDeviceRegistration(
      visitorId,
      token.patientUserId
    );

    const isRegistered = deviceCheck.isRegistered;
    let alertsTriggered = false;

    // Log the access attempt with FingerprintJS Pro data
    const logResult = await pool
      .request()
      .input("tokenId", sql.NVarChar, id)
      .input("patientUserId", sql.Int, token.patientUserId)
      .input("accessMode", sql.NVarChar, "smarttoken_fpjs_verification")
      .input("ipAddress", sql.NVarChar, getRealUserIP(req))
      .input("userAgent", sql.NVarChar, req.headers["user-agent"] || "")
      .input(
        "deviceFingerprint",
        sql.NVarChar,
        JSON.stringify(deviceFingerprint)
      )
      .input("visitorId", sql.NVarChar, visitorId)
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

    const logId = logResult?.recordset[0]?.logId || null;

    if (!isRegistered) {
      console.log(
        "🚨 UNREGISTERED FingerprintJS Pro DEVICE - Triggering emergency alerts"
      );
      console.log("   - Visitor ID:", visitorId);
      console.log("   - Patient:", token.patientName);
      console.log("   - Confidence:", deviceFingerprint.confidence);

      try {
        // Import emergency alert function
        const {
          triggerEmergencyAlerts,
          getCombinedLocationData, // ✅ Import location function
        } = require("../controllers/consolidatedSmartTokenController");

        // ✅ Get comprehensive location data with GPS priority
        const combinedLocationData = await getCombinedLocationData(req);
        const primaryLocation = combinedLocationData.primaryLocation;

        console.log("🌍 Device verification location data:", {
          hasGPS: combinedLocationData.hasGPS,
          hasIP: combinedLocationData.hasIP,
          primaryType: primaryLocation?.type,
          city: primaryLocation?.city,
          coordinates:
            primaryLocation?.latitude && primaryLocation?.longitude
              ? `${primaryLocation.latitude}, ${primaryLocation.longitude}`
              : "None",
        });

        // Create device info from FingerprintJS Pro data
        const deviceInfo = {
          visitorId: visitorId,
          requestId: deviceFingerprint.requestId,
          confidence: deviceFingerprint.confidence,
          service: "fingerprintjs_pro",
          deviceName:
            deviceFingerprint.metadata?.deviceName ||
            getDeviceNameFromUserAgent(req.headers["user-agent"]),
          browserName:
            deviceFingerprint.metadata?.browserName ||
            getBrowserNameFromUserAgent(req.headers["user-agent"]),
          osName:
            deviceFingerprint.metadata?.osName ||
            getOSNameFromUserAgent(req.headers["user-agent"]),
          deviceType:
            deviceFingerprint.metadata?.deviceType ||
            getDeviceTypeFromUserAgent(req.headers["user-agent"]),
          userAgent: req.headers["user-agent"] || "",
          timestamp: new Date().toISOString(),
          // ✅ Include location info in device info
          combinedLocation: combinedLocationData,
          ipLocation: combinedLocationData.ipLocation,
          gpsLocation: combinedLocationData.gpsLocation,
          hasLocation:
            combinedLocationData.hasGPS || combinedLocationData.hasIP,
        };

        // ✅ Pass location data to emergency alerts
        const alertResult = await triggerEmergencyAlerts(
          id,
          token.patientUserId,
          token.patientName,
          logId,
          deviceInfo,
          primaryLocation, // ✅ Pass primary location
          req
        );

        alertsTriggered = alertResult.success;

        console.log("✅ FingerprintJS Pro emergency alerts result:", {
          alertsTriggered: alertsTriggered,
          contactsNotified: alertResult.contactCount || 0,
          smsSuccessful: alertResult.smsSuccessful || 0,
        });

        // Update log with alert information
        if (alertResult.smsSuccessful) {
          await pool
            .request()
            .input("logId", sql.Int, logId)
            .input("alertsSent", sql.Int, alertResult.smsSuccessful).query(`
              UPDATE EnhancedTokenAccessLog
              SET alertsSent = @alertsSent
              WHERE logId = @logId
            `);
        }
      } catch (alertError) {
        console.error(
          "❌ Error triggering FingerprintJS Pro emergency alerts:",
          alertError
        );
        // Continue with response even if alerts fail
      }
    } else {
      console.log("✅ REGISTERED FingerprintJS Pro DEVICE - No alerts needed");
      const registeredDevice = deviceCheck.device;
      console.log("   - Device Name:", registeredDevice.deviceName);
      console.log("   - Device Type:", registeredDevice.deviceType);
      console.log("   - Registered:", registeredDevice.registeredAt);
      console.log("   - Visitor ID:", visitorId);
    }

    // Return verification result
    res.json({
      success: true,
      message: "FingerprintJS Pro device verification completed",
      tokenId: id,
      visitorId: visitorId,
      requestId: deviceFingerprint.requestId,
      confidence: deviceFingerprint.confidence,
      isRegisteredDevice: isRegistered,
      alertsTriggered: alertsTriggered,
      securityStatus: isRegistered ? "registered" : "unregistered",
      service: "fingerprintjs_pro",
      deviceInfo: {
        name: deviceFingerprint.metadata?.deviceName,
        type: deviceFingerprint.metadata?.deviceType,
        browser: deviceFingerprint.metadata?.browserName,
        os: deviceFingerprint.metadata?.osName,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ FingerprintJS Pro verification error:", error);
    res.status(500).json({
      success: false,
      message: "FingerprintJS Pro device verification failed",
      error: "FPJS_VERIFICATION_FAILED",
      service: "fingerprintjs_pro",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

router.post("/trigger-emergency-alert/:id", triggerManualEmergencyAlert);

// Timer-based emergency alert routes
router.post("/timer-expired/:id", async (req, res) => {
  try {
    const {
      handleTimerExpiration,
    } = require("../controllers/consolidatedSmartTokenController");
    return await handleTimerExpiration(req, res);
  } catch (error) {
    console.error("❌ Timer expiration route error:", error);
    res.status(500).json({
      success: false,
      message: "Timer expiration handling failed",
      error: error.message,
    });
  }
});

router.get("/patient-data-after-timer/:id", async (req, res) => {
  try {
    const {
      getPatientDataAfterTimer,
    } = require("../controllers/consolidatedSmartTokenController");
    return await getPatientDataAfterTimer(req, res);
  } catch (error) {
    console.error("❌ Patient data after timer route error:", error);
    return res.status(500).render("error", {
      title: "System Error",
      message: "An error occurred while accessing patient data",
      errorCode: "SYSTEM_ERROR",
    });
  }
});

// File access routes (no changes needed)
router.get(
  "/file/:containerName/:folderName/:fileName/view",
  getPatientFileViewOnly
);
router.get(
  "/file/:containerName/:folderName/:fileName",
  getPatientFileViewOnly
);

// =============================================================================
// AUTHENTICATED USER ROUTES (patients and doctors) - No changes needed
// =============================================================================

router.get("/my-tokens", auth, checkRole(["patient", "doctor"]), getMyTokens);
router.get("/my-alerts", auth, checkRole(["patient", "doctor"]), getMyAlerts);
router.post(
  "/alerts/:alertId/read",
  auth,
  checkRole(["patient", "doctor"]),
  markAlertAsRead
);
router.get(
  "/device-logs/:tokenId",
  auth,
  checkRole(["patient", "doctor"]),
  getDeviceLogs
);

// =============================================================================
// AUTHENTICATED ADMIN ROUTES - No changes needed
// =============================================================================

router.get("/unclaimed", auth, checkRole(["admin"]), getUnclaimedTokens);
router.get("/all-with-users", auth, checkRole(["admin"]), getAllAssignedTokens);
router.get(
  "/patients-for-assignment",
  auth,
  checkRole(["admin"]),
  getPatientsForAssignment
);
router.get(
  "/doctors-for-patient/:patientUserId",
  auth,
  checkRole(["admin"]),
  getDoctorsForPatient
);

router.post(
  "/assign-enhanced",
  auth,
  checkRole(["admin"]),
  assignTokenEnhanced
);

router.get(
  "/assigned-folders/:containerName",
  auth,
  checkRole(["admin"]),
  getAssignedFolders
);
router.delete("/:tokenId", auth, checkRole(["admin"]), deleteSmartToken);
router.post("/revoke", auth, checkRole(["admin"]), revokeSmartToken);
router.post("/reactivate", auth, checkRole(["admin"]), reactivateSmartToken);
router.get("/logs", auth, checkRole(["admin"]), getSmartTokenLogs);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the real user IP address from request headers
 */
function getRealUserIP(req) {
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
}

/**
 * Helper functions for device detection from user agent
 */
function getDeviceNameFromUserAgent(userAgent = "") {
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) {
    const match = userAgent.match(/Android.*?;\s*(.*?)\s*Build/);
    return match ? match[1].trim() : "Android Device";
  }
  if (/Mac/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows PC";
  return "Unknown Device";
}

function getBrowserNameFromUserAgent(userAgent = "") {
  if (/Edg/i.test(userAgent)) return "Edge";
  if (/Chrome/i.test(userAgent) && !/Edg/i.test(userAgent)) return "Chrome";
  if (/Firefox/i.test(userAgent)) return "Firefox";
  if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) return "Safari";
  if (/SamsungBrowser/i.test(userAgent)) return "Samsung Internet";
  return "Unknown Browser";
}

function getOSNameFromUserAgent(userAgent = "") {
  if (/iPhone|iPad/i.test(userAgent)) return "iOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Mac OS X/i.test(userAgent)) return "macOS";
  if (/Windows/i.test(userAgent)) return "Windows";
  return "Unknown OS";
}

function getDeviceTypeFromUserAgent(userAgent = "") {
  return /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(
    userAgent
  )
    ? "mobile"
    : "desktop";
}

module.exports = router;
