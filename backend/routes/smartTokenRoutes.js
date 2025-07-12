// routes/smartTokenRoutes.js - FIXED VERSION - No more false alerts for registered devices
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/role-check");

// ✅ Import from consolidated controller
const {
  // Public routes (no auth)
  verifySmartToken,
  getPatientFileViewOnly,

  // Admin API routes (with auth)
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

  // User-specific routes (patients and doctors)
  getMyTokens,
  getMyAlerts,
  markAlertAsRead,
  getDeviceLogs,
} = require("../controllers/consolidatedSmartTokenController");

// =============================================================================
// PUBLIC ROUTES (no authentication required)
// =============================================================================

// ✅ FIXED: GET /verify/:id - Initial token verification WITHOUT premature alerts
router.get("/verify/:id", verifySmartToken);

// ✅ FIXED: POST /verify/:id - Client fingerprint verification with proper alerts
router.post("/verify/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { deviceFingerprint, deviceMetadata, gpsCoordinates } = req.body;

    console.log(`📱 Client fingerprint received for token ${id}:`);
    console.log(`   - Hash: ${deviceFingerprint?.hash}`);
    console.log(`   - Device: ${deviceMetadata?.deviceName}`);

    if (!deviceFingerprint || !deviceFingerprint.hash) {
      return res.status(400).json({
        success: false,
        message: "Invalid device fingerprint provided",
      });
    }

    // ✅ Import required modules
    const { pool, sql } = require("../config/database");

    // ✅ Get patient info for this token
    await pool.connect();

    const tokenInfo = await pool
      .request()
      .input("tokenId", id)
      .query(
        "SELECT patientUserId, patientName FROM SmartTokens WHERE smartTokenId = @tokenId"
      );

    if (tokenInfo.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Token not found",
      });
    }

    const { patientUserId, patientName } = tokenInfo.recordset[0];

    console.log(`🔍 Checking CLIENT fingerprint against database...`);
    console.log(`   - Client Fingerprint: ${deviceFingerprint.hash}`);
    console.log(`   - Patient ID: ${patientUserId}`);

    // ✅ FIXED: Check if the CLIENT fingerprint is registered
    const deviceCheck = await pool
      .request()
      .input("fingerprintHash", sql.NVarChar, deviceFingerprint.hash)
      .input("userId", sql.Int, patientUserId)
      .input("userAgent", sql.NVarChar, req.headers["user-agent"] || "")
      .input(
        "screenResolution",
        sql.NVarChar,
        deviceFingerprint.details?.screen
          ? `${deviceFingerprint.details.screen.width}x${deviceFingerprint.details.screen.height}`
          : ""
      )
      .input(
        "platform",
        sql.NVarChar,
        deviceFingerprint.details?.platform?.platform || ""
      ).query(`
    SELECT df.*, 
           CASE WHEN df.registeredBy = @userId THEN 1 ELSE 0 END as isOwnedByPatient
    FROM DeviceFingerprints df
    WHERE df.userId = @userId
      AND df.isActive = 1
      AND (
        JSON_VALUE(df.fingerprint, '$.hash') = @fingerprintHash
        OR (df.userAgent = @userAgent AND df.screenResolution = @screenResolution)
        OR (@platform != '' AND df.platform = @platform AND df.screenResolution = @screenResolution)
      )
    ORDER BY 
      CASE WHEN JSON_VALUE(df.fingerprint, '$.hash') = @fingerprintHash THEN 1 ELSE 2 END,
      df.registeredAt DESC
  `);

    const isRegistered = deviceCheck.recordset.length > 0;

    console.log(`🔍 CLIENT fingerprint check results:`);
    console.log(
      `   - Found ${deviceCheck.recordset.length} matching device(s)`
    );
    console.log(`   - Is registered: ${isRegistered}`);

    // ✅ Helper function for getting real user IP
    const getRealUserIP = (req) => {
      return (
        req.headers["x-forwarded-for"]?.split(",")[0] ||
        req.headers["x-real-ip"] ||
        req.connection?.remoteAddress ||
        req.ip ||
        "unknown"
      );
    };

    // ✅ FIXED: Only trigger emergency alerts if device is NOT registered
    if (!isRegistered && patientUserId) {
      console.log(`🚨 UNREGISTERED CLIENT DEVICE DETECTED`);

      // Import the alert function
      const {
        triggerEmergencyAlerts,
      } = require("../controllers/consolidatedSmartTokenController");

      const deviceInfo = {
        type: deviceMetadata?.deviceType || "unknown",
        browser: deviceMetadata?.browserName || "unknown",
        os: deviceMetadata?.osName || "unknown",
        deviceName: deviceMetadata?.deviceName || "unknown",
        isRegistered: false,
        fingerprintHash: deviceFingerprint.hash,
      };

      // ✅ FIXED: Log with shorter accessMode value to prevent truncation
      const logResult = await pool
        .request()
        .input("tokenId", sql.NVarChar, id)
        .input("containerName", sql.NVarChar, "patient-data")
        .input("folderName", sql.NVarChar, "emergency-access")
        .input("ipAddress", sql.NVarChar, getRealUserIP(req))
        .input("accessMode", sql.NVarChar, "client_unregistered") // ✅ FIXED: Shorter value
        .input(
          "deviceFingerprint",
          sql.NVarChar,
          JSON.stringify(deviceFingerprint)
        )
        .input("isRegisteredDevice", sql.Bit, 0)
        .input("deviceName", sql.NVarChar, deviceInfo.deviceName)
        .input("deviceType", sql.NVarChar, deviceInfo.type)
        .input("patientUserId", sql.Int, patientUserId)
        .input("userAgent", sql.NVarChar, req.headers["user-agent"] || "")
        .query(`
          INSERT INTO EnhancedTokenAccessLog (
            tokenId, containerName, folderName, ipAddress, accessMode,
            deviceFingerprint, isRegisteredDevice, deviceName, deviceType,
            patientUserId, userAgent, alertsSent
          )
          OUTPUT INSERTED.logId
          VALUES (
            @tokenId, @containerName, @folderName, @ipAddress, @accessMode,
            @deviceFingerprint, @isRegisteredDevice, @deviceName, @deviceType,
            @patientUserId, @userAgent, 0
          )
        `);

      const enhancedLogId = logResult.recordset[0].logId;

      // ✅ NOW trigger emergency alerts with CLIENT fingerprint detection
      try {
        const alertResult = await triggerEmergencyAlerts(
          id,
          patientUserId,
          patientName,
          enhancedLogId,
          deviceInfo,
          { type: "ip", source: "client_verification" },
          req
        );

        console.log(
          `✅ Emergency alerts triggered for CLIENT fingerprint:`,
          alertResult.success
        );
      } catch (alertError) {
        console.error("Error triggering emergency alerts:", alertError);
      }
    } else if (isRegistered) {
      console.log(`✅ REGISTERED DEVICE DETECTED - No alerts needed`);

      // ✅ Log the registered device access
      await pool
        .request()
        .input("tokenId", sql.NVarChar, id)
        .input("containerName", sql.NVarChar, "patient-data")
        .input("folderName", sql.NVarChar, "emergency-access")
        .input("ipAddress", sql.NVarChar, getRealUserIP(req))
        .input("accessMode", sql.NVarChar, "client_registered") // ✅ FIXED: Shorter value
        .input(
          "deviceFingerprint",
          sql.NVarChar,
          JSON.stringify(deviceFingerprint)
        )
        .input("isRegisteredDevice", sql.Bit, 1)
        .input(
          "deviceName",
          sql.NVarChar,
          deviceMetadata?.deviceName || "Unknown"
        )
        .input(
          "deviceType",
          sql.NVarChar,
          deviceMetadata?.deviceType || "unknown"
        )
        .input("patientUserId", sql.Int, patientUserId)
        .input("userAgent", sql.NVarChar, req.headers["user-agent"] || "")
        .query(`
          INSERT INTO EnhancedTokenAccessLog (
            tokenId, containerName, folderName, ipAddress, accessMode,
            deviceFingerprint, isRegisteredDevice, deviceName, deviceType,
            patientUserId, userAgent, alertsSent
          )
          VALUES (
            @tokenId, @containerName, @folderName, @ipAddress, @accessMode,
            @deviceFingerprint, @isRegisteredDevice, @deviceName, @deviceType,
            @patientUserId, @userAgent, 0
          )
        `);

      const registeredDevice = deviceCheck.recordset[0];
      console.log(
        `   - Device registered by user ID: ${registeredDevice.registeredBy}`
      );
      console.log(`   - Registration date: ${registeredDevice.registeredAt}`);
      console.log(`   - Device name: ${registeredDevice.deviceName}`);
    }

    // ✅ Return comprehensive response
    res.json({
      success: true,
      message: "Device fingerprint processed with CLIENT verification",
      tokenId: id,
      clientFingerprintHash: deviceFingerprint.hash,
      isRegistered: isRegistered,
      alertsTriggered: !isRegistered,
      verificationType: "client_fingerprint",
      deviceInfo: {
        name: deviceMetadata?.deviceName,
        type: deviceMetadata?.deviceType,
        browser: deviceMetadata?.browserName,
        os: deviceMetadata?.osName,
      },
      registeredDeviceCount: deviceCheck.recordset.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error in enhanced POST fingerprint route:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process device fingerprint",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

// File access routes
router.get(
  "/file/:containerName/:folderName/:fileName/view",
  getPatientFileViewOnly
);
router.get(
  "/file/:containerName/:folderName/:fileName",
  getPatientFileViewOnly
);

// =============================================================================
// AUTHENTICATED USER ROUTES (patients and doctors)
// =============================================================================

// User-specific token access (patients see their tokens, doctors see their patients' tokens)
router.get("/my-tokens", auth, checkRole(["patient", "doctor"]), getMyTokens);

// User-specific alerts (patients see alerts for their tokens, doctors see alerts for their patients' tokens)
router.get("/my-alerts", auth, checkRole(["patient", "doctor"]), getMyAlerts);

// Mark alert as read (patients and doctors can mark their own alerts as read)
router.post(
  "/alerts/:alertId/read",
  auth,
  checkRole(["patient", "doctor"]),
  markAlertAsRead
);

// Get device logs for a specific token (patients and doctors can see logs for their tokens)
router.get(
  "/device-logs/:tokenId",
  auth,
  checkRole(["patient", "doctor"]),
  getDeviceLogs
);

// =============================================================================
// AUTHENTICATED ADMIN ROUTES
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

// Map frontend call to backend function
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

module.exports = router;
