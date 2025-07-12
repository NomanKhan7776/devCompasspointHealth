require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

// Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const assignmentRoutes = require("./routes/assignments");
const blobRoutes = require("./routes/blobs");
const smartTokenRoutes = require("./routes/smartTokenRoutes"); // ✅ CONSOLIDATED SmartToken routes
const deviceRoutes = require("./routes/deviceRoutes");
const patientRequests = require("./routes/patientRequests.js");
const emergencyContactsRoutes = require("./routes/emergencyContactsRoutes.js");

// Create Express app
const app = express();

if (process.env.NODE_ENV === "production") {
  // In production, trust first proxy (common for most deployments)
  app.set("trust proxy", 1);
} else {
  // In development, trust all proxies for testing
  app.set("trust proxy", true);
}

if (process.env.NODE_ENV === "development") {
  app.use("/patients", (req, res, next) => {
    console.log(`🔍 IP Detection Debug:
    req.ip: ${req.ip}
    x-forwarded-for: ${req.headers["x-forwarded-for"]}
    x-real-ip: ${req.headers["x-real-ip"]}
    cf-connecting-ip: ${req.headers["cf-connecting-ip"]}
    connection.remoteAddress: ${req.connection?.remoteAddress}
    `);
    next();
  });
}

// Set view engine for EJS templates
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json());

// Enhanced Helmet configuration for security with Safari iOS compatibility and SmartToken support
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Allow inline styles for Tailwind
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
        ],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Allow inline scripts for patient data page and device fingerprinting
          "https://maps.googleapis.com",
        ],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https:", "https://maps.googleapis.com"],
        connectSrc: [
          "'self'",
          // VivoKey API for SmartToken verification
          "https://auth.vivokey.com",
          // Your actual Azure backend API
          "https://cph-prms-api-2.azurewebsites.net",
          // Development localhost fallbacks
          // ✅ NEW: Location and SMS services
          "https://maps.googleapis.com",
          "https://api.twilio.com",
          "http://ip-api.com",
          "https://ipinfo.io",
          "https://nominatim.openstreetmap.org",
          ...(process.env.NODE_ENV === "development"
            ? [
                "http://localhost:5000",
                "http://localhost:3000",
                "http://127.0.0.1:5000",
                "http://localhost:5173", // Add Vite dev server
              ]
            : []),
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
        frameAncestors: ["'self'"], // Prevent embedding in iframes
        formAction: ["'self'"], // Allow form submissions to same origin for Safari iOS compatibility
      },
    },
    crossOriginEmbedderPolicy: false, // Allow file viewing in new windows
    crossOriginResourcePolicy: { policy: "same-site" },
  })
);

// Enhanced CORS configuration for device management and fingerprinting
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests from your frontend domains
      const allowedOrigins = [
        process.env.FRONTEND_URL,
        "https://compasspointpr.ms",
        "https://www.compasspointpr.ms",
        "https://cph-prms-api-2.azurewebsites.net",
        ...(process.env.NODE_ENV === "development"
          ? [
              "http://localhost:5000",
              "http://localhost:5173",
              "http://192.168.1.3:5173",
              "http://192.168.1.3:5000",
              "http://localhost:3000",
              null,
            ]
          : []),
      ];

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-auth-token",
      "X-Requested-With",
      "X-Device-Fingerprint", // Allow device fingerprint header
      "X-Device-Info", // Allow additional device info
    ],
    exposedHeaders: ["X-Total-Count", "X-Device-Status"], // Expose device status
  })
);

// Special CSP handling for SmartToken emergency access routes and device fingerprinting
app.use("/patients", (req, res, next) => {
  // More permissive CSP for emergency access pages and device fingerprinting
  const scriptSources = [
    "'self'",
    "'unsafe-inline'",
    "https://cdnjs.cloudflare.com",
  ];

  // ✅ FIX: Add localhost sources in development
  if (process.env.NODE_ENV === "development") {
    scriptSources.push(
      "http://localhost:5000",
      "http://localhost:3000",
      "http://127.0.0.1:5000",
      "http://localhost:5173"
    );
  }

  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self' 'unsafe-inline'; ` +
      `script-src ${scriptSources.join(" ")}; ` +
      `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; ` +
      `font-src 'self' https://cdnjs.cloudflare.com; ` +
      `img-src 'self' data: https:; ` +
      `connect-src 'self' https: data: ${
        process.env.NODE_ENV === "development"
          ? "http://localhost:5000 http://localhost:3000 http://127.0.0.1:5000 http://localhost:5173"
          : ""
      }; ` +
      `object-src 'none'; ` +
      `frame-ancestors 'self';`
  );
  next();
});

// Security middleware for file viewing with Safari iOS compatibility
app.use((req, res, next) => {
  // Add security headers for all responses
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN"); // Changed from DENY for Safari iOS compatibility
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Special headers for file viewing endpoints with Safari iOS considerations
  if (req.url.includes("/view")) {
    res.setHeader(
      "Cache-Control",
      "no-cache, no-store, must-revalidate, private"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // More permissive CSP for Safari iOS file viewing
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self' 'unsafe-inline'; img-src 'self' data:; style-src 'self' 'unsafe-inline';"
    );
  }

  next();
});

// Middleware for different route types
app.use("/api/auth", express.json());
app.use("/api/users", express.json());
app.use("/api/assignments", express.json());
app.use("/api/blobs", express.urlencoded({ extended: true })); // Support both JSON and form data for Safari iOS
app.use("/api/devices", express.json()); // Device management middleware
app.use("/api/smart-tokens", express.json()); // ✅ CONSOLIDATED SmartToken middleware
app.use("/patients", express.json());
app.use("/patients", express.urlencoded({ extended: true })); // Add form data support for Safari iOS

// Additional middleware
app.use(express.urlencoded({ extended: true }));

// Enhanced logging for security monitoring
if (process.env.NODE_ENV === "development") {
  app.use(morgan("combined"));
} else {
  // Production logging with IP tracking
  app.use(
    morgan("combined", {
      skip: function (req, res) {
        // Don't log successful file views to reduce log noise
        return req.url.includes("/view") && res.statusCode < 400;
      },
    })
  );
}

// Rate limiting for authentication endpoints (production)
if (process.env.NODE_ENV === "production") {
  const rateLimit = require("express-rate-limit");

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login requests per windowMs
    message: {
      error: "Too many login attempts, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
      error: "Too many requests, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Device registration rate limiting
  const deviceLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit device registration attempts
    message: {
      error: "Too many device registration attempts, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply rate limiting
  app.use("/api/auth/login", authLimiter);
  app.use("/api/devices/register", deviceLimiter);
  app.use("/api/devices/register-via-qr", deviceLimiter);
  app.use("/api/", generalLimiter);
}

// Serve static files with security headers
app.use(
  "/static",
  express.static(path.join(__dirname, "public"), {
    setHeaders: (res, path) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "public, max-age=31536000"); // 1 year for static assets
    },
  })
);

// Serve device fingerprinting service
app.use(
  "/js",
  express.static(path.join(__dirname, "services"), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".js")) {
        res.setHeader("Content-Type", "application/javascript");
        res.setHeader("Cache-Control", "public, max-age=86400"); // 1 day cache for JS files
      }
    },
  })
);

// ✅ CONSOLIDATED ROUTES - No more duplicates!
app.use("/patients", smartTokenRoutes); // Public token verification routes
app.use("/api/smart-tokens", smartTokenRoutes); // ✅ UNIFIED API routes (both public and admin)
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/blobs", blobRoutes);
app.use("/api/devices", deviceRoutes); // Device management routes
app.use("/api/patient-requests", patientRequests);
// ✅ NEW: Emergency contacts and security alerts routes
app.use("/api/emergency-contacts", emergencyContactsRoutes);

// Health check endpoint with session info (for monitoring)
app.get("/", (req, res) => {
  const auth = require("./middleware/auth");
  res.status(200).json({
    status: "ok",
    message: "CompassPoint Health PRMS Server is running",
    timestamp: new Date().toISOString(),
    version: "2.1.0", // ✅ Updated version for consolidated routes
    security: "enhanced",
    safariIOSCompatible: true,
    deviceManagement: "enabled",
    advancedFingerprinting: "enabled",
    consolidatedSmartTokens: "enabled", // ✅ Updated feature name
    activeSessions: auth.getActiveSessionsCount
      ? auth.getActiveSessionsCount()
      : "unknown",
  });
});

// Enhanced API status endpoint with consolidated features info
app.get("/api/status", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "CompassPoint Health PRMS API",
    timestamp: new Date().toISOString(),
    version: "2.1.0", // ✅ Updated version
    features: {
      deviceManagement: "enabled",
      advancedFingerprinting: "enabled",
      consolidatedTokenManagement: "enabled", // ✅ Updated feature name
      enhancedPatientDoctorLinking: "enabled", // ✅ New feature
      familyDeviceRegistration: "enabled",
      realTimeAlerts: "enabled",
      unifiedRouting: "enabled", // ✅ New feature
    },
    security: {
      sessionTracking: "enabled",
      fileProtection: "enhanced",
      corsEnabled: true,
      safariIOSCompatible: true,
      deviceFingerprinting: "enabled",
      rateLimiting:
        process.env.NODE_ENV === "production" ? "enabled" : "disabled",
    },
    endpoints: {
      deviceManagement: "/api/devices/*",
      consolidatedSmartTokens: "/api/smart-tokens/*", // ✅ Updated endpoint description
      publicTokenAccess: "/patients/*",
      fingerprinting: "/js/deviceFingerprintingService.js",
    },
  });
});

// Device fingerprinting service endpoint info
app.get("/api/device-info", (req, res) => {
  res.status(200).json({
    fingerprintingService: {
      available: true,
      endpoint: "/js/deviceFingerprintingService.js",
      features: [
        "Canvas fingerprinting",
        "WebGL fingerprinting",
        "Audio fingerprinting",
        "Screen detection",
        "Platform analysis",
        "Browser update detection",
      ],
      browserSupport: {
        chrome: "full",
        firefox: "full",
        safari: "full",
        edge: "full",
        mobile: "optimized",
      },
    },
  });
});

app.post("/api/device-location", async (req, res) => {
  try {
    const { tokenId, location, timestamp } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.headers["user-agent"] || "";

    // Enhanced logging for GPS collection
    console.log(`📍 GPS Location received for token ${tokenId}:`, {
      location,
      ipAddress,
      timestamp,
      userAgent,
      hasCoordinates: !!(location?.latitude && location?.longitude),
      accuracy: location?.accuracy || "unknown",
    });

    // ✅ ENHANCED: Validate GPS coordinates
    if (!location || !location.latitude || !location.longitude) {
      return res.status(400).json({
        success: false,
        message: "Invalid GPS coordinates provided",
        timestamp: new Date().toISOString(),
      });
    }

    // ✅ ENHANCED: Validate coordinates are within valid ranges
    const lat = parseFloat(location.latitude);
    const lon = parseFloat(location.longitude);

    if (
      isNaN(lat) ||
      isNaN(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "GPS coordinates out of valid range",
        timestamp: new Date().toISOString(),
      });
    }

    // ✅ ENHANCED: Get comprehensive location data using the location service
    const locationService = require("./services/locationService");
    let comprehensiveLocation;

    try {
      comprehensiveLocation = await locationService.getLocationFromGPS(
        lat,
        lon
      );
      console.log(`✅ GPS location processed:`, {
        type: comprehensiveLocation.type,
        hasAddress: !!comprehensiveLocation.address,
        accuracy: comprehensiveLocation.accuracy,
      });
    } catch (locationError) {
      console.error("Error processing GPS location:", locationError);
      comprehensiveLocation = {
        type: "gps",
        latitude: lat,
        longitude: lon,
        address: `GPS coordinates ${lat}, ${lon}`,
        accuracy: location.accuracy || "unknown",
        error: locationError.message,
        timestamp: new Date().toISOString(),
      };
    }

    // ✅ ENHANCED: Store GPS location in database for emergency tracking
    const { pool, sql } = require("./config/database");

    try {
      await pool.connect();

      // Store the GPS location update
      await pool
        .request()
        .input("tokenId", sql.NVarChar, tokenId)
        .input("latitude", sql.Float, lat)
        .input("longitude", sql.Float, lon)
        .input("accuracy", sql.Float, parseFloat(location.accuracy) || 0)
        .input("ipAddress", sql.NVarChar, ipAddress)
        .input("userAgent", sql.NVarChar, userAgent)
        .input(
          "locationData",
          sql.NVarChar,
          JSON.stringify(comprehensiveLocation)
        )
        .input("timestamp", sql.DateTime, new Date()).query(`
          INSERT INTO GPSLocationUpdates (
            tokenId, latitude, longitude, accuracy, ipAddress, userAgent, locationData, timestamp
          )
          VALUES (
            @tokenId, @latitude, @longitude, @accuracy, @ipAddress, @userAgent, @locationData, @timestamp
          )
        `);

      console.log(`✅ GPS location stored in database for token ${tokenId}`);

      // ✅ ENHANCED: Check if this is an emergency access scenario
      // Look up the token to see if it's being accessed by an unregistered device
      const tokenLookup = await pool
        .request()
        .input("tokenId", sql.NVarChar, tokenId).query(`
          SELECT TOP 1 
            etal.isRegisteredDevice,
            etal.patientUserId,
            etal.alertsSent,
            etal.logId,
            st.patientName
          FROM EnhancedTokenAccessLog etal
          JOIN SmartTokens st ON etal.tokenId = st.smartTokenId
          WHERE etal.tokenId = @tokenId
          ORDER BY etal.accessTime DESC
        `);

      if (tokenLookup.recordset.length > 0) {
        const latestAccess = tokenLookup.recordset[0];

        // ✅ If this is an unregistered device access, update the location info
        if (!latestAccess.isRegisteredDevice && latestAccess.patientUserId) {
          console.log(
            `🚨 Updating emergency alert location for unregistered device access`
          );

          // Update the existing log entry with GPS location
          await pool
            .request()
            .input("logId", sql.Int, latestAccess.logId)
            .input(
              "locationData",
              sql.NVarChar,
              JSON.stringify(comprehensiveLocation)
            ).query(`
              UPDATE EnhancedTokenAccessLog 
              SET locationData = @locationData
              WHERE logId = @logId
            `);

          // ✅ Check if we need to send updated emergency alerts with GPS location
          if (latestAccess.alertsSent === 0) {
            console.log(
              `📱 Triggering emergency alerts with GPS location data`
            );

            // Import the emergency functions
            const {
              triggerEmergencyAlerts,
            } = require("./controllers/consolidatedSmartTokenController");

            // Create a mock request object for the emergency system
            const mockReq = {
              body: {
                gpsCoordinates: {
                  latitude: lat,
                  longitude: lon,
                  accuracy: location.accuracy || "unknown",
                },
              },
              headers: { "user-agent": userAgent },
              ip: ipAddress,
            };

            // ✅ ENHANCED: Try to trigger emergency alerts with GPS data
            try {
              const alertResult = await triggerEmergencyAlerts(
                tokenId,
                latestAccess.patientUserId,
                latestAccess.patientName,
                latestAccess.logId,
                {
                  type: getDeviceTypeFromUserAgent(userAgent),
                  browser: getBrowserFromUserAgent(userAgent),
                  os: getOSFromUserAgent(userAgent),
                  deviceName: getDeviceNameFromUserAgent(userAgent),
                  isRegistered: false,
                },
                comprehensiveLocation,
                mockReq
              );

              if (alertResult.success) {
                console.log(
                  `✅ Emergency alerts sent successfully with GPS location`
                );

                // Update the log to indicate alerts were sent
                await pool
                  .request()
                  .input("logId", sql.Int, latestAccess.logId)
                  .input("alertsSent", sql.Int, alertResult.smsSuccessful || 0)
                  .query(`
                    UPDATE EnhancedTokenAccessLog 
                    SET alertsSent = @alertsSent
                    WHERE logId = @logId
                  `);
              }
            } catch (alertError) {
              console.error(
                "Error triggering emergency alerts with GPS:",
                alertError
              );
            }
          }
        }
      }
    } catch (dbError) {
      console.error("Database error storing GPS location:", dbError);
      // Don't fail the request if database storage fails
    }

    // ✅ SUCCESS: Return success response
    res.json({
      success: true,
      message: "GPS location updated successfully",
      location: {
        type: comprehensiveLocation.type,
        latitude: lat,
        longitude: lon,
        accuracy: location.accuracy || "unknown",
        address: comprehensiveLocation.address,
        hasAddress:
          !!comprehensiveLocation.address &&
          !comprehensiveLocation.address.includes("GPS coordinates"),
      },
      timestamp: new Date().toISOString(),
      tokenId: tokenId,
    });
  } catch (error) {
    console.error("GPS location endpoint error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process GPS location",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
      timestamp: new Date().toISOString(),
    });
  }
});

// ✅ NEW: IP Location Endpoint
app.get("/api/ip-location", async (req, res) => {
  try {
    const ipAddress = getRealUserIP(req);
    console.log(`📍 IP location request from: ${ipAddress}`);

    // ✅ Import location service
    const locationService = require("./services/locationService");

    // ✅ Get IP location
    const locationData = await locationService.getLocationFromIP(ipAddress);

    console.log("✅ IP location data:", {
      type: locationData.type,
      city: locationData.city,
      region: locationData.region,
      country: locationData.country,
      isPrivate: locationData.isPrivate,
    });

    // ✅ Return location data
    res.json({
      success: true,
      location: locationData,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ IP location error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get IP location",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ✅ NEW: Enhanced Device Fingerprint Verification Endpoint
app.post("/patients/verify/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { deviceFingerprint, deviceMetadata, gpsCoordinates } = req.body;

    console.log(`📱 Client fingerprint received for token ${id}:`);
    console.log(`   - Hash: ${deviceFingerprint?.hash}`);
    console.log(`   - Device: ${deviceMetadata?.deviceName}`);
    console.log(`   - GPS: ${gpsCoordinates ? "Yes" : "No"}`);
    console.log(`   - Method: ${deviceMetadata?.method}`);
    console.log(`   - Consistency: ${deviceMetadata?.consistency}`);

    // ✅ Import the enhanced controller
    const {
      checkDeviceAndTriggerAlerts,
    } = require("./controllers/consolidatedSmartTokenController");

    // ✅ Get token info from database
    const { pool, sql } = require("./config/database");
    await pool.connect();

    const tokenResult = await pool.request().input("tokenId", sql.NVarChar, id)
      .query(`
        SELECT patientUserId, patientName, status
        FROM SmartTokens 
        WHERE smartTokenId = @tokenId
      `);

    if (tokenResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Token not found",
      });
    }

    const token = tokenResult.recordset[0];

    // ✅ CRITICAL FIX: Enhanced device check with client fingerprint
    const deviceCheckResult = await checkDeviceAndTriggerAlerts(
      req,
      id,
      token.patientUserId,
      token.patientName,
      false // Don't skip alerts - we have client fingerprint
    );

    console.log("✅ Enhanced device check completed:", {
      isRegistered: deviceCheckResult.isRegisteredDevice,
      alertsTriggered: deviceCheckResult.alertsTriggered,
      method: deviceCheckResult.fingerprintMethod,
      usingClient: deviceCheckResult.usingClientFingerprint,
      locationData: !!deviceCheckResult.locationData,
    });

    // ✅ Return comprehensive result
    res.json({
      success: true,
      tokenId: id,
      isRegisteredDevice: deviceCheckResult.isRegisteredDevice,
      alertsTriggered: deviceCheckResult.alertsTriggered,
      deviceInfo: deviceCheckResult.deviceInfo,
      locationData: deviceCheckResult.locationData,
      securityStatus: deviceCheckResult.isRegisteredDevice
        ? "registered"
        : "unregistered",
      verificationType: deviceCheckResult.usingClientFingerprint
        ? "client_fingerprint"
        : "server_fallback",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Device verification error:", error);
    res.status(500).json({
      success: false,
      message: "Device verification failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Helper functions for device detection (add these if not already present)
// ✅ ENHANCED: Helper functions for device detection and IP handling
/**
 * Get the real user IP address from request headers
 * Handles proxies, load balancers, CDNs, and direct connections
 */
function getRealUserIP(req) {
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
}

/**
 * Validate if a string is a valid IP address
 */
function isValidIP(ip) {
  if (!ip || typeof ip !== "string") return false;

  // Remove IPv6 brackets if present
  ip = ip.replace(/\[|\]/g, "");

  // IPv4 regex
  const ipv4Regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  // IPv6 regex (simplified)
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;

  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Check if IP is a public IP (not private/local)
 */
function isValidPublicIP(ip) {
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
}

// Enhanced device detection functions
function getDeviceTypeFromUserAgent(userAgent) {
  if (
    /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(userAgent)
  ) {
    return "mobile";
  }
  return "desktop";
}

function getBrowserFromUserAgent(userAgent) {
  if (/Edg/i.test(userAgent)) return "Edge";
  if (/Chrome/i.test(userAgent) && !/Edg/i.test(userAgent)) return "Chrome";
  if (/Firefox/i.test(userAgent)) return "Firefox";
  if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) return "Safari";
  if (/SamsungBrowser/i.test(userAgent)) return "Samsung Internet";
  return "Unknown";
}

function getOSFromUserAgent(userAgent) {
  if (/iPhone|iPad/i.test(userAgent)) {
    const match = userAgent.match(/OS ([0-9_]+)/);
    return match ? `iOS ${match[1].replace(/_/g, ".")}` : "iOS";
  }
  if (/Android/i.test(userAgent)) {
    const match = userAgent.match(/Android\s([0-9\.]+)/);
    return match ? `Android ${match[1]}` : "Android";
  }
  if (/Mac OS X/i.test(userAgent)) return "macOS";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Unknown";
}

function getDeviceNameFromUserAgent(userAgent) {
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
}

// ✅ NEW: Enhanced database error handling
async function logFileOperation(operation, details) {
  try {
    const { pool, sql } = require("./config/database");
    await pool.connect();

    // ✅ Truncate operation to fit column size (prevent truncation errors)
    const truncatedOperation = operation.substring(0, 50);

    await pool
      .request()
      .input("operation", sql.NVarChar(50), truncatedOperation)
      .input("details", sql.NVarChar, JSON.stringify(details))
      .input("timestamp", sql.DateTime, new Date()).query(`
        INSERT INTO FileAudit (operation, details, timestamp)
        VALUES (@operation, @details, @timestamp)
      `);

    console.log(`✅ File operation logged: ${truncatedOperation}`);
  } catch (error) {
    console.error("❌ Error logging file operation:", error);
    // Don't throw - this is just logging
  }
}

// Enhanced error handling middleware with security focus and Safari iOS compatibility
app.use((err, req, res, next) => {
  // Enhanced error logging for device-related errors
  if (
    req.url.includes("/api/devices") ||
    req.url.includes("/api/smart-tokens")
  ) {
    console.error(`Device/Token API Error: ${req.method} ${req.url}`, {
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      userId: req.user?.userId || "anonymous",
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      deviceFingerprint: req.headers["x-device-fingerprint"] || "not-provided",
    });
  }

  // Log errors server-side only (don't expose internal details)
  if (process.env.NODE_ENV === "development") {
    console.error("Application Error:", err.stack);
  } else {
    // In production, log errors but don't expose stack traces
    console.error("Application Error:", {
      message: err.message,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      timestamp: new Date().toISOString(),
    });
  }

  // Handle different error types
  if (err.name === "ValidationError") {
    return res.status(400).render("error", {
      title: "Validation Error",
      message: "Invalid data provided",
      errorCode: "VALIDATION_ERROR",
    });
  }

  if (err.name === "UnauthorizedError") {
    return res.status(401).render("error", {
      title: "Unauthorized",
      message: "Access denied",
      errorCode: "UNAUTHORIZED",
    });
  }

  // Security: Don't expose internal errors in production
  const isProduction = process.env.NODE_ENV === "production";
  const errorMessage = isProduction
    ? "An unexpected error occurred"
    : err.message;

  // Check if it's an API request (JSON response) or web request (HTML response)
  if (
    req.originalUrl.startsWith("/api/") ||
    req.originalUrl.startsWith("/patients/admin/")
  ) {
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: isProduction ? "Server error" : err.message,
      timestamp: new Date().toISOString(),
    });
  } else {
    // Render error page for web requests (SmartToken access) with Safari iOS compatibility
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>System Error</title>
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
          <h1>System Error</h1>
          <p>${errorMessage}</p>
          <p>Please try again or contact technical support</p>
        </div>
      </body>
      </html>
    `);
  }
});

// Enhanced 404 Handler with security logging and Safari iOS compatibility
app.use("*", (req, res) => {
  // Log 404s for security monitoring (potential probing)
  if (process.env.NODE_ENV === "production") {
    console.warn("404 Request:", {
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      timestamp: new Date().toISOString(),
    });
  }

  // Check if it's an API request
  if (
    req.originalUrl.startsWith("/api/") ||
    req.originalUrl.startsWith("/patients/admin/")
  ) {
    res.status(404).json({
      success: false,
      message: "Endpoint not found",
      endpoint: req.originalUrl,
      availableEndpoints: {
        devices: "/api/devices/*",
        consolidatedSmartTokens: "/api/smart-tokens/*", // ✅ Updated endpoint name
        publicTokenAccess: "/patients/*", // ✅ Added public access info
        auth: "/api/auth/*",
        users: "/api/users/*",
        assignments: "/api/assignments/*",
        blobs: "/api/blobs/*",
        patientRequests: "/api/patient-requests/*",
      },
      timestamp: new Date().toISOString(),
    });
  } else {
    // For web requests, show 404 page with Safari iOS compatibility
    res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Page Not Found</title>
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
          <h1>Page Not Found</h1>
          <p>The requested page could not be found</p>
          <p>Please check the URL or contact support if you believe this is an error</p>
        </div>
      </body>
      </html>
    `);
  }
});

// Graceful shutdown handling
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  process.exit(0);
});

// ✅ Enhanced startup logging with consolidated features
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  if (process.env.NODE_ENV === "development") {
    console.log(`
🚀 CompassPoint Health PRMS Server v2.1.0 running on port ${PORT}
📍 Health Check: http://localhost:${PORT}/
🔗 SmartToken Verification: http://localhost:${PORT}/patients/verify/:id
📊 API Status: http://localhost:${PORT}/api/status
🔒 Security Features: Enhanced session tracking, file protection, CORS enabled
🍎 Safari iOS Compatible: Enhanced cross-browser compatibility
🛡️  CSP: Configured for SmartToken emergency access
📱 Device Management: http://localhost:${PORT}/api/devices/*
🏷️ ✅ CONSOLIDATED SmartTokens: http://localhost:${PORT}/api/smart-tokens/*
   ├── Public Routes: /patients/* (verification, file access)
   ├── Admin API: /api/smart-tokens/* (management, assignment)
   ├── Enhanced Features: Patient/Doctor linking, folder assignment tracking
   └── No More Duplicates: Single unified routing system
🖥️ Fingerprinting Service: http://localhost:${PORT}/js/deviceFingerprintingService.js
🔍 Device Info: http://localhost:${PORT}/api/device-info
🕐 Started at: ${new Date().toISOString()}
    `);
  } else {
    console.log(`
🏥 CompassPoint Health PRMS Server v2.1.0 running on port ${PORT}
🔒 Security: Enhanced protection enabled
🍎 Safari iOS: Full compatibility enabled
🛡️  CSP: SmartToken emergency access configured
📱 Device Management: Enabled with advanced fingerprinting
🏷️ ✅ Consolidated SmartTokens: Unified routing system enabled
├── Public Access: Emergency token verification
├── Admin API: Enhanced token management with user linking
└── Real-time Features: Folder assignment tracking, alerts
🔔 Monitoring: Unauthorized access detection enabled
🕐 Started: ${new Date().toISOString()}
    `);
  }
});

module.exports = app;
