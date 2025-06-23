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
const smartTokenRoutes = require("./routes/smartTokenRoutes");
const patientRequests = require("./routes/patientRequests");
// Create Express app
const app = express();

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
          "'unsafe-inline'", // Allow inline scripts for patient data page
        ],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          // VivoKey API for SmartToken verification
          "https://auth.vivokey.com",
          // Your actual Azure backend API
          "https://cph-prms-api-2.azurewebsites.net",
          // Development localhost fallbacks
          ...(process.env.NODE_ENV === "development"
            ? [
                "http://localhost:5000",
                "http://localhost:3000",
                "http://127.0.0.1:5000",
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

// CORS configuration - UPDATED for production with enhanced security and Safari iOS compatibility
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["https://compasspointpr.ms", "https://www.compasspointpr.ms"]
        : ["http://localhost:3000", "http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-auth-token"],
    credentials: true,
  })
);

// Special CSP handling for SmartToken emergency access routes
app.use("/patients", (req, res, next) => {
  // More permissive CSP for emergency access pages to avoid blocking inline scripts
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' 'unsafe-inline'; " +
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
      "font-src 'self' https://cdnjs.cloudflare.com; " +
      "img-src 'self' data: https:; " +
      "object-src 'none'; " +
      "frame-ancestors 'self';"
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

  // Apply rate limiting
  app.use("/api/auth/login", authLimiter);
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

// Routes
app.use("/patients", smartTokenRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/blobs", blobRoutes);
app.use("/api/patient-requests", patientRequests);
// Health check endpoint with session info (for monitoring)
app.get("/", (req, res) => {
  const auth = require("./middleware/auth");
  res.status(200).json({
    status: "ok",
    message: "CompassPoint Health PRMS Server is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    security: "enhanced",
    safariIOSCompatible: true,
    activeSessions: auth.getActiveSessionsCount
      ? auth.getActiveSessionsCount()
      : "unknown",
  });
});

// API status endpoint with security info
app.get("/api/status", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "CompassPoint Health PRMS API",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    security: {
      sessionTracking: "enabled",
      fileProtection: "enhanced",
      corsEnabled: true,
      safariIOSCompatible: true,
      rateLimiting:
        process.env.NODE_ENV === "production" ? "enabled" : "disabled",
    },
  });
});

// Enhanced error handling middleware with security focus and Safari iOS compatibility
app.use((err, req, res, next) => {
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

// Enhanced startup logging
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  if (process.env.NODE_ENV === "development") {
    console.log(`
🚀 CompassPoint Health PRMS Server running on port ${PORT}
📍 Health Check: http://localhost:${PORT}/
🔗 SmartToken Endpoint: http://localhost:${PORT}/patients/verify/:id
📊 API Status: http://localhost:${PORT}/api/status
🔒 Security Features: Enhanced session tracking, file protection, CORS enabled
🍎 Safari iOS Compatible: Enhanced cross-browser compatibility
🛡️  CSP: Configured for SmartToken emergency access
🕐 Started at: ${new Date().toISOString()}
    `);
  } else {
    console.log(`
🏥 CompassPoint Health PRMS Server running on port ${PORT}
🔒 Security: Enhanced protection enabled
🍎 Safari iOS: Full compatibility enabled
🛡️  CSP: SmartToken emergency access configured
🕐 Started: ${new Date().toISOString()}
    `);
  }
});

module.exports = app;

