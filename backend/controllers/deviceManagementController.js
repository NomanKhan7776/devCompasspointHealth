// controllers/deviceManagementController.js - FingerprintJS Pro ONLY Implementation
const { pool, sql } = require("../config/database");
const fingerprintjsService = require("../services/fingerprintjsService");
const crypto = require("crypto");

/**
 * Validate FingerprintJS Pro data - NO fallbacks allowed
 */
const validateFingerprintJSProOnly = (deviceFingerprint, userAgent) => {
  try {
    console.log("🔐 Validating FingerprintJS Pro fingerprint...");

    // Check if fingerprint exists
    if (!deviceFingerprint || typeof deviceFingerprint !== "object") {
      return {
        isValid: false,
        error: "MISSING_FINGERPRINT",
        message: "FingerprintJS Pro fingerprint is required",
      };
    }

    // Check for FingerprintJS Pro visitorId
    if (
      !deviceFingerprint.visitorId ||
      typeof deviceFingerprint.visitorId !== "string"
    ) {
      return {
        isValid: false,
        error: "MISSING_VISITOR_ID",
        message: "FingerprintJS Pro visitorId is required",
      };
    }

    // Check for FingerprintJS Pro requestId
    if (
      !deviceFingerprint.requestId ||
      typeof deviceFingerprint.requestId !== "string"
    ) {
      return {
        isValid: false,
        error: "MISSING_REQUEST_ID",
        message: "FingerprintJS Pro requestId is required",
      };
    }

    // Validate confidenceScore score exists
    if (
      typeof deviceFingerprint.confidenceScore !== "number" ||
      deviceFingerprint.confidenceScore < 0 ||
      deviceFingerprint.confidenceScore > 1
    ) {
      return {
        isValid: false,
        error: "INVALID_confidenceScore",
        message:
          "FingerprintJS Pro confidenceScore score must be between 0 and 1",
      };
    }

    // Validate service is FingerprintJS Pro
    const service = deviceFingerprint.metadata?.service;
    if (service !== "fingerprintjs_pro") {
      return {
        isValid: false,
        error: "INVALID_SERVICE",
        message: `Expected 'fingerprintjs_pro' service, got '${service}'`,
      };
    }

    // Validate visitorId format (FingerprintJS Pro format)
    if (
      deviceFingerprint.visitorId.length < 15 ||
      deviceFingerprint.visitorId.length > 30
    ) {
      return {
        isValid: false,
        error: "INVALID_VISITOR_ID_FORMAT",
        message: "FingerprintJS Pro visitorId format is invalid",
      };
    }

    console.log("✅ FingerprintJS Pro fingerprint validation passed:", {
      visitorId: deviceFingerprint.visitorId,
      requestId: deviceFingerprint.requestId,
      confidenceScore: deviceFingerprint.confidenceScore,
      service: service,
    });

    return {
      isValid: true,
      visitorId: deviceFingerprint.visitorId,
      requestId: deviceFingerprint.requestId,
      confidenceScore: deviceFingerprint.confidenceScore,
      service: service,
    };
  } catch (error) {
    return {
      isValid: false,
      error: "VALIDATION_ERROR",
      message: `FingerprintJS Pro validation failed: ${error.message}`,
    };
  }
};

/**
 * @route   POST /api/devices/register
 * @desc    Register device using ONLY FingerprintJS Pro
 * @access  Private
 */
exports.registerDevice = async (req, res) => {
  try {
    const { deviceFingerprint, deviceName, deviceType = "patient" } = req.body;
    const userAgent = req.headers["user-agent"] || "";

    console.log("📱 FingerprintJS Pro Device Registration Started:", {
      userId: req.user.userId,
      deviceName: deviceName,
      visitorId: deviceFingerprint?.visitorId,
      confidenceScore: deviceFingerprint?.confidenceScore,
      service: deviceFingerprint?.metadata?.service,
    });

    // Validate required fields
    if (!deviceName) {
      return res.status(400).json({
        success: false,
        message: "Device name is required",
        error: "MISSING_DEVICE_NAME",
      });
    }

    // Validate FingerprintJS Pro fingerprint - NO fallbacks allowed
    const validation = validateFingerprintJSProOnly(
      deviceFingerprint,
      userAgent
    );
    if (!validation.isValid) {
      console.error(
        "❌ FingerprintJS Pro validation failed:",
        validation.error
      );
      return res.status(400).json({
        success: false,
        message: validation.message,
        error: validation.error,
        required:
          "Valid FingerprintJS Pro fingerprint with visitorId, requestId, and confidenceScore score",
      });
    }

    console.log("✅ FingerprintJS Pro fingerprint validated:", {
      visitorId: validation.visitorId,
      confidenceScore: validation.confidenceScore,
      service: validation.service,
    });

    // Server-side validation with FingerprintJS Pro API if available
    // if (fingerprintjsService.isAvailable()) {
    //   try {
    //     console.log("🔐 Validating with FingerprintJS Pro server API...");

    //     const serverValidation = await fingerprintjsService.validateFingerprint(
    //       validation.visitorId,
    //       validation.requestId
    //     );

    //     if (!serverValidation.isValid) {
    //       console.warn(
    //         "⚠️ FingerprintJS Pro server validation failed:",
    //         serverValidation.reason
    //       );
    //       // Continue with registration but log the issue
    //     } else {
    //       console.log("✅ FingerprintJS Pro server validation successful");
    //     }
    //   } catch (validationError) {
    //     console.warn(
    //       "⚠️ FingerprintJS Pro server validation error:",
    //       validationError.message
    //     );
    //     // Continue with registration - don't block for server validation errors
    //   }
    // }

    await pool.connect();

    // Check for existing device using FingerprintJS Pro visitorId
    const existingDevice = await pool
      .request()
      .input("userId", sql.Int, req.user.userId)
      .input("visitorId", sql.NVarChar, validation.visitorId).query(`
        SELECT 
          fingerprintId, 
          deviceName, 
          isActive,
          fingerprint,
          registeredAt,
          lastUpdated,
          userAgent,
          deviceType,
          confidenceScore,
          requestId,
          CASE 
            WHEN dal.lastAccess IS NOT NULL 
            THEN dal.lastAccess 
            ELSE registeredAt 
          END as lastUsed
        FROM DeviceFingerprints df
        LEFT JOIN (
          SELECT 
            deviceFingerprintId, 
            MAX(accessTime) as lastAccess
          FROM DeviceAccessLogs 
          GROUP BY deviceFingerprintId
        ) dal ON df.fingerprintId = dal.deviceFingerprintId
        WHERE userId = @userId 
        AND visitorId = @visitorId
        ORDER BY registeredAt DESC
      `);

    if (existingDevice.recordset.length > 0) {
      const device = existingDevice.recordset[0];

      console.log("🔍 FingerprintJS Pro Duplicate Device Check:", {
        existingVisitorId: validation.visitorId,
        deviceName: device.deviceName,
        isActive: device.isActive,
      });

      // If device exists but inactive, reactivate it
      if (!device.isActive) {
        await pool
          .request()
          .input("fingerprintId", sql.Int, device.fingerprintId)
          .input("deviceName", sql.NVarChar, deviceName)
          .input("fingerprint", sql.NVarChar, JSON.stringify(deviceFingerprint))
          .input("confidenceScore", sql.Float, validation.confidenceScore)
          .input("requestId", sql.NVarChar, validation.requestId).query(`
            UPDATE DeviceFingerprints 
            SET 
              isActive = 1, 
              deviceName = @deviceName,
              fingerprint = @fingerprint,
              confidenceScore = @confidenceScore,
              requestId = @requestId,
              lastUpdated = GETDATE() 
            WHERE fingerprintId = @fingerprintId
          `);

        console.log("✅ FingerprintJS Pro Device Reactivated:", {
          fingerprintId: device.fingerprintId,
          visitorId: validation.visitorId,
          deviceName: deviceName,
        });

        return res.json({
          success: true,
          message: "Device reactivated successfully with FingerprintJS Pro",
          device: {
            fingerprintId: device.fingerprintId,
            deviceName: deviceName,
            visitorId: validation.visitorId,
            confidenceScore: validation.confidenceScore,
            service: "fingerprintjs_pro",
            wasReactivated: true,
          },
        });
      }

      // Device already exists and is active
      return res.status(409).json({
        success: false,
        message: "This device is already registered with FingerprintJS Pro",
        error: "DEVICE_ALREADY_REGISTERED_FPJS",
        existingDevice: {
          deviceName: device.deviceName,
          registeredAt: device.registeredAt,
          lastUsed: device.lastUsed,
          visitorId: validation.visitorId,
          service: "fingerprintjs_pro",
        },
      });
    }

    // Extract device information from FingerprintJS Pro data
    const deviceInfo = fingerprintjsService.isAvailable()
      ? fingerprintjsService.extractDeviceInfo(deviceFingerprint)
      : {
          userAgent: userAgent,
          platform: deviceFingerprint.details?.platform || "unknown",
          confidenceScore: validation.confidenceScore,
          service: "fingerprintjs_pro",
        };

    console.log("📱 Registering New FingerprintJS Pro Device:", {
      visitorId: validation.visitorId,
      confidenceScore: validation.confidenceScore,
      method: deviceFingerprint.metadata?.method,
      service: "fingerprintjs_pro",
      deviceName: deviceName,
      deviceType: deviceType,
    });

    // Register new device with FingerprintJS Pro data
    const result = await pool
      .request()
      .input("userId", sql.Int, req.user.userId)
      .input("deviceType", sql.NVarChar, deviceType)
      .input("deviceName", sql.NVarChar, deviceName)
      .input("fingerprint", sql.NVarChar, JSON.stringify(deviceFingerprint))
      .input("userAgent", sql.NVarChar, deviceInfo.userAgent || userAgent)
      .input(
        "screenResolution",
        sql.NVarChar,
        deviceInfo.screen?.width && deviceInfo.screen?.height
          ? `${deviceInfo.screen.width}x${deviceInfo.screen.height}`
          : ""
      )
      .input("platform", sql.NVarChar, deviceInfo.platform || "")
      .input("confidenceScore", sql.Float, validation.confidenceScore)
      .input("visitorId", sql.NVarChar, validation.visitorId)
      .input("requestId", sql.NVarChar, validation.requestId)
      .input("registeredBy", sql.Int, req.user.userId).query(`
        INSERT INTO DeviceFingerprints (
          userId, deviceType, deviceName, fingerprint, userAgent, 
          screenResolution, platform, confidenceScore, visitorId, requestId, registeredBy,
          registeredAt, lastUpdated, isActive
        )
        OUTPUT INSERTED.fingerprintId
        VALUES (
          @userId, @deviceType, @deviceName, @fingerprint, @userAgent,
          @screenResolution, @platform, @confidenceScore, @visitorId, @requestId, @registeredBy,
          GETDATE(), GETDATE(), 1
        )
      `);

    console.log("✅ FingerprintJS Pro Device Registered Successfully:", {
      fingerprintId: result.recordset[0].fingerprintId,
      visitorId: validation.visitorId,
      confidenceScore: validation.confidenceScore,
    });

    res.json({
      success: true,
      message: "Device registered successfully with FingerprintJS Pro",
      device: {
        fingerprintId: result.recordset[0].fingerprintId,
        deviceName: deviceName,
        visitorId: validation.visitorId,
        confidenceScore: validation.confidenceScore,
        service: "fingerprintjs_pro",
        registeredAt: new Date(),
      },
    });
  } catch (error) {
    console.error("❌ FingerprintJS Pro Registration Error:", {
      error: error.message,
      stack: error.stack,
      service: "fingerprintjs_pro",
      timestamp: new Date().toISOString(),
    });

    res.status(500).json({
      success: false,
      message: "Failed to register device with FingerprintJS Pro",
      error: "FPJS_REGISTRATION_FAILED",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * @route   POST /api/devices/verify
 * @desc    Verify device using ONLY FingerprintJS Pro
 * @access  Private
 */
exports.verifyDevice = async (req, res) => {
  try {
    const { deviceFingerprint } = req.body;

    console.log("🔄 FingerprintJS Pro Device Verification:", {
      userId: req.user.userId,
      visitorId: deviceFingerprint?.visitorId,
      confidenceScore: deviceFingerprint?.confidenceScore,
      service: deviceFingerprint?.metadata?.service,
    });

    // Validate FingerprintJS Pro fingerprint
    const validation = validateFingerprintJSProOnly(
      deviceFingerprint,
      req.headers["user-agent"]
    );
    if (!validation.isValid) {
      console.error(
        "❌ FingerprintJS Pro device verification failed:",
        validation.error
      );
      return res.status(400).json({
        success: false,
        message: validation.message,
        error: validation.error,
        isAuthorized: false,
      });
    }

    await pool.connect();

    // Check if device is registered using FingerprintJS Pro visitorId
    const deviceResult = await pool
      .request()
      .input("userId", sql.Int, req.user.userId)
      .input("visitorId", sql.NVarChar, validation.visitorId).query(`
        SELECT 
          fingerprintId, 
          deviceName, 
          deviceType,
          isActive,
          confidenceScore,
          requestId
        FROM DeviceFingerprints
        WHERE userId = @userId 
        AND isActive = 1
        AND visitorId = @visitorId
        ORDER BY registeredAt DESC
      `);

    if (deviceResult.recordset.length === 0) {
      console.log("❌ FingerprintJS Pro Device Not Authorized:", {
        userId: req.user.userId,
        visitorId: validation.visitorId,
      });

      return res.status(403).json({
        success: false,
        message: "Device not authorized with FingerprintJS Pro",
        isAuthorized: false,
        error: "DEVICE_UNAUTHORIZED_FPJS",
        service: "fingerprintjs_pro",
      });
    }

    const device = deviceResult.recordset[0];

    console.log("✅ FingerprintJS Pro Device Verified:", {
      fingerprintId: device.fingerprintId,
      deviceName: device.deviceName,
      visitorId: validation.visitorId,
      confidenceScore: validation.confidenceScore,
      service: "fingerprintjs_pro",
    });

    // Log successful access
    await pool
      .request()
      .input("deviceFingerprintId", sql.Int, device.fingerprintId)
      .input("userId", sql.Int, req.user.userId)
      .input("accessType", sql.NVarChar, "fpjs_device_verification")
      .input("ipAddress", sql.NVarChar, req.ip)
      .input(
        "location",
        sql.NVarChar,
        JSON.stringify({
          ip: req.ip,
          timestamp: new Date().toISOString(),
          visitorId: validation.visitorId,
          service: "fingerprintjs_pro",
        })
      ).query(`
        INSERT INTO DeviceAccessLogs 
        (deviceFingerprintId, userId, accessType, ipAddress, location)
        VALUES (@deviceFingerprintId, @userId, @accessType, @ipAddress, @location)
      `);

    res.json({
      success: true,
      message: "Device verified with FingerprintJS Pro",
      isAuthorized: true,
      device: {
        fingerprintId: device.fingerprintId,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        visitorId: validation.visitorId,
        confidenceScore: validation.confidenceScore,
        service: "fingerprintjs_pro",
      },
    });
  } catch (error) {
    console.error("❌ FingerprintJS Pro Verification Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify device with FingerprintJS Pro",
      error: "FPJS_VERIFICATION_FAILED",
      service: "fingerprintjs_pro",
    });
  }
};

/**
 * @route   POST /api/devices/:qrToken/register
 * @desc    Register family device via QR using ONLY FingerprintJS Pro
 * @access  Public
 */
exports.registerDeviceViaQR = async (req, res) => {
  try {
    const { qrToken } = req.params;
    const { deviceFingerprint, deviceName } = req.body;
    const userAgent = req.headers["user-agent"] || "";

    console.log("🔄 FingerprintJS Pro QR Family Device Registration:", {
      qrToken: qrToken.substring(0, 8) + "...",
      deviceName: deviceName,
      visitorId: deviceFingerprint?.visitorId,
      confidenceScore: deviceFingerprint?.confidenceScore,
      service: deviceFingerprint?.metadata?.service,
    });

    // Validate required fields
    if (!deviceName) {
      return res.status(400).json({
        success: false,
        message: "Device name is required",
        error: "MISSING_DEVICE_NAME",
      });
    }

    // Validate FingerprintJS Pro fingerprint - NO fallbacks allowed
    const validation = validateFingerprintJSProOnly(
      deviceFingerprint,
      userAgent
    );
    if (!validation.isValid) {
      console.error(
        "❌ FingerprintJS Pro QR fingerprint validation failed:",
        validation.error
      );
      return res.status(400).json({
        success: false,
        message:
          "Invalid FingerprintJS Pro fingerprint for family registration",
        error: "INVALID_FINGERPRINTJS_PRO_QR",
        details: validation.message,
      });
    }

    await pool.connect();

    // Verify QR token and get patient info
    const qrData = await pool.request().input("qrToken", sql.NVarChar, qrToken)
      .query(`
        SELECT qrt.patientUserId, qrt.expiresAt, qrt.isUsed, u.name as patientName
        FROM QRRegistrationTokens qrt
        JOIN Users u ON qrt.patientUserId = u.userId
        WHERE qrt.qrToken = @qrToken
      `);

    if (qrData.recordset.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid QR code",
        error: "QR_NOT_FOUND",
      });
    }

    const qr = qrData.recordset[0];

    if (new Date() > new Date(qr.expiresAt)) {
      return res.status(400).json({
        success: false,
        message: "QR code has expired",
        error: "QR_EXPIRED",
      });
    }

    if (qr.isUsed) {
      return res.status(400).json({
        success: false,
        message: "QR code has already been used",
        error: "QR_ALREADY_USED",
      });
    }

    // Check for existing family device using FingerprintJS Pro visitorId
    const existingDevice = await pool
      .request()
      .input("patientUserId", sql.Int, qr.patientUserId)
      .input("visitorId", sql.NVarChar, validation.visitorId).query(`
        SELECT 
          fingerprintId, 
          deviceName, 
          isActive,
          registeredAt,
          deviceType
        FROM DeviceFingerprints
        WHERE (userId = @patientUserId OR registeredBy = @patientUserId)
        AND deviceType = 'family'
        AND visitorId = @visitorId
        ORDER BY registeredAt DESC
      `);

    if (existingDevice.recordset.length > 0) {
      const device = existingDevice.recordset[0];

      console.log("🔍 FingerprintJS Pro QR Duplicate Family Device:", {
        existingDevice: device.deviceName,
        newDevice: deviceName,
        visitorId: validation.visitorId,
        isActive: device.isActive,
      });

      return res.status(409).json({
        success: false,
        message:
          "This device is already registered as a family device with FingerprintJS Pro",
        error: "DEVICE_ALREADY_REGISTERED_FAMILY_FPJS",
        existingDevice: {
          deviceName: device.deviceName,
          registeredAt: device.registeredAt,
          deviceType: device.deviceType,
          visitorId: validation.visitorId,
        },
      });
    }

    // Extract device information
    const deviceInfo = fingerprintjsService.isAvailable()
      ? fingerprintjsService.extractDeviceInfo(deviceFingerprint)
      : {
          userAgent: userAgent,
          confidenceScore: validation.confidenceScore,
          service: "fingerprintjs_pro",
        };

    // Register family device with FingerprintJS Pro
    const deviceResult = await pool
      .request()
      .input("patientUserId", sql.Int, qr.patientUserId)
      .input("deviceName", sql.NVarChar, deviceName)
      .input("fingerprint", sql.NVarChar, JSON.stringify(deviceFingerprint))
      .input("userAgent", sql.NVarChar, deviceInfo.userAgent || userAgent)
      .input("confidenceScore", sql.Float, validation.confidenceScore)
      .input("visitorId", sql.NVarChar, validation.visitorId)
      .input("requestId", sql.NVarChar, validation.requestId).query(`
    INSERT INTO DeviceFingerprints (
      userId, registeredBy, deviceType, deviceName, fingerprint, 
      userAgent, confidenceScore, visitorId, requestId,
      registeredAt, lastUpdated, isActive
    )
    OUTPUT INSERTED.fingerprintId
    VALUES (
      @patientUserId, @patientUserId, 'family', @deviceName, @fingerprint,
      @userAgent, @confidenceScore, @visitorId, @requestId,
      GETDATE(), GETDATE(), 1
    )
  `);
    // Mark QR as used
    await pool
      .request()
      .input("qrToken", sql.NVarChar, qrToken)
      .input(
        "usedByFingerprint",
        sql.NVarChar,
        JSON.stringify(deviceFingerprint)
      ).query(`
        UPDATE QRRegistrationTokens 
        SET isUsed = 1, usedAt = GETDATE(), usedByFingerprint = @usedByFingerprint
        WHERE qrToken = @qrToken
      `);

    console.log("✅ FingerprintJS Pro Family Device Registered via QR:", {
      fingerprintId: deviceResult.recordset[0].fingerprintId,
      patientName: qr.patientName,
      deviceName: deviceName,
      visitorId: validation.visitorId,
      confidenceScore: validation.confidenceScore,
    });

    res.json({
      success: true,
      message: `Family device registered successfully for ${qr.patientName} with FingerprintJS Pro`,
      device: {
        fingerprintId: deviceResult.recordset[0].fingerprintId,
        deviceName: deviceName,
        deviceType: "family",
        patientName: qr.patientName,
        visitorId: validation.visitorId,
        confidenceScore: validation.confidenceScore,
        service: "fingerprintjs_pro",
      },
    });
  } catch (error) {
    console.error("❌ FingerprintJS Pro QR Family Registration Error:", {
      error: error.message,
      qrToken: req.params.qrToken,
      timestamp: new Date().toISOString(),
    });

    res.status(500).json({
      success: false,
      message:
        "Failed to register family device via QR code with FingerprintJS Pro",
      error: "QR_REGISTRATION_FAILED",
    });
  }
};

/**
 * Get user's registered devices - Filter to show only FingerprintJS Pro devices
 */
/**
 * Get user's registered devices - Filter to show only FingerprintJS Pro devices
 * Replace your existing getMyDevices function with this one
 */
/**
 * Get user's registered devices - FIXED to match your database schema
 * Replace your existing getMyDevices function with this one
 */
exports.getMyDevices = async (req, res) => {
  try {
    console.log("📱 FingerprintJS Pro Get My Devices Request:", {
      userId: req.user.userId,
      timestamp: new Date().toISOString(),
    });

    await pool.connect();

    const devices = await pool
      .request()
      .input("userId", sql.Int, req.user.userId).query(`
        SELECT 
          fingerprintId,
          deviceName,
          deviceType,
          isActive,
          registeredAt,
          lastUpdated,
          userAgent,
          confidenceScore,
          visitorId,
          requestId,
          screenResolution,
          timezone,
          language,
          platform,
          registeredBy,
          CASE 
            WHEN dal.lastAccess IS NOT NULL 
            THEN dal.lastAccess 
            ELSE registeredAt 
          END as lastUsed
        FROM DeviceFingerprints df
        LEFT JOIN (
          SELECT 
            deviceFingerprintId, 
            MAX(accessTime) as lastAccess
          FROM DeviceAccessLogs 
          GROUP BY deviceFingerprintId
        ) dal ON df.fingerprintId = dal.deviceFingerprintId
        WHERE (userId = @userId OR registeredBy = @userId)
        AND visitorId IS NOT NULL
        ORDER BY registeredAt DESC
      `);

    console.log(
      `✅ Found ${devices.recordset.length} FingerprintJS Pro devices for user ${req.user.userId}`
    );

    // Add service information to each device and map confidenceScore to confidenceScore
    const enhancedDevices = devices.recordset.map((device) => ({
      ...device,
      confidenceScore: device.confidenceScore, // Map confidenceScore to confidenceScore for frontend compatibility
      service: "fingerprintjs_pro",
      // Don't expose sensitive fingerprint data to frontend
      fingerprint: undefined,
    }));

    res.json({
      success: true,
      devices: enhancedDevices,
      service: "fingerprintjs_pro_only",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error fetching FingerprintJS Pro devices:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch devices",
      error: "FETCH_DEVICES_FAILED",
      service: "fingerprintjs_pro",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
/**
 * Generate QR code for family device registration
 */
exports.generateQRForFamilyRegistration = async (req, res) => {
  try {
    // Only patients can generate QR codes for family registration
    if (req.user.role !== "patient") {
      return res.status(403).json({
        success: false,
        message: "Only patients can generate family registration QR codes",
      });
    }

    await pool.connect();

    // Generate unique QR token
    const qrToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Save QR token
    await pool
      .request()
      .input("patientUserId", sql.Int, req.user.userId)
      .input("qrToken", sql.NVarChar, qrToken)
      .input("expiresAt", sql.DateTime, expiresAt).query(`
        INSERT INTO QRRegistrationTokens (patientUserId, qrToken, expiresAt)
        VALUES (@patientUserId, @qrToken, @expiresAt)
      `);

    // Create QR code URL
    const qrUrl = `${
      process.env.FRONTEND_URL || "https://your-domain.com"
    }/register-device/${qrToken}`;

    console.log("📱 FingerprintJS Pro QR CODE GENERATED:", {
      patientUserId: req.user.userId,
      qrToken: qrToken,
      expiresAt: expiresAt,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      qrToken: qrToken,
      qrUrl: qrUrl,
      expiresAt: expiresAt,
      message:
        "QR code generated successfully for FingerprintJS Pro family device registration",
    });
  } catch (error) {
    console.error("FingerprintJS Pro QR generation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate QR code",
    });
  }
};

/**
 * Check QR status
 */
exports.checkQRStatus = async (req, res) => {
  try {
    const { qrToken } = req.params;

    if (!qrToken) {
      return res.status(400).json({
        success: false,
        message: "QR token is required",
        error: "MISSING_QR_TOKEN",
      });
    }

    console.log("📱 FingerprintJS Pro QR STATUS CHECK:", {
      qrToken: qrToken.substring(0, 8) + "...",
      timestamp: new Date().toISOString(),
    });

    await pool.connect();

    // Get QR token information
    const qrResult = await pool
      .request()
      .input("qrToken", sql.NVarChar, qrToken).query(`
        SELECT 
          qrt.patientUserId,
          qrt.expiresAt,
          qrt.isUsed,
          qrt.usedAt,
          u.name as patientName
        FROM QRRegistrationTokens qrt
        JOIN Users u ON qrt.patientUserId = u.userId
        WHERE qrt.qrToken = @qrToken
      `);

    if (qrResult.recordset.length === 0) {
      console.log("⚠️ FingerprintJS Pro QR token not found:", {
        qrToken: qrToken.substring(0, 8) + "...",
      });

      return res.json({
        success: true,
        status: {
          isValid: false,
          isExpired: false,
          isUsed: false,
          reason: "QR_NOT_FOUND",
          patientName: null,
        },
      });
    }

    const qrData = qrResult.recordset[0];
    const now = new Date();
    const expiresAt = new Date(qrData.expiresAt);
    const isExpired = now > expiresAt;
    const isUsed = qrData.isUsed;
    const isValid = !isExpired && !isUsed;

    console.log("✅ FingerprintJS Pro QR STATUS RESULT:", {
      qrToken: qrToken.substring(0, 8) + "...",
      patientName: qrData.patientName,
      isValid: isValid,
      isExpired: isExpired,
      isUsed: isUsed,
      expiresAt: qrData.expiresAt,
      usedAt: qrData.usedAt,
    });

    res.json({
      success: true,
      status: {
        isValid: isValid,
        isExpired: isExpired,
        isUsed: isUsed,
        patientName: qrData.patientName,
        expiresAt: qrData.expiresAt,
        usedAt: qrData.usedAt,
        service: "fingerprintjs_pro",
        reason: !isValid ? (isExpired ? "EXPIRED" : "USED") : null,
      },
    });
  } catch (error) {
    console.error("❌ FingerprintJS Pro QR STATUS CHECK ERROR:", {
      error: error.message,
      qrToken: req.params.qrToken
        ? req.params.qrToken.substring(0, 8) + "..."
        : "undefined",
      timestamp: new Date().toISOString(),
    });

    res.status(500).json({
      success: false,
      message: "Failed to check QR status",
      error: "QR_STATUS_CHECK_FAILED",
    });
  }
};

/**
 * Check if device is registered - Used by SmartToken verification
 * @param {string} visitorId - FingerprintJS Pro visitor ID
 * @param {string} patientUserId - Patient user ID
 * @returns {Promise<Object>} - Whether device is registered
 */
exports.checkDeviceRegistration = async (visitorId, patientUserId) => {
  try {
    console.log("🔍 Checking FingerprintJS Pro device registration:", {
      visitorId: visitorId,
      patientUserId: patientUserId,
    });

    await pool.connect();

    const result = await pool
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
          confidenceScore
        FROM DeviceFingerprints 
        WHERE isActive = 1
        AND (userId = @patientUserId OR registeredBy = @patientUserId)
        AND visitorId = @visitorId
        ORDER BY registeredAt DESC
      `);

    const isRegistered = result.recordset.length > 0;

    if (isRegistered) {
      const device = result.recordset[0];
      console.log("✅ FingerprintJS Pro Device Found:", {
        fingerprintId: device.fingerprintId,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        registeredBy: device.registeredBy,
      });
    } else {
      console.log(
        "❌ FingerprintJS Pro Device Not Found for visitorId:",
        visitorId
      );
    }

    return {
      isRegistered,
      device: isRegistered ? result.recordset[0] : null,
      visitorId,
      service: "fingerprintjs_pro",
    };
  } catch (error) {
    console.error(
      "❌ Error checking FingerprintJS Pro device registration:",
      error
    );
    return {
      isRegistered: false,
      device: null,
      error: error.message,
      service: "fingerprintjs_pro",
    };
  }
};

/**
 * @route   DELETE /api/devices/:fingerprintId
 * @desc    Remove/deactivate a device using ONLY FingerprintJS Pro
 * @access  Private
 */
exports.removeDevice = async (req, res) => {
  try {
    const { fingerprintId } = req.params;
    const { permanent } = req.query; // Check for permanent delete flag

    console.log("🗑️ FingerprintJS Pro Device Removal Request:", {
      fingerprintId: fingerprintId,
      userId: req.user.userId,
      permanent: permanent === "true",
      timestamp: new Date().toISOString(),
    });

    // Validate fingerprintId
    if (!fingerprintId) {
      return res.status(400).json({
        success: false,
        message: "Device fingerprint ID is required",
        error: "MISSING_FINGERPRINT_ID",
      });
    }

    await pool.connect();

    // Determine the lookup field and parameter type
    let deviceLookupValue = fingerprintId;
    let lookupField;
    let sqlType;

    // Check if it's a numeric ID (old format), GUID (new format), or visitorId (string format)
    if (/^\d+$/.test(fingerprintId)) {
      // It's a numeric fingerprintId
      deviceLookupValue = parseInt(fingerprintId);
      lookupField = "fingerprintId";
      sqlType = sql.Int;
    } else if (
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        fingerprintId
      )
    ) {
      // It's a GUID format - could be fingerprintId or visitorId
      deviceLookupValue = fingerprintId;
      lookupField = "fingerprintId"; // Try fingerprintId first since the error suggests it's a GUID column
      sqlType = sql.UniqueIdentifier;
    } else {
      // It's a visitorId (string)
      deviceLookupValue = fingerprintId;
      lookupField = "visitorId";
      sqlType = sql.NVarChar;
    }

    console.log("🔍 Looking up device by:", {
      lookupField: lookupField,
      lookupValue: deviceLookupValue,
      sqlType: sqlType.name,
    });

    // Build the appropriate query based on lookup field
    const deviceQuery =
      lookupField === "fingerprintId"
        ? `
        SELECT 
          fingerprintId,
          deviceName, 
          deviceType,
          fingerprint,
          visitorId,
          confidenceScore,
          registeredAt,
          isActive
        FROM DeviceFingerprints 
        WHERE fingerprintId = @lookupValue 
        AND (userId = @userId OR registeredBy = @userId)
        AND visitorId IS NOT NULL
      `
        : `
        SELECT 
          fingerprintId,
          deviceName, 
          deviceType,
          fingerprint,
          visitorId,
          confidenceScore,
          registeredAt,
          isActive
        FROM DeviceFingerprints 
        WHERE visitorId = @lookupValue 
        AND (userId = @userId OR registeredBy = @userId)
        AND visitorId IS NOT NULL
      `;

    const deviceCheck = await pool
      .request()
      .input("lookupValue", sqlType, deviceLookupValue)
      .input("userId", sql.Int, req.user.userId)
      .query(deviceQuery);

    if (deviceCheck.recordset.length === 0) {
      console.log("❌ FingerprintJS Pro device not found for removal:", {
        lookupField: lookupField,
        lookupValue: deviceLookupValue,
        userId: req.user.userId,
      });

      return res.status(404).json({
        success: false,
        message: "Device not found or access denied",
        error: "DEVICE_NOT_FOUND_FPJS",
        debugInfo: {
          lookupField: lookupField,
          lookupValue: deviceLookupValue,
        },
      });
    }

    const device = deviceCheck.recordset[0];

    // Validate this is a FingerprintJS Pro device
    if (!device.visitorId) {
      return res.status(400).json({
        success: false,
        message: "Can only remove FingerprintJS Pro registered devices",
        error: "NOT_FINGERPRINTJS_PRO_DEVICE",
      });
    }

    console.log("✅ FingerprintJS Pro Device Found for Removal:", {
      fingerprintId: device.fingerprintId,
      deviceName: device.deviceName,
      deviceType: device.deviceType,
      visitorId: device.visitorId,
      confidenceScore: device.confidenceScore,
      isActive: device.isActive,
      permanent: permanent === "true",
    });

    if (permanent === "true") {
      // PERMANENT DELETE - Remove from database completely
      console.log(
        "🗑️ PERMANENT DELETE - Removing device and all associated data"
      );

      try {
        // Start a transaction for atomic operations
        const transaction = pool.transaction();
        await transaction.begin();

        try {
          // Delete associated logs first (foreign key constraint)
          const deleteLogsResult = await transaction
            .request()
            .input(
              "deviceFingerprintId",
              typeof device.fingerprintId === "string" &&
                /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
                  device.fingerprintId
                )
                ? sql.UniqueIdentifier
                : sql.Int,
              device.fingerprintId
            ).query(`
              DELETE FROM DeviceAccessLogs 
              WHERE deviceFingerprintId = @deviceFingerprintId
            `);

          console.log(
            `🗑️ Deleted ${deleteLogsResult.rowsAffected[0]} access logs`
          );

          // Delete the device record
          const deleteDeviceResult = await transaction
            .request()
            .input(
              "fingerprintId",
              typeof device.fingerprintId === "string" &&
                /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
                  device.fingerprintId
                )
                ? sql.UniqueIdentifier
                : sql.Int,
              device.fingerprintId
            ).query(`
              DELETE FROM DeviceFingerprints 
              WHERE fingerprintId = @fingerprintId
            `);

          console.log(
            `🗑️ Deleted ${deleteDeviceResult.rowsAffected[0]} device records`
          );

          // Commit the transaction
          await transaction.commit();

          console.log("🗑️ FingerprintJS Pro DEVICE PERMANENTLY DELETED:", {
            fingerprintId: device.fingerprintId,
            deviceName: device.deviceName,
            deviceType: device.deviceType,
            visitorId: device.visitorId,
            userId: req.user.userId,
            timestamp: new Date().toISOString(),
          });

          res.json({
            success: true,
            message: "Device permanently deleted with FingerprintJS Pro",
            deletedDevice: {
              fingerprintId: device.fingerprintId,
              deviceName: device.deviceName,
              deviceType: device.deviceType,
              visitorId: device.visitorId,
              service: "fingerprintjs_pro",
              deletionType: "permanent",
            },
            timestamp: new Date().toISOString(),
          });
        } catch (transactionError) {
          // Rollback on error
          await transaction.rollback();
          throw transactionError;
        }
      } catch (deleteError) {
        console.error("❌ Permanent delete failed:", deleteError);
        throw new Error(`Permanent delete failed: ${deleteError.message}`);
      }
    } else {
      // SOFT DELETE - Existing functionality
      if (!device.isActive) {
        return res.status(400).json({
          success: false,
          message: "Device is already deactivated",
          error: "DEVICE_ALREADY_INACTIVE",
          device: {
            deviceName: device.deviceName,
            deviceType: device.deviceType,
            visitorId: device.visitorId,
          },
        });
      }

      // Deactivate device instead of deleting (preserve audit trail)
      await pool
        .request()
        .input(
          "fingerprintId",
          typeof device.fingerprintId === "string" &&
            /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
              device.fingerprintId
            )
            ? sql.UniqueIdentifier
            : sql.Int,
          device.fingerprintId
        ).query(`
          UPDATE DeviceFingerprints 
          SET isActive = 0, 
              lastUpdated = GETDATE() 
          WHERE fingerprintId = @fingerprintId
        `);

      // Log the device removal
      console.log("🗑️ FingerprintJS Pro DEVICE DEACTIVATED:", {
        fingerprintId: device.fingerprintId,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        visitorId: device.visitorId,
        userId: req.user.userId,
        timestamp: new Date().toISOString(),
      });

      // Log the removal action
      await pool
        .request()
        .input(
          "deviceFingerprintId",
          typeof device.fingerprintId === "string" &&
            /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
              device.fingerprintId
            )
            ? sql.UniqueIdentifier
            : sql.Int,
          device.fingerprintId
        )
        .input("userId", sql.Int, req.user.userId)
        .input("accessType", sql.NVarChar, "fpjs_device_removal")
        .input("ipAddress", sql.NVarChar, req.ip)
        .input(
          "location",
          sql.NVarChar,
          JSON.stringify({
            ip: req.ip,
            timestamp: new Date().toISOString(),
            visitorId: device.visitorId,
            service: "fingerprintjs_pro",
            action: "device_deactivated",
          })
        ).query(`
          INSERT INTO DeviceAccessLogs 
          (deviceFingerprintId, userId, accessType, ipAddress, location)
          VALUES (@deviceFingerprintId, @userId, @accessType, @ipAddress, @location)
        `);

      res.json({
        success: true,
        message: "Device deactivated successfully with FingerprintJS Pro",
        removedDevice: {
          fingerprintId: device.fingerprintId,
          deviceName: device.deviceName,
          deviceType: device.deviceType,
          visitorId: device.visitorId,
          service: "fingerprintjs_pro",
          deletionType: "soft",
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("❌ FingerprintJS Pro Remove Device Error:", {
      error: error.message,
      stack: error.stack,
      fingerprintId: req.params.fingerprintId,
      permanent: req.query.permanent,
      userId: req.user?.userId,
      timestamp: new Date().toISOString(),
    });

    res.status(500).json({
      success: false,
      message: "Failed to remove device with FingerprintJS Pro",
      error: "FPJS_REMOVAL_FAILED",
      details: error.message,
      debugInfo: {
        fingerprintId: req.params.fingerprintId,
        permanent: req.query.permanent,
        timestamp: new Date().toISOString(),
      },
    });
  }
};

module.exports = exports;
