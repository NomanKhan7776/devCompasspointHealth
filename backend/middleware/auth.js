// middleware/auth.js - Debug version
const jwt = require("jsonwebtoken");
const { pool } = require("../config/database");

module.exports = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header("x-auth-token");

    // Check if no token
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token, authorization denied",
        debug: {
          url: req.originalUrl,
          headers: Object.keys(req.headers),
        },
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Add user from payload
    req.user = decoded.user;

    // Check if user still exists in database
    await pool.connect();
    const result = await pool
      .request()
      .input("userId", req.user.id || req.user.userId)
      .query("SELECT * FROM Users WHERE userId = @userId");

    if (result.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists",
        debug: {
          userId: req.user.id || req.user.userId,
        },
      });
    }

    // Add full user object to request
    req.user = result.recordset[0];

    next();
  } catch (err) {
    console.error("❌ Auth middleware error:", err.message);
    console.error("❌ Error details:", {
      name: err.name,
      message: err.message,
      url: req.originalUrl,
    });

    res.status(401).json({
      success: false,
      message: "Token is not valid",
      debug:
        process.env.NODE_ENV === "development"
          ? {
              error: err.message,
              url: req.originalUrl,
            }
          : undefined,
    });
  }
};
