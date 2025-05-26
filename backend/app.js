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

// Helmet configuration - allow inline styles for emergency pages
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
      },
    },
  })
);

// CORS configuration - UPDATED for production
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["https://compasspointpr.ms"] // Replace with your actual domains
        : ["http://localhost:5000", "http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-auth-token"],
    credentials: true,
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

// Routes
app.use("/patients", smartTokenRoutes);
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

// Error handling middleware
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

// 404 Handler
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

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  if (process.env.NODE_ENV === "development") {
    console.log(`
🚀 CompassPoint Health PRMS Server running on port ${PORT}
📍 Health Check: http://localhost:${PORT}/
🔗 SmartToken Endpoint: http://localhost:${PORT}/patients/verify/:id
📊 API Status: http://localhost:${PORT}/api/status
🕐 Started at: ${new Date().toISOString()}
    `);
  } else {
    console.log(`CompassPoint Health PRMS Server running on port ${PORT}`);
  }
});

module.exports = app;
