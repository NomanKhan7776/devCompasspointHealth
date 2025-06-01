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

// Create Express app
const app = express();

// Set view engine for EJS templates
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Enhanced Helmet configuration for security
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
          // Add your production API domains here
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
        frameAncestors: ["'self'"], // Prevent embedding in iframes
      },
    },
    crossOriginEmbedderPolicy: false, // Allow file viewing in new windows
    crossOriginResourcePolicy: { policy: "same-site" },
  })
);

// CORS configuration - UPDATED for production with enhanced security
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["https://compasspointpr.ms", "https://www.compasspointpr.ms"] // Replace with your actual domains
        : ["http://localhost:3000", "http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-auth-token"],
    credentials: true,
  })
);

// Security middleware for file viewing
app.use((req, res, next) => {
  // Add security headers for all responses
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Special headers for file viewing endpoints
  if (req.url.includes("/view")) {
    res.setHeader(
      "Cache-Control",
      "no-cache, no-store, must-revalidate, private"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  next();
});

// Middleware for different route types
app.use("/api/auth", express.json());
app.use("/api/users", express.json());
app.use("/api/assignments", express.json());
app.use("/api/blobs", express.urlencoded({ extended: true }));
app.use("/patients", express.json());

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

// Health check endpoint with session info (for monitoring)
app.get("/", (req, res) => {
  const auth = require("./middleware/auth");
  res.status(200).json({
    status: "ok",
    message: "CompassPoint Health PRMS Server is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    security: "enhanced",
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
      rateLimiting:
        process.env.NODE_ENV === "production" ? "enabled" : "disabled",
    },
  });
});

// Enhanced error handling middleware with security focus
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
    // Render error page for web requests (SmartToken access)
    res.status(500).render("error", {
      title: "System Error",
      message: errorMessage,
      errorCode: "SYSTEM_ERROR",
      instructions: "Please try again or contact technical support",
    });
  }
});

// Enhanced 404 Handler with security logging
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
    // For web requests, show 404 page
    res.status(404).render("error", {
      title: "Page Not Found",
      message: "The requested page could not be found",
      errorCode: "404",
      instructions:
        "Please check the URL or contact support if you believe this is an error",
    });
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
🕐 Started at: ${new Date().toISOString()}
    `);
  } else {
    console.log(`
🏥 CompassPoint Health PRMS Server running on port ${PORT}
🔒 Security: Enhanced protection enabled
🕐 Started: ${new Date().toISOString()}
    `);
  }
});

module.exports = app;
