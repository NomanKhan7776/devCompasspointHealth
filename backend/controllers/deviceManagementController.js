// controllers/deviceManagementController.js - ANDROID-COMPATIBLE with enhanced mobile support
const { pool, sql } = require("../config/database");
const crypto = require("crypto");

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

    // ✅ ANDROID FIX: Enhanced validation with Android-specific error messages
    if (!deviceFingerprint || !deviceName) {
      console.error("❌ ANDROID DEBUG - Missing required fields:", {
        hasFingerprint: !!deviceFingerprint,
        hasDeviceName: !!deviceName,
        isAndroid: androidInfo.isAndroid,
        userAgent: userAgent,
      });

      return res.status(400).json({
        success: false,
        message: "Device fingerprint and name are required",
        error: androidInfo.isAndroid
          ? "MISSING_REQUIRED_FIELDS_ANDROID"
          : "MISSING_REQUIRED_FIELDS",
        debug: {
          isAndroid: androidInfo.isAndroid,
          hasFingerprint: !!deviceFingerprint,
          hasDeviceName: !!deviceName,
        },
      });
    }

    // ✅ ANDROID FIX: Enhanced fingerprint validation
    if (!deviceFingerprint.hash || !deviceFingerprint.details) {
      console.error("❌ ANDROID DEBUG - Invalid fingerprint format:", {
        hasHash: !!deviceFingerprint.hash,
        hasDetails: !!deviceFingerprint.details,
        isAndroid: androidInfo.isAndroid,
        userAgent: userAgent,
        fingerprintMethod: deviceFingerprint.details?.collectMethod,
        receivedData: deviceFingerprint,
      });

      return res.status(400).json({
        success: false,
        message: "Invalid device fingerprint format",
        error: androidInfo.isAndroid
          ? "INVALID_FINGERPRINT_ANDROID"
          : "INVALID_FINGERPRINT",
        debug: {
          received: typeof deviceFingerprint,
          hasHash: !!deviceFingerprint.hash,
          hasDetails: !!deviceFingerprint.details,
          isAndroid: androidInfo.isAndroid,
          collectMethod: deviceFingerprint.details?.collectMethod,
        },
      });
    }

    // ✅ ANDROID DEBUG: Comprehensive device registration logging
    console.log("📱 ANDROID DEVICE REGISTRATION DEBUG:", {
      isAndroid: androidInfo.isAndroid,
      isMobile: androidInfo.isMobile,
      androidVersion: androidInfo.androidVersion,
      chromeVersion: androidInfo.chromeVersion,
      deviceModel: androidInfo.deviceModel,
      userAgent: userAgent,
      fingerprintHash: deviceFingerprint.hash,
      deviceName: deviceName,
      deviceType: deviceType,
      fingerprintMethod: deviceFingerprint.details?.collectMethod,
      screenInfo: deviceFingerprint.details?.screen,
      platform: deviceFingerprint.details?.platform,
      audioComponent: deviceFingerprint.details?.audio,
      canvasComponent: deviceFingerprint.details?.canvas,
      webglComponent: deviceFingerprint.details?.webgl,
    });

    await pool.connect();

    // ✅ ANDROID FIX: Enhanced duplicate checking with multiple fallback methods
    const existingDevice = await pool
      .request()
      .input("userId", req.user.userId)
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
      .input("deviceModel", androidInfo.deviceModel).query(`
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
          JSON_VALUE(fingerprint, '$.hash') = @fingerprintHash
          OR (userAgent = @userAgent AND screenResolution = @screenResolution)
          OR (@platform != '' AND platform = @platform AND screenResolution = @screenResolution)
          OR (@deviceModel != 'unknown' AND userAgent LIKE '%' + @deviceModel + '%' AND screenResolution = @screenResolution)
        )
        ORDER BY 
          CASE WHEN JSON_VALUE(fingerprint, '$.hash') = @fingerprintHash THEN 1 ELSE 2 END,
          registeredAt DESC
      `);

    if (existingDevice.recordset.length > 0) {
      const device = existingDevice.recordset[0];

      // ✅ ANDROID DEBUG: Enhanced duplicate detection logging
      console.log("🔍 ANDROID DUPLICATE DEVICE CHECK:", {
        isAndroid: androidInfo.isAndroid,
        androidInfo: androidInfo,
        existingHash: JSON.parse(device.fingerprint)?.hash,
        newHash: deviceFingerprint.hash,
        existingUserAgent: device.userAgent,
        newUserAgent: deviceFingerprint.details?.userAgent,
        existingScreen: device.screenResolution,
        newScreen: deviceFingerprint.details?.screen
          ? `${deviceFingerprint.details.screen.width}x${deviceFingerprint.details.screen.height}`
          : "",
        existingPlatform: device.platform,
        newPlatform: deviceFingerprint.details?.platform?.platform,
        deviceName: device.deviceName,
        isActive: device.isActive,
        matchReason:
          JSON.parse(device.fingerprint)?.hash === deviceFingerprint.hash
            ? "exact_hash_match"
            : "fallback_match",
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

        console.log("✅ ANDROID DEVICE REACTIVATED:", {
          fingerprintId: device.fingerprintId,
          deviceName: deviceName,
          isAndroid: androidInfo.isAndroid,
          androidVersion: androidInfo.androidVersion,
        });

        return res.json({
          success: true,
          message: androidInfo.isAndroid
            ? "Android device reactivated and updated successfully"
            : "Device reactivated and updated successfully",
          device: {
            fingerprintId: device.fingerprintId,
            deviceName: deviceName,
            isActive: true,
            wasReactivated: true,
            isAndroid: androidInfo.isAndroid,
            androidInfo: androidInfo.isAndroid ? androidInfo : undefined,
          },
        });
      }

      // ✅ ANDROID FIX: Device already active - return detailed error with platform info
      return res.status(409).json({
        success: false,
        message: androidInfo.isAndroid
          ? "This Android device is already registered"
          : "This device is already registered",
        error: androidInfo.isAndroid
          ? "DEVICE_ALREADY_REGISTERED_ANDROID"
          : "DEVICE_ALREADY_REGISTERED",
        existingDevice: {
          deviceName: device.deviceName,
          registeredAt: device.registeredAt,
          lastUsed: device.lastUsed,
          lastUpdated: device.lastUpdated,
          isAndroid: androidInfo.isAndroid,
          androidInfo: androidInfo.isAndroid ? androidInfo : undefined,
        },
      });
    }

    // ✅ ANDROID FIX: Register new device with enhanced Android support
    const result = await pool
      .request()
      .input("userId", req.user.userId)
      .input("deviceType", deviceType || "patient")
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
      .input("registeredBy", req.user.userId).query(`
        INSERT INTO DeviceFingerprints 
        (userId, deviceType, deviceName, fingerprint, userAgent, screenResolution, timezone, language, platform, registeredBy)
        OUTPUT INSERTED.fingerprintId
        VALUES (@userId, @deviceType, @deviceName, @fingerprint, @userAgent, @screenResolution, @timezone, @language, @platform, @registeredBy)
      `);

    // ✅ ANDROID SUCCESS: Enhanced registration success logging
    console.log("✅ ANDROID DEVICE REGISTERED SUCCESSFULLY:", {
      fingerprintId: result.recordset[0].fingerprintId,
      hash: deviceFingerprint.hash,
      deviceName: deviceName,
      isAndroid: androidInfo.isAndroid,
      androidInfo: androidInfo,
      userAgent: deviceFingerprint.details?.userAgent || userAgent,
      screenResolution: deviceFingerprint.details?.screen
        ? `${deviceFingerprint.details.screen.width}x${deviceFingerprint.details.screen.height}`
        : null,
      collectMethod: deviceFingerprint.details?.collectMethod,
      registrationTimestamp: new Date().toISOString(),
    });

    // ✅ ANDROID FIX: Enhanced access logging with Android-specific info
    await pool
      .request()
      .input("deviceFingerprintId", result.recordset[0].fingerprintId)
      .input("userId", req.user.userId)
      .input(
        "accessType",
        androidInfo.isAndroid
          ? "android_device_registration"
          : "device_registration"
      )
      .input("ipAddress", req.ip)
      .input(
        "location",
        JSON.stringify({
          ip: req.ip,
          timestamp: new Date().toISOString(),
          userAgent: deviceFingerprint.details?.userAgent || userAgent,
          isAndroid: androidInfo.isAndroid,
          isMobile: androidInfo.isMobile,
          androidInfo: androidInfo.isAndroid ? androidInfo : undefined,
          platform: deviceFingerprint.details?.platform?.platform,
          screenResolution: deviceFingerprint.details?.screen
            ? `${deviceFingerprint.details.screen.width}x${deviceFingerprint.details.screen.height}`
            : null,
        })
      ).query(`
        INSERT INTO DeviceAccessLogs 
        (deviceFingerprintId, userId, accessType, ipAddress, location)
        VALUES (@deviceFingerprintId, @userId, @accessType, @ipAddress, @location)
      `);

    res.json({
      success: true,
      message: androidInfo.isAndroid
        ? "Android device registered successfully"
        : "Device registered successfully",
      device: {
        fingerprintId: result.recordset[0].fingerprintId,
        deviceName: deviceName,
        deviceType: deviceType || "patient",
        registeredAt: new Date(),
        isAndroid: androidInfo.isAndroid,
        androidInfo: androidInfo.isAndroid ? androidInfo : undefined,
      },
    });
  } catch (error) {
    // ✅ ANDROID FIX: Enhanced error logging with Android context
    const userAgent = req.headers["user-agent"] || "";
    const androidInfo = getAndroidDeviceInfo(userAgent);

    console.error("❌ ANDROID DEVICE REGISTRATION ERROR:", {
      error: error.message,
      stack: error.stack,
      isAndroid: androidInfo.isAndroid,
      androidInfo: androidInfo,
      userAgent: userAgent,
      requestBody: {
        deviceName: req.body?.deviceName,
        deviceType: req.body?.deviceType,
        hasFingerprint: !!req.body?.deviceFingerprint,
        fingerprintMethod: req.body?.deviceFingerprint?.details?.collectMethod,
      },
      timestamp: new Date().toISOString(),
    });

    res.status(500).json({
      success: false,
      message: androidInfo.isAndroid
        ? "Failed to register Android device"
        : "Failed to register device",
      error: androidInfo.isAndroid
        ? "ANDROID_REGISTRATION_FAILED"
        : "REGISTRATION_FAILED",
      debug:
        process.env.NODE_ENV === "development"
          ? {
              isAndroid: androidInfo.isAndroid,
              userAgent: userAgent,
              errorMessage: error.message,
              androidInfo: androidInfo.isAndroid ? androidInfo : undefined,
            }
          : undefined,
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

    if (!deviceFingerprint || !deviceFingerprint.hash) {
      console.error("❌ ANDROID VERIFY ERROR - Missing fingerprint:", {
        isAndroid: androidInfo.isAndroid,
        userAgent: userAgent,
        hasFingerprint: !!deviceFingerprint,
        hasHash: !!deviceFingerprint?.hash,
      });

      return res.status(400).json({
        success: false,
        message: "Device fingerprint is required",
        error: androidInfo.isAndroid
          ? "MISSING_FINGERPRINT_ANDROID"
          : "MISSING_FINGERPRINT",
      });
    }

    await pool.connect();

    // ✅ ANDROID FIX: Enhanced device lookup with multiple fallback methods
    const deviceResult = await pool
      .request()
      .input("userId", req.user.userId)
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
          df.fingerprintId,
          df.deviceName,
          df.deviceType,
          df.isActive,
          df.fingerprint as storedFingerprint,
          df.userAgent as storedUserAgent,
          df.screenResolution as storedScreenResolution,
          df.platform as storedPlatform
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

    if (deviceResult.recordset.length === 0) {
      // ✅ ANDROID DEBUG: Enhanced unauthorized access logging
      console.error("❌ ANDROID UNAUTHORIZED DEVICE ACCESS:", {
        isAndroid: androidInfo.isAndroid,
        androidInfo: androidInfo,
        userAgent: userAgent,
        fingerprintHash: deviceFingerprint.hash,
        screenInfo: deviceFingerprint.details?.screen,
        collectMethod: deviceFingerprint.details?.collectMethod,
        platform: deviceFingerprint.details?.platform?.platform,
        timestamp: new Date().toISOString(),
      });

      // Log unauthorized access attempt
      await pool
        .request()
        .input("deviceFingerprintId", null)
        .input("userId", req.user.userId)
        .input(
          "accessType",
          androidInfo.isAndroid
            ? "unauthorized_android_access"
            : "unauthorized_device_access"
        )
        .input("ipAddress", req.ip)
        .input(
          "location",
          JSON.stringify({
            ip: req.ip,
            timestamp: new Date().toISOString(),
            attemptedFingerprint: deviceFingerprint.hash,
            userAgent: userAgent,
            isAndroid: androidInfo.isAndroid,
            androidInfo: androidInfo.isAndroid ? androidInfo : undefined,
            collectMethod: deviceFingerprint.details?.collectMethod,
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
          ? "Android device not authorized"
          : "Device not authorized",
        isAuthorized: false,
        error: androidInfo.isAndroid
          ? "ANDROID_DEVICE_UNAUTHORIZED"
          : "DEVICE_UNAUTHORIZED",
      });
    }

    const device = deviceResult.recordset[0];

    // ✅ ANDROID FIX: Check if device fingerprint has significantly changed
    const storedFingerprint = JSON.parse(device.storedFingerprint);
    const fingerprintChanged = await this.checkFingerprintChanges(
      storedFingerprint,
      deviceFingerprint
    );

    // If significant changes detected, update the fingerprint
    if (fingerprintChanged.shouldUpdate) {
      await pool
        .request()
        .input("fingerprintId", device.fingerprintId)
        .input("newFingerprint", JSON.stringify(deviceFingerprint)).query(`
          UPDATE DeviceFingerprints 
          SET fingerprint = @newFingerprint, lastUpdated = GETDATE()
          WHERE fingerprintId = @fingerprintId
        `);

      console.log("🔄 ANDROID FINGERPRINT UPDATED:", {
        fingerprintId: device.fingerprintId,
        deviceName: device.deviceName,
        isAndroid: androidInfo.isAndroid,
        changes: fingerprintChanged.changes,
      });
    }

    // ✅ ANDROID SUCCESS: Log successful verification
    console.log("✅ ANDROID DEVICE VERIFIED:", {
      fingerprintId: device.fingerprintId,
      deviceName: device.deviceName,
      isAndroid: androidInfo.isAndroid,
      androidInfo: androidInfo,
      matchedBy:
        JSON.parse(device.storedFingerprint)?.hash === deviceFingerprint.hash
          ? "exact_hash_match"
          : "fallback_match",
      fingerprintUpdated: fingerprintChanged.shouldUpdate,
    });

    // Log successful access
    await pool
      .request()
      .input("deviceFingerprintId", device.fingerprintId)
      .input("userId", req.user.userId)
      .input(
        "accessType",
        androidInfo.isAndroid
          ? "android_device_verification"
          : "device_verification"
      )
      .input("ipAddress", req.ip)
      .input(
        "location",
        JSON.stringify({
          ip: req.ip,
          timestamp: new Date().toISOString(),
          userAgent: userAgent,
          isAndroid: androidInfo.isAndroid,
          androidInfo: androidInfo.isAndroid ? androidInfo : undefined,
        })
      ).query(`
        INSERT INTO DeviceAccessLogs 
        (deviceFingerprintId, userId, accessType, ipAddress, location)
        VALUES (@deviceFingerprintId, @userId, @accessType, @ipAddress, @location)
      `);

    res.json({
      success: true,
      message: androidInfo.isAndroid
        ? "Android device verified successfully"
        : "Device verified successfully",
      isAuthorized: true,
      device: {
        fingerprintId: device.fingerprintId,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        isAndroid: androidInfo.isAndroid,
        androidInfo: androidInfo.isAndroid ? androidInfo : undefined,
      },
      fingerprintUpdated: fingerprintChanged.shouldUpdate,
    });
  } catch (error) {
    const userAgent = req.headers["user-agent"] || "";
    const androidInfo = getAndroidDeviceInfo(userAgent);

    console.error("❌ ANDROID DEVICE VERIFICATION ERROR:", {
      error: error.message,
      stack: error.stack,
      isAndroid: androidInfo.isAndroid,
      androidInfo: androidInfo,
      userAgent: userAgent,
      timestamp: new Date().toISOString(),
    });

    res.status(500).json({
      success: false,
      message: androidInfo.isAndroid
        ? "Failed to verify Android device"
        : "Failed to verify device",
      error: androidInfo.isAndroid
        ? "ANDROID_VERIFICATION_FAILED"
        : "VERIFICATION_FAILED",
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

    // Check browser version changes
    if (
      oldFingerprint.details?.browserVersion !==
      newFingerprint.details?.browserVersion
    ) {
      significantChanges.push("browser_version");
    }

    // Check user agent changes
    if (
      oldFingerprint.details?.userAgent !== newFingerprint.details?.userAgent
    ) {
      significantChanges.push("user_agent");
    }

    // Check WebGL changes (driver updates)
    if (
      JSON.stringify(oldFingerprint.details?.webgl) !==
      JSON.stringify(newFingerprint.details?.webgl)
    ) {
      significantChanges.push("webgl");
    }

    // ✅ ANDROID FIX: Check Android-specific changes
    if (
      oldFingerprint.details?.isAndroid !== newFingerprint.details?.isAndroid
    ) {
      significantChanges.push("android_detection");
    }

    // Check collect method changes (important for Android compatibility)
    if (
      oldFingerprint.details?.collectMethod !==
      newFingerprint.details?.collectMethod
    ) {
      significantChanges.push("collect_method");
    }

    // ✅ ANDROID FIX: More lenient update threshold for mobile devices
    const isAndroid = newFingerprint.details?.isAndroid || false;
    const updateThreshold = isAndroid ? 1 : 2; // Android devices are more tolerant of changes
    const shouldUpdate = significantChanges.length >= updateThreshold;

    return {
      shouldUpdate,
      changes: significantChanges,
      isAndroid: isAndroid,
      threshold: updateThreshold,
    };
  } catch (error) {
    return {
      shouldUpdate: false,
      changes: [],
      error: error.message,
      isAndroid: false,
      threshold: 2,
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
