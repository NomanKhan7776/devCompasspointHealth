// app.js - UPDATED CORS CONFIGURATION
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

// Helmet configuration - UPDATED for SmartToken pages
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
          // Add your production domains here
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    // Allow embedding in iframes from your frontend domain
    frameAncestors:
      process.env.NODE_ENV === "production"
        ? ["https://compasspointpr.ms"]
        : ["http://localhost:5173", "http://localhost:3000"],
  })
);

// CORS configuration - UPDATED to include your frontend domain
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        "https://compasspointpr.ms", // Your production frontend
        // "http://localhost:5173", // Vite dev server
        // "http://localhost:3000", // Alternative dev port
        // "http://localhost:5000", // Backend dev server
      ];

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`CORS blocked origin: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-auth-token",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    credentials: true,
    optionsSuccessStatus: 200, // Some legacy browsers choke on 204
  })
);

// Middleware for different route types
app.use("/api/auth", express.json());
app.use("/api/users", express.json());
app.use("/api/assignments", express.json());
app.use("/api/blobs", express.urlencoded({ extended: true }));
app.use("/patients", express.json());

// Additional middleware
app.use(express.urlencoded({ extended: true }));

// Logging - simplified for production
if (process.env.NODE_ENV === "development") {
  app.use(morgan("combined"));
} else {
  app.use(morgan("common"));
}

// Serve static files
app.use("/static", express.static(path.join(__dirname, "public")));

// Add a specific route for SmartToken redirects from frontend
app.get("/api/smarttoken/redirect/:id", (req, res) => {
  const { id } = req.params;
  const { s: signature } = req.query;

  if (!id || !signature) {
    return res.status(400).json({
      success: false,
      message: "Missing token ID or signature",
    });
  }

  // Redirect to the actual SmartToken verification endpoint
  res.redirect(`/patients/verify/${id}?s=${signature}`);
});

// Routes
app.use("/patients", smartTokenRoutes); // SmartToken routes (PUBLIC)
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/blobs", blobRoutes);

// Health check endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "CompassPoint Health PRMS Server is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// API status endpoint
app.get("/api/status", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "CompassPoint Health PRMS API",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// SmartToken health check (for testing chip configuration)
app.get("/patients/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "SmartToken Verification Service",
    timestamp: new Date().toISOString(),
    message: "Ready to verify SmartTokens",
  });
});

// Error handling middleware - UPDATED for better SmartToken error handling
app.use((err, req, res, next) => {
  // Log errors server-side only
  if (process.env.NODE_ENV === "development") {
    console.error("Application Error:", err.stack);
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

  // Handle CORS errors for SmartToken requests
  if (err.message === "Not allowed by CORS") {
    if (req.originalUrl.startsWith("/patients/")) {
      return res.status(403).render("error", {
        title: "Access Restricted",
        message: "SmartToken access is restricted to authorized domains",
        errorCode: "CORS_ERROR",
        instructions:
          "Please ensure you are accessing this link from a valid SmartToken device",
      });
    }
  }

  // Check if it's an API request (JSON response) or web request (HTML response)
  if (
    req.originalUrl.startsWith("/api/") ||
    req.originalUrl.startsWith("/patients/admin/")
  ) {
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error:
        process.env.NODE_ENV === "development" ? err.message : "Server error",
    });
  } else {
    // Render error page for web requests (SmartToken access)
    res.status(500).render("error", {
      title: "System Error",
      message: "An unexpected error occurred",
      errorCode: "SYSTEM_ERROR",
      instructions: "Please try again or contact technical support",
    });
  }
});

// 404 Handler - UPDATED for better SmartToken handling
app.use("*", (req, res) => {
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
  } else if (req.originalUrl.startsWith("/patients/")) {
    // For SmartToken requests, show a more helpful 404 page
    res.status(404).render("error", {
      title: "SmartToken Not Found",
      message: "The requested SmartToken could not be found or has expired",
      errorCode: "TOKEN_NOT_FOUND",
      instructions:
        "Please ensure you are scanning a valid SmartToken device or contact support",
    });
  } else {
    // For web requests, show generic 404 page
    res.status(404).render("error", {
      title: "Page Not Found",
      message: "The requested page could not be found",
      errorCode: "404",
      instructions:
        "Please check the URL or contact support if you believe this is an error",
    });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  if (process.env.NODE_ENV === "development") {
    console.log(`
🚀 CompassPoint Health PRMS Server running on port ${PORT}
📍 Health Check: http://localhost:${PORT}/
🔗 SmartToken Endpoint: http://localhost:${PORT}/patients/verify/:id
📊 API Status: http://localhost:${PORT}/api/status
🏥 SmartToken Health: http://localhost:${PORT}/patients/health
🕐 Started at: ${new Date().toISOString()}
    `);
  } else {
    console.log(`CompassPoint Health PRMS Server running on port ${PORT}`);
  }
});

module.exports = app;
