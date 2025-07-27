// controllers/deviceManagementController.js - ANDROID-COMPATIBLE with enhanced mobile support
const { pool, sql } = require("../config/database");
const fingerprintjsService = require("../services/fingerprintjsService");

const crypto = require("crypto");

const validateFingerprintJSProData = (deviceFingerprint, userAgent) => {
  try {
    // Basic structure validation
    if (!deviceFingerprint || typeof deviceFingerprint !== "object") {
      return {
        isValid: false,
        error: "INVALID_FINGERPRINT_FORMAT",
        message: "Device fingerprint must be an object",
      };
    }

    // Check for required hash (visitor ID)
    if (!deviceFingerprint.hash || typeof deviceFingerprint.hash !== "string") {
      return {
        isValid: false,
        error: "MISSING_VISITOR_ID",
        message: "Device fingerprint must contain a valid visitor ID (hash)",
      };
    }

    // Validate hash format (FingerprintJS Pro visitor IDs are typically 20 characters)
    if (
      deviceFingerprint.hash.length < 10 ||
      deviceFingerprint.hash.length > 50
    ) {
      return {
        isValid: false,
        error: "INVALID_VISITOR_ID_FORMAT",
        message: "Visitor ID format is invalid",
      };
    }

    // Check for details object (optional but recommended)
    if (
      deviceFingerprint.details &&
      typeof deviceFingerprint.details !== "object"
    ) {
      return {
        isValid: false,
        error: "INVALID_DETAILS_FORMAT",
        message: "Fingerprint details must be an object",
      };
    }

    // Check for metadata object (optional but recommended)
    if (
      deviceFingerprint.metadata &&
      typeof deviceFingerprint.metadata !== "object"
    ) {
      return {
        isValid: false,
        error: "INVALID_METADATA_FORMAT",
        message: "Fingerprint metadata must be an object",
      };
    }

    // Additional validation for FingerprintJS Pro specific fields
    if (deviceFingerprint.details) {
      // Validate requestId if present
      if (
        deviceFingerprint.details.requestId &&
        typeof deviceFingerprint.details.requestId !== "string"
      ) {
        return {
          isValid: false,
          error: "INVALID_REQUEST_ID",
          message: "Request ID must be a string",
        };
      }
    }

    // Validate confidence score if present
    if (
      deviceFingerprint.metadata &&
      deviceFingerprint.metadata.confidenceScore !== undefined
    ) {
      const confidence = deviceFingerprint.metadata.confidenceScore;
      if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
        return {
          isValid: false,
          error: "INVALID_CONFIDENCE_SCORE",
          message: "Confidence score must be a number between 0 and 1",
        };
      }
    }

    return {
      isValid: true,
      visitorId: deviceFingerprint.hash,
      service: deviceFingerprint.metadata?.service || "fingerprintjs_pro",
      confidence: deviceFingerprint.metadata?.confidenceScore || 0.5,
    };
  } catch (error) {
    return {
      isValid: false,
      error: "VALIDATION_ERROR",
      message: `Validation failed: ${error.message}`,
    };
  }
};

// ✅ ANDROID FIX: Helper function to detect Android devices
const isAndroidDevice = (userAgent) => {
  return /Android/i.test(userAgent);
};

// ✅ ANDROID FIX: Helper function to detect mobile devices
const isMobileDevice = (userAgent) => {
  return /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(
    userAgent
  );
};

// ✅ ANDROID FIX: Helper function to extract Android-specific info
const getAndroidDeviceInfo = (userAgent, deviceFingerprint) => {
  const isAndroid = isAndroidDevice(userAgent);
  const isMobile = isMobileDevice(userAgent);

  let androidInfo = {
    isAndroid,
    isMobile,
    androidVersion: "unknown",
    chromeVersion: "unknown",
    deviceModel: "unknown",
  };

  if (isAndroid) {
    const androidMatch = userAgent.match(/Android\s([0-9\.]+)/);
    const chromeMatch = userAgent.match(/Chrome\/([0-9\.]+)/);
    const modelMatch = userAgent.match(/\(([^)]+)\)/);

    androidInfo.androidVersion = androidMatch ? androidMatch[1] : "unknown";
    androidInfo.chromeVersion = chromeMatch ? chromeMatch[1] : "unknown";
    androidInfo.deviceModel = modelMatch ? modelMatch[1] : "unknown";
  }

  return androidInfo;
};

// @route   POST api/devices/register
// @desc    Register a new device for current user
// @access  Private
exports.registerDevice = async (req, res) => {
  try {
    const { deviceFingerprint, deviceName, deviceType } = req.body;
    const userAgent = req.headers["user-agent"] || "";
    const androidInfo = getAndroidDeviceInfo(userAgent, deviceFingerprint);

    console.log("📱 Device Registration Request:", {
      deviceName,
      deviceType,
      hasFingerprint: !!deviceFingerprint,
      fingerprintHash: deviceFingerprint?.hash,
      isAndroid: androidInfo.isAndroid,
      userAgent: userAgent.substring(0, 100) + "...",
    });

    // ✅ FIXED: Validate FingerprintJS Pro data
    const validation = validateFingerprintJSProData(
      deviceFingerprint,
      userAgent
    );
    if (!validation.isValid) {
      console.error("❌ FingerprintJS Pro validation failed:", {
        error: validation.error,
        message: validation.message,
        isAndroid: androidInfo.isAndroid,
      });

      return res.status(400).json({
        success: false,
        message: validation.message,
        error: validation.error,
        debug: {
          isAndroid: androidInfo.isAndroid,
          service: "fingerprintjs_pro",
          hasFingerprint: !!deviceFingerprint,
          hasVisitorId: !!deviceFingerprint?.hash,
        },
      });
    }

    if (!deviceName) {
      return res.status(400).json({
        success: false,
        message: "Device name is required",
        error: androidInfo.isAndroid
          ? "MISSING_DEVICE_NAME_ANDROID"
          : "MISSING_DEVICE_NAME",
      });
    }

    // ✅ NEW: Validate with FingerprintJS Pro API if available
    if (
      fingerprintjsService.isAvailable() &&
      deviceFingerprint.details?.requestId
    ) {
      try {
        const fpValidation = await fingerprintjsService.validateFingerprint(
          deviceFingerprint.hash,
          deviceFingerprint.details.requestId
        );

        if (!fpValidation.isValid) {
          console.warn(
            "⚠️ FingerprintJS Pro server validation failed:",
            fpValidation.reason
          );
          // Continue with registration but log the issue
        } else {
          console.log("✅ FingerprintJS Pro server validation successful");
        }
      } catch (validationError) {
        console.warn(
          "⚠️ FingerprintJS Pro validation error:",
          validationError.message
        );
        // Continue with registration - don't block for validation errors
      }
    }

    await pool.connect();

    // ✅ UPDATED: Device lookup using FingerprintJS Pro visitor ID
    const existingDevice = await pool
      .request()
      .input("userId", req.user.userId)
      .input("visitorId", deviceFingerprint.hash) // Use visitor ID as primary key
      .input(
        "userAgent",
        deviceFingerprint.details?.userAgent || userAgent || ""
      )
      .input(
        "screenResolution",
        deviceFingerprint.details?.screen
          ? `${deviceFingerprint.details.screen.width}x${deviceFingerprint.details.screen.height}`
          : ""
      )
      .input("platform", deviceFingerprint.details?.platform || "").query(`
        SELECT 
          fingerprintId, 
          deviceName, 
          isActive,
          fingerprint,
          registeredAt,
          lastUpdated,
          userAgent,
          screenResolution,
          platform,
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
        AND (
          JSON_VALUE(fingerprint, '$.hash') = @visitorId
          OR JSON_VALUE(fingerprint, '$.details.visitorId') = @visitorId
          OR (userAgent = @userAgent AND screenResolution = @screenResolution)
        )
        ORDER BY 
          CASE 
            WHEN JSON_VALUE(fingerprint, '$.hash') = @visitorId THEN 1 
            WHEN JSON_VALUE(fingerprint, '$.details.visitorId') = @visitorId THEN 2
            ELSE 3 
          END,
          registeredAt DESC
      `);

    if (existingDevice.recordset.length > 0) {
      const device = existingDevice.recordset[0];

      console.log("🔍 FingerprintJS Pro Duplicate Check:", {
        isAndroid: androidInfo.isAndroid,
        existingVisitorId: JSON.parse(device.fingerprint)?.hash,
        newVisitorId: deviceFingerprint.hash,
        deviceName: device.deviceName,
        isActive: device.isActive,
      });

      // If device exists but inactive, reactivate it
      if (!device.isActive) {
        await pool
          .request()
          .input("fingerprintId", device.fingerprintId)
          .input("deviceName", deviceName)
          .input("fingerprint", JSON.stringify(deviceFingerprint)).query(`
            UPDATE DeviceFingerprints 
            SET 
              isActive = 1, 
              deviceName = @deviceName,
              fingerprint = @fingerprint,
              lastUpdated = GETDATE() 
            WHERE fingerprintId = @fingerprintId
          `);

        console.log("✅ FingerprintJS Pro Device Reactivated:", {
          fingerprintId: device.fingerprintId,
          visitorId: deviceFingerprint.hash,
          deviceName: deviceName,
          isAndroid: androidInfo.isAndroid,
        });

        return res.json({
          success: true,
          message: androidInfo.isAndroid
            ? "Android device reactivated with FingerprintJS Pro"
            : "Device reactivated with FingerprintJS Pro",
          device: {
            fingerprintId: device.fingerprintId,
            deviceName: deviceName,
            visitorId: deviceFingerprint.hash,
            confidence: deviceFingerprint.metadata?.confidenceScore,
            isActive: true,
            wasReactivated: true,
            service: "fingerprintjs_pro",
          },
        });
      }

      // Device already active - return error
      return res.status(409).json({
        success: false,
        message: androidInfo.isAndroid
          ? "This Android device is already registered with FingerprintJS Pro"
          : "This device is already registered with FingerprintJS Pro",
        error: androidInfo.isAndroid
          ? "DEVICE_ALREADY_REGISTERED_ANDROID_FPJS"
          : "DEVICE_ALREADY_REGISTERED_FPJS",
        existingDevice: {
          deviceName: device.deviceName,
          registeredAt: device.registeredAt,
          lastUsed: device.lastUsed,
          visitorId: deviceFingerprint.hash,
          service: "fingerprintjs_pro",
        },
      });
    }

    // ✅ ENHANCED: Extract device info with fallback handling
    let deviceInfo;
    try {
      if (
        fingerprintjsService.isAvailable() &&
        fingerprintjsService.extractDeviceInfo
      ) {
        deviceInfo = fingerprintjsService.extractDeviceInfo(deviceFingerprint);
      } else {
        // Fallback device info extraction
        deviceInfo = {
          userAgent: deviceFingerprint.details?.userAgent || userAgent,
          platform: deviceFingerprint.details?.platform || "unknown",
          screen: deviceFingerprint.details?.screen || null,
          confidence: deviceFingerprint.metadata?.confidenceScore || 0.5,
          service: deviceFingerprint.metadata?.service || "fingerprintjs_pro",
        };
      }
    } catch (extractError) {
      console.warn(
        "⚠️ Device info extraction failed, using fallback:",
        extractError.message
      );
      deviceInfo = {
        userAgent: userAgent,
        platform: "unknown",
        screen: null,
        confidence: 0.5,
        service: "fallback",
      };
    }

    console.log("📱 FingerprintJS Pro Device Registration:", {
      isAndroid: androidInfo.isAndroid,
      visitorId: deviceFingerprint.hash,
      confidence: deviceInfo.confidence,
      method: deviceFingerprint.metadata?.method,
      service: deviceInfo.service,
      deviceName: deviceName,
      deviceType: deviceType,
    });

    // ✅ FIXED: Register new device with enhanced error handling for database schema
    let result;
    try {
      // Try with new FingerprintJS Pro columns first
      result = await pool
        .request()
        .input("userId", req.user.userId)
        .input("deviceType", deviceType || "patient")
        .input("deviceName", deviceName)
        .input("fingerprint", JSON.stringify(deviceFingerprint))
        .input("userAgent", deviceInfo.userAgent || userAgent)
        .input(
          "screenResolution",
          deviceInfo.screen?.width && deviceInfo.screen?.height
            ? `${deviceInfo.screen.width}x${deviceInfo.screen.height}`
            : deviceFingerprint.details?.screen
            ? `${deviceFingerprint.details.screen.width}x${deviceFingerprint.details.screen.height}`
            : null
        )
        .input("timezone", null) // FingerprintJS Pro doesn't expose timezone directly
        .input("language", deviceFingerprint.details?.language || null)
        .input(
          "platform",
          deviceInfo.platform || deviceFingerprint.details?.platform || null
        )
        .input("registeredBy", req.user.userId)
        // ✅ NEW: Add FingerprintJS Pro specific fields
        .input("visitorId", deviceFingerprint.hash)
        .input("requestId", deviceFingerprint.details?.requestId || null)
        .input("confidenceScore", deviceInfo.confidence || 0.5).query(`
          INSERT INTO DeviceFingerprints 
          (userId, deviceType, deviceName, fingerprint, userAgent, screenResolution, 
           timezone, language, platform, registeredBy, visitorId, requestId, confidenceScore)
          OUTPUT INSERTED.fingerprintId
          VALUES (@userId, @deviceType, @deviceName, @fingerprint, @userAgent, @screenResolution, 
                  @timezone, @language, @platform, @registeredBy, @visitorId, @requestId, @confidenceScore)
        `);

      console.log(
        "✅ FingerprintJS Pro Device Registered with Enhanced Schema:",
        {
          fingerprintId: result.recordset[0].fingerprintId,
          visitorId: deviceFingerprint.hash,
          confidence: deviceInfo.confidence,
          deviceName: deviceName,
          service: deviceInfo.service,
          isAndroid: androidInfo.isAndroid,
        }
      );
    } catch (dbError) {
      // If the error is about missing columns, try the fallback insert without new columns
      if (
        dbError.message.includes("Invalid column name") ||
        dbError.message.includes("visitorId") ||
        dbError.message.includes("requestId") ||
        dbError.message.includes("confidenceScore")
      ) {
        console.warn(
          "⚠️ New FingerprintJS Pro columns not found, using legacy schema..."
        );

        result = await pool
          .request()
          .input("userId", req.user.userId)
          .input("deviceType", deviceType || "patient")
          .input("deviceName", deviceName)
          .input("fingerprint", JSON.stringify(deviceFingerprint))
          .input("userAgent", deviceInfo.userAgent || userAgent)
          .input(
            "screenResolution",
            deviceInfo.screen?.width && deviceInfo.screen?.height
              ? `${deviceInfo.screen.width}x${deviceInfo.screen.height}`
              : deviceFingerprint.details?.screen
              ? `${deviceFingerprint.details.screen.width}x${deviceFingerprint.details.screen.height}`
              : null
          )
          .input("timezone", null)
          .input("language", deviceFingerprint.details?.language || null)
          .input(
            "platform",
            deviceInfo.platform || deviceFingerprint.details?.platform || null
          )
          .input("registeredBy", req.user.userId).query(`
            INSERT INTO DeviceFingerprints 
            (userId, deviceType, deviceName, fingerprint, userAgent, screenResolution, 
             timezone, language, platform, registeredBy)
            OUTPUT INSERTED.fingerprintId
            VALUES (@userId, @deviceType, @deviceName, @fingerprint, @userAgent, @screenResolution, 
                    @timezone, @language, @platform, @registeredBy)
          `);

        console.log("✅ Device registered with legacy schema:", {
          fingerprintId: result.recordset[0].fingerprintId,
          visitorId: deviceFingerprint.hash,
          deviceName: deviceName,
          note: "Consider running database migration to add FingerprintJS Pro columns",
          isAndroid: androidInfo.isAndroid,
        });

        return res.json({
          success: true,
          message: androidInfo.isAndroid
            ? "Android device registered successfully"
            : "Device registered successfully",
          device: {
            fingerprintId: result.recordset[0].fingerprintId,
            deviceName: deviceName,
            visitorId: deviceFingerprint.hash,
            confidence: deviceInfo.confidence,
            service: "fingerprintjs_pro",
            registeredAt: new Date(),
            isAndroid: androidInfo.isAndroid,
          },
          warning:
            "Some FingerprintJS Pro features may not be available. Consider updating your database schema.",
        });
      } else {
        throw dbError; // Re-throw if it's a different error
      }
    }

    // ✅ SUCCESS: Enhanced logging for FingerprintJS Pro
    res.json({
      success: true,
      message: androidInfo.isAndroid
        ? "Android device registered with FingerprintJS Pro"
        : "Device registered with FingerprintJS Pro",
      device: {
        fingerprintId: result.recordset[0].fingerprintId,
        deviceName: deviceName,
        visitorId: deviceFingerprint.hash,
        confidence: deviceInfo.confidence,
        service: "fingerprintjs_pro",
        registeredAt: new Date(),
        isAndroid: androidInfo.isAndroid,
      },
    });
  } catch (error) {
    const userAgent = req.headers["user-agent"] || "";
    const androidInfo = getAndroidDeviceInfo(userAgent);

    console.error("❌ FingerprintJS Pro Registration Error:", {
      error: error.message,
      stack: error.stack,
      isAndroid: androidInfo.isAndroid,
      service: "fingerprintjs_pro",
      timestamp: new Date().toISOString(),
    });

    res.status(500).json({
      success: false,
      message: androidInfo.isAndroid
        ? "Failed to register Android device with FingerprintJS Pro"
        : "Failed to register device with FingerprintJS Pro",
      error: androidInfo.isAndroid
        ? "ANDROID_FPJS_REGISTRATION_FAILED"
        : "FPJS_REGISTRATION_FAILED",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// @route   GET api/devices/my-devices
// @desc    Get all registered devices for current user
// @access  Private
exports.getMyDevices = async (req, res) => {
  try {
    await pool.connect();

    const result = await pool.request().input("userId", req.user.userId).query(`
        SELECT 
          df.fingerprintId,
          df.deviceType,
          df.deviceName,
          df.userAgent,
          df.screenResolution,
          df.timezone,
          df.language,
          df.platform,
          df.isActive,
          df.registeredAt,
          df.lastUpdated,
          df.fingerprint,
          ru.name as registeredByName,
          CASE 
            WHEN dal.lastAccess IS NOT NULL 
            THEN dal.lastAccess 
            ELSE df.registeredAt 
          END as lastUsed
        FROM DeviceFingerprints df
        LEFT JOIN Users ru ON df.registeredBy = ru.userId
        LEFT JOIN (
          SELECT 
            deviceFingerprintId, 
            MAX(accessTime) as lastAccess
          FROM DeviceAccessLogs 
          GROUP BY deviceFingerprintId
        ) dal ON df.fingerprintId = dal.deviceFingerprintId
        WHERE df.userId = @userId
        ORDER BY df.registeredAt DESC
      `);

    // ✅ ANDROID FIX: Enhance device list with Android detection
    const enhancedDevices = result.recordset.map((device) => {
      let androidInfo = null;
      let isAndroid = false;

      try {
        if (device.fingerprint) {
          const fingerprintData = JSON.parse(device.fingerprint);
          isAndroid = fingerprintData.details?.isAndroid || false;

          if (isAndroid && device.userAgent) {
            androidInfo = getAndroidDeviceInfo(
              device.userAgent,
              fingerprintData
            );
          }
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }

      return {
        ...device,
        fingerprint: undefined, // Don't expose full fingerprint data
        isAndroid: isAndroid,
        androidInfo: isAndroid ? androidInfo : undefined,
      };
    });

    res.json({
      success: true,
      devices: enhancedDevices,
    });
  } catch (error) {
    console.error("Get devices error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch devices",
    });
  }
};

// @route   DELETE api/devices/:fingerprintId
// @desc    Remove/deactivate a device
// @access  Private
exports.removeDevice = async (req, res) => {
  try {
    const { fingerprintId } = req.params;

    await pool.connect();

    // Check if device belongs to current user
    const deviceCheck = await pool
      .request()
      .input("fingerprintId", fingerprintId)
      .input("userId", req.user.userId).query(`
        SELECT deviceName, fingerprint FROM DeviceFingerprints 
        WHERE fingerprintId = @fingerprintId AND userId = @userId
      `);

    if (deviceCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Device not found or access denied",
      });
    }

    // ✅ ANDROID FIX: Log Android device removal
    const device = deviceCheck.recordset[0];
    let isAndroid = false;
    try {
      if (device.fingerprint) {
        const fingerprintData = JSON.parse(device.fingerprint);
        isAndroid = fingerprintData.details?.isAndroid || false;
      }
    } catch (e) {
      // Ignore JSON parsing errors
    }

    console.log(`📱 ${isAndroid ? "ANDROID" : "DEVICE"} REMOVAL:`, {
      fingerprintId: fingerprintId,
      deviceName: device.deviceName,
      isAndroid: isAndroid,
      timestamp: new Date().toISOString(),
    });

    // Deactivate device instead of deleting
    await pool.request().input("fingerprintId", fingerprintId).query(`
        UPDATE DeviceFingerprints 
        SET isActive = 0, lastUpdated = GETDATE() 
        WHERE fingerprintId = @fingerprintId
      `);

    res.json({
      success: true,
      message: isAndroid
        ? "Android device removed successfully"
        : "Device removed successfully",
    });
  } catch (error) {
    console.error("Remove device error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove device",
    });
  }
};

// @route   POST api/devices/verify
// @desc    Verify if current device is authorized
// @access  Private
exports.verifyDevice = async (req, res) => {
  try {
    const { deviceFingerprint } = req.body;
    const userAgent = req.headers["user-agent"] || "";
    const androidInfo = getAndroidDeviceInfo(userAgent, deviceFingerprint);

    // ✅ NEW: Validate FingerprintJS Pro data
    const validation = validateFingerprintJSProData(
      deviceFingerprint,
      userAgent
    );
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
        error: validation.error,
        service: "fingerprintjs_pro",
      });
    }

    await pool.connect();

    // ✅ UPDATED: Device lookup using FingerprintJS Pro visitor ID
    const deviceResult = await pool
      .request()
      .input("userId", req.user.userId)
      .input("visitorId", deviceFingerprint.hash)
      .input("userAgent", deviceFingerprint.details?.userAgent || userAgent)
      .input(
        "screenResolution",
        deviceFingerprint.details?.screen
          ? `${deviceFingerprint.details.screen.width}x${deviceFingerprint.details.screen.height}`
          : ""
      )
      .input("platform", deviceFingerprint.details?.platform || "").query(`
        SELECT 
          df.fingerprintId,
          df.deviceName,
          df.deviceType,
          df.isActive,
          df.fingerprint as storedFingerprint,
          df.visitorId as storedVisitorId,
          df.confidenceScore as storedConfidence
        FROM DeviceFingerprints df
        WHERE df.userId = @userId 
        AND df.isActive = 1
        AND (
          df.visitorId = @visitorId
          OR JSON_VALUE(df.fingerprint, '$.hash') = @visitorId
          OR (df.userAgent = @userAgent AND df.screenResolution = @screenResolution)
        )
        ORDER BY 
          CASE 
            WHEN df.visitorId = @visitorId THEN 1 
            WHEN JSON_VALUE(df.fingerprint, '$.hash') = @visitorId THEN 2
            ELSE 3 
          END,
          df.registeredAt DESC
      `);

    if (deviceResult.recordset.length === 0) {
      // ✅ ENHANCED: Log unauthorized access with FingerprintJS Pro data
      console.error("❌ FingerprintJS Pro Unauthorized Access:", {
        isAndroid: androidInfo.isAndroid,
        visitorId: deviceFingerprint.hash,
        confidence: deviceFingerprint.metadata?.confidenceScore,
        method: deviceFingerprint.metadata?.method,
        service: "fingerprintjs_pro",
        userAgent: userAgent,
      });

      // Log unauthorized access attempt
      await pool
        .request()
        .input("deviceFingerprintId", null)
        .input("userId", req.user.userId)
        .input(
          "accessType",
          androidInfo.isAndroid
            ? "unauthorized_android_fpjs_access"
            : "unauthorized_fpjs_device_access"
        )
        .input("ipAddress", req.ip)
        .input(
          "location",
          JSON.stringify({
            ip: req.ip,
            timestamp: new Date().toISOString(),
            visitorId: deviceFingerprint.hash,
            confidence: deviceFingerprint.metadata?.confidenceScore,
            service: "fingerprintjs_pro",
            isAndroid: androidInfo.isAndroid,
          })
        )
        .input("isAuthorized", 0).query(`
          INSERT INTO DeviceAccessLogs 
          (deviceFingerprintId, userId, accessType, ipAddress, location, isAuthorized)
          VALUES (@deviceFingerprintId, @userId, @accessType, @ipAddress, @location, @isAuthorized)
        `);

      return res.status(403).json({
        success: false,
        message: androidInfo.isAndroid
          ? "Android device not authorized (FingerprintJS Pro)"
          : "Device not authorized (FingerprintJS Pro)",
        isAuthorized: false,
        error: androidInfo.isAndroid
          ? "ANDROID_DEVICE_UNAUTHORIZED_FPJS"
          : "DEVICE_UNAUTHORIZED_FPJS",
        service: "fingerprintjs_pro",
      });
    }

    const device = deviceResult.recordset[0];

    // ✅ SUCCESS: Log successful verification with FingerprintJS Pro
    console.log("✅ FingerprintJS Pro Device Verified:", {
      fingerprintId: device.fingerprintId,
      deviceName: device.deviceName,
      visitorId: deviceFingerprint.hash,
      confidence: deviceFingerprint.metadata?.confidenceScore,
      service: "fingerprintjs_pro",
      isAndroid: androidInfo.isAndroid,
    });

    // Log successful access
    await pool
      .request()
      .input("deviceFingerprintId", device.fingerprintId)
      .input("userId", req.user.userId)
      .input(
        "accessType",
        androidInfo.isAndroid
          ? "android_fpjs_device_verification"
          : "fpjs_device_verification"
      )
      .input("ipAddress", req.ip)
      .input(
        "location",
        JSON.stringify({
          ip: req.ip,
          timestamp: new Date().toISOString(),
          visitorId: deviceFingerprint.hash,
          service: "fingerprintjs_pro",
          isAndroid: androidInfo.isAndroid,
        })
      ).query(`
        INSERT INTO DeviceAccessLogs 
        (deviceFingerprintId, userId, accessType, ipAddress, location)
        VALUES (@deviceFingerprintId, @userId, @accessType, @ipAddress, @location)
      `);

    res.json({
      success: true,
      message: androidInfo.isAndroid
        ? "Android device verified with FingerprintJS Pro"
        : "Device verified with FingerprintJS Pro",
      isAuthorized: true,
      device: {
        fingerprintId: device.fingerprintId,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        visitorId: deviceFingerprint.hash,
        confidence: deviceFingerprint.metadata?.confidenceScore,
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
// @route   POST api/devices/generate-qr
// @desc    Generate QR code for family device registration
// @access  Private (Patient only)
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
      .input("patientUserId", req.user.userId)
      .input("qrToken", qrToken)
      .input("expiresAt", expiresAt).query(`
        INSERT INTO QRRegistrationTokens (patientUserId, qrToken, expiresAt)
        VALUES (@patientUserId, @qrToken, @expiresAt)
      `);

    // Create QR code URL
    const qrUrl = `${
      process.env.FRONTEND_URL || "https://your-domain.com"
    }/register-device/${qrToken}`;

    console.log("📱 QR CODE GENERATED:", {
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
      message: "QR code generated successfully for family device registration",
    });
  } catch (error) {
    console.error("QR generation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate QR code",
    });
  }
};

// @route   POST api/devices/register-via-qr/:qrToken
// @desc    Register device using QR code
// @access  Public
exports.registerDeviceViaQR = async (req, res) => {
  try {
    const { qrToken } = req.params;
    const { deviceFingerprint, deviceName } = req.body;
    const userAgent = req.headers["user-agent"] || "";
    const androidInfo = getAndroidDeviceInfo(userAgent, deviceFingerprint);

    if (!deviceFingerprint || !deviceName) {
      return res.status(400).json({
        success: false,
        message: "Device fingerprint and name are required",
        error: androidInfo.isAndroid
          ? "MISSING_REQUIRED_FIELDS_ANDROID_QR"
          : "MISSING_REQUIRED_FIELDS",
      });
    }

    // ✅ ANDROID FIX: Enhanced fingerprint validation for QR registration
    if (!deviceFingerprint.hash || !deviceFingerprint.details) {
      console.error("❌ ANDROID QR DEBUG - Invalid fingerprint format:", {
        hasHash: !!deviceFingerprint.hash,
        hasDetails: !!deviceFingerprint.details,
        isAndroid: androidInfo.isAndroid,
        userAgent: userAgent,
        qrToken: qrToken,
      });

      return res.status(400).json({
        success: false,
        message: "Invalid device fingerprint format",
        error: androidInfo.isAndroid
          ? "INVALID_FINGERPRINT_ANDROID_QR"
          : "INVALID_FINGERPRINT",
      });
    }

    await pool.connect();

    // Verify QR token
    const qrResult = await pool.request().input("qrToken", qrToken).query(`
        SELECT 
          qrt.patientUserId,
          qrt.expiresAt,
          qrt.isUsed,
          u.name as patientName
        FROM QRRegistrationTokens qrt
        JOIN Users u ON qrt.patientUserId = u.userId
        WHERE qrt.qrToken = @qrToken
      `);

    if (qrResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Invalid QR code",
        error: "QR_NOT_FOUND",
      });
    }

    const qrData = qrResult.recordset[0];

    // Check if QR code is expired
    if (new Date() > new Date(qrData.expiresAt)) {
      return res.status(400).json({
        success: false,
        message: "QR code has expired",
        error: "QR_EXPIRED",
      });
    }

    // Check if QR code already used
    if (qrData.isUsed) {
      return res.status(400).json({
        success: false,
        message: "QR code has already been used",
        error: "QR_ALREADY_USED",
      });
    }

    // ✅ ANDROID FIX: Enhanced duplicate checking for QR registration
    const existingDevice = await pool
      .request()
      .input("userId", qrData.patientUserId)
      .input("fingerprintHash", deviceFingerprint.hash)
      .input(
        "userAgent",
        deviceFingerprint.details?.userAgent || userAgent || ""
      )
      .input(
        "screenResolution",
        deviceFingerprint.details?.screen
          ? `${deviceFingerprint.details.screen.width}x${deviceFingerprint.details.screen.height}`
          : ""
      )
      .input("platform", deviceFingerprint.details?.platform?.platform || "")
      .query(`
        SELECT 
          fingerprintId, 
          deviceName, 
          deviceType,
          isActive,
          fingerprint,
          registeredAt,
          userAgent
        FROM DeviceFingerprints 
        WHERE userId = @userId 
        AND (
          JSON_VALUE(fingerprint, '$.hash') = @fingerprintHash
          OR (userAgent = @userAgent AND screenResolution = @screenResolution)
          OR (@platform != '' AND platform = @platform AND screenResolution = @screenResolution)
        )
        ORDER BY 
          CASE WHEN JSON_VALUE(fingerprint, '$.hash') = @fingerprintHash THEN 1 ELSE 2 END,
          registeredAt DESC
      `);

    if (existingDevice.recordset.length > 0) {
      const device = existingDevice.recordset[0];

      // ✅ ANDROID DEBUG: Enhanced QR duplicate detection logging
      console.log("🔍 ANDROID QR DUPLICATE DEVICE CHECK:", {
        isAndroid: androidInfo.isAndroid,
        androidInfo: androidInfo,
        existingHash: JSON.parse(device.fingerprint)?.hash,
        newHash: deviceFingerprint.hash,
        userAgent: device.userAgent,
        deviceName: device.deviceName,
        isActive: device.isActive,
        patientName: qrData.patientName,
        qrToken: qrToken,
      });

      if (device.isActive) {
        return res.status(409).json({
          success: false,
          message: `This ${
            androidInfo.isAndroid ? "Android " : ""
          }device is already registered for ${qrData.patientName}`,
          error: androidInfo.isAndroid
            ? "DEVICE_ALREADY_REGISTERED_ANDROID_QR"
            : "DEVICE_ALREADY_REGISTERED",
          existingDevice: {
            deviceName: device.deviceName,
            deviceType: device.deviceType,
            registeredAt: device.registeredAt,
            isAndroid: androidInfo.isAndroid,
            androidInfo: androidInfo.isAndroid ? androidInfo : undefined,
          },
        });
      } else {
        // Reactivate inactive device
        await pool
          .request()
          .input("fingerprintId", device.fingerprintId)
          .input("deviceName", deviceName)
          .input("fingerprint", JSON.stringify(deviceFingerprint)).query(`
            UPDATE DeviceFingerprints 
            SET 
              isActive = 1, 
              deviceName = @deviceName,
              fingerprint = @fingerprint,
              lastUpdated = GETDATE()
            WHERE fingerprintId = @fingerprintId
          `);

        // Mark QR as used
        await pool
          .request()
          .input("qrToken", qrToken)
          .input("usedByFingerprint", JSON.stringify(deviceFingerprint)).query(`
            UPDATE QRRegistrationTokens 
            SET isUsed = 1, usedAt = GETDATE(), usedByFingerprint = @usedByFingerprint
            WHERE qrToken = @qrToken
          `);

        console.log("✅ ANDROID QR DEVICE REACTIVATED:", {
          fingerprintId: device.fingerprintId,
          deviceName: deviceName,
          patientName: qrData.patientName,
          isAndroid: androidInfo.isAndroid,
          qrToken: qrToken,
        });

        return res.json({
          success: true,
          message: `${
            androidInfo.isAndroid ? "Android " : ""
          }Device reactivated successfully for ${qrData.patientName}`,
          device: {
            fingerprintId: device.fingerprintId,
            deviceName: deviceName,
            deviceType: "family",
            patientName: qrData.patientName,
            wasReactivated: true,
            isAndroid: androidInfo.isAndroid,
            androidInfo: androidInfo.isAndroid ? androidInfo : undefined,
          },
        });
      }
    }

    // ✅ ANDROID FIX: Register new family device with Android support
    const deviceResult = await pool
      .request()
      .input("userId", qrData.patientUserId)
      .input("deviceType", "family")
      .input("deviceName", deviceName)
      .input("fingerprint", JSON.stringify(deviceFingerprint))
      .input(
        "userAgent",
        deviceFingerprint.details?.userAgent || userAgent || null
      )
      .input(
        "screenResolution",
        deviceFingerprint.details?.screen
          ? `${deviceFingerprint.details.screen.width}x${deviceFingerprint.details.screen.height}`
          : null
      )
      .input("timezone", deviceFingerprint.details?.timezone?.timezone || null)
      .input("language", deviceFingerprint.details?.language?.language || null)
      .input("platform", deviceFingerprint.details?.platform?.platform || null)
      .input("registeredBy", qrData.patientUserId).query(`
        INSERT INTO DeviceFingerprints 
        (userId, deviceType, deviceName, fingerprint, userAgent, screenResolution, timezone, language, platform, registeredBy)
        OUTPUT INSERTED.fingerprintId
        VALUES (@userId, @deviceType, @deviceName, @fingerprint, @userAgent, @screenResolution, @timezone, @language, @platform, @registeredBy)
      `);

    // ✅ ANDROID SUCCESS: Enhanced QR registration success logging
    console.log("✅ ANDROID QR DEVICE REGISTERED SUCCESSFULLY:", {
      fingerprintId: deviceResult.recordset[0].fingerprintId,
      hash: deviceFingerprint.hash,
      deviceName: deviceName,
      patientName: qrData.patientName,
      isAndroid: androidInfo.isAndroid,
      androidInfo: androidInfo,
      userAgent: deviceFingerprint.details?.userAgent || userAgent,
      qrToken: qrToken,
      timestamp: new Date().toISOString(),
    });

    // Mark QR token as used
    await pool
      .request()
      .input("qrToken", qrToken)
      .input("usedByFingerprint", JSON.stringify(deviceFingerprint)).query(`
        UPDATE QRRegistrationTokens 
        SET isUsed = 1, usedAt = GETDATE(), usedByFingerprint = @usedByFingerprint
        WHERE qrToken = @qrToken
      `);

    res.json({
      success: true,
      message: `${
        androidInfo.isAndroid ? "Android " : ""
      }Device registered successfully for ${qrData.patientName}`,
      device: {
        fingerprintId: deviceResult.recordset[0].fingerprintId,
        deviceName: deviceName,
        deviceType: "family",
        patientName: qrData.patientName,
        isAndroid: androidInfo.isAndroid,
        androidInfo: androidInfo.isAndroid ? androidInfo : undefined,
      },
    });
  } catch (error) {
    const userAgent = req.headers["user-agent"] || "";
    const androidInfo = getAndroidDeviceInfo(userAgent);

    console.error("❌ ANDROID QR DEVICE REGISTRATION ERROR:", {
      error: error.message,
      stack: error.stack,
      isAndroid: androidInfo.isAndroid,
      androidInfo: androidInfo,
      userAgent: userAgent,
      qrToken: req.params.qrToken,
      timestamp: new Date().toISOString(),
    });

    res.status(500).json({
      success: false,
      message: androidInfo.isAndroid
        ? "Failed to register Android device via QR code"
        : "Failed to register device via QR code",
      error: androidInfo.isAndroid
        ? "ANDROID_QR_REGISTRATION_FAILED"
        : "QR_REGISTRATION_FAILED",
    });
  }
};

// ✅ ANDROID-COMPATIBLE: Enhanced fingerprint change detection
exports.checkFingerprintChanges = async (oldFingerprint, newFingerprint) => {
  try {
    const significantChanges = [];

    // For FingerprintJS Pro, the visitor ID should remain stable
    // Only check for major changes that might indicate a different device

    if (oldFingerprint.hash !== newFingerprint.hash) {
      significantChanges.push("visitor_id_change");
    }

    // Check confidence score changes (significant drops might indicate issues)
    const oldConfidence = oldFingerprint.metadata?.confidenceScore || 0;
    const newConfidence = newFingerprint.metadata?.confidenceScore || 0;

    if (Math.abs(oldConfidence - newConfidence) > 0.3) {
      significantChanges.push("confidence_change");
    }

    // Check service method changes
    if (oldFingerprint.metadata?.method !== newFingerprint.metadata?.method) {
      significantChanges.push("method_change");
    }

    const shouldUpdate = significantChanges.length > 0;

    return {
      shouldUpdate,
      changes: significantChanges,
      service: "fingerprintjs_pro",
      oldConfidence,
      newConfidence,
    };
  } catch (error) {
    return {
      shouldUpdate: false,
      changes: [],
      error: error.message,
      service: "fingerprintjs_pro",
    };
  }
};

exports.checkQRStatus = async (req, res) => {
  try {
    const { qrToken } = req.params;
    const userAgent = req.headers["user-agent"] || "";
    const isAndroid = /Android/i.test(userAgent);

    if (!qrToken) {
      console.error("❌ QR status check - Missing token:", {
        userAgent: userAgent,
        isAndroid: isAndroid,
      });

      return res.status(400).json({
        success: false,
        message: "QR token is required",
        error: "MISSING_QR_TOKEN",
      });
    }

    console.log("📱 QR STATUS CHECK:", {
      qrToken: qrToken.substring(0, 8) + "...", // Log partial token for security
      userAgent: userAgent,
      isAndroid: isAndroid,
      timestamp: new Date().toISOString(),
    });

    await pool.connect();

    // Get QR token information
    const qrResult = await pool.request().input("qrToken", qrToken).query(`
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
      console.log("⚠️ QR token not found:", {
        qrToken: qrToken.substring(0, 8) + "...",
        isAndroid: isAndroid,
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

    console.log("✅ QR STATUS RESULT:", {
      qrToken: qrToken.substring(0, 8) + "...",
      patientName: qrData.patientName,
      isValid: isValid,
      isExpired: isExpired,
      isUsed: isUsed,
      isAndroid: isAndroid,
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
        reason: !isValid ? (isExpired ? "EXPIRED" : "USED") : null,
      },
    });
  } catch (error) {
    const userAgent = req.headers["user-agent"] || "";
    const isAndroid = /Android/i.test(userAgent);

    console.error("❌ QR STATUS CHECK ERROR:", {
      error: error.message,
      stack: error.stack,
      qrToken: req.params.qrToken
        ? req.params.qrToken.substring(0, 8) + "..."
        : "undefined",
      userAgent: userAgent,
      isAndroid: isAndroid,
      timestamp: new Date().toISOString(),
    });

    res.status(500).json({
      success: false,
      message: "Failed to check QR status",
      error: "QR_STATUS_CHECK_FAILED",
    });
  }
};

module.exports = exports;
