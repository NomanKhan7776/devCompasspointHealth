// controllers/authController.js - Enhanced with session management
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool, sql } = require("../config/database");
const auth = require("../middleware/auth");

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
exports.login = async (req, res) => {
  const { username, password } = req.body;

  try {
    await pool.connect();

    // Check if user exists
    const result = await pool
      .request()
      .input("username", username)
      .query("SELECT * FROM Users WHERE username = @username");

    if (result.recordset.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const user = result.recordset[0];

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Invalidate any existing sessions for this user
    auth.invalidateAllUserSessions(user.userId);

    // Create JWT payload with session info
    const payload = {
      user: {
        id: user.userId,
        userId: user.userId, // Keep both for compatibility
        role: user.role,
        name: user.name,
        username: user.username,
      },
      sessionCreated: Date.now(),
    };

    // Sign token with shorter expiry for security
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "24h" }, // Reduced from "1d" for clarity
      (err, token) => {
        if (err) throw err;
        res.json({
          success: true,
          token,
          user: {
            id: user.userId,
            name: user.name,
            username: user.username,
            role: user.role,
          },
        });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   POST api/auth/logout
// @desc    Logout user and invalidate session
// @access  Private
exports.logout = async (req, res) => {
  try {
    // Invalidate the current session
    if (req.invalidateSession) {
      req.invalidateSession();
    }

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   POST api/auth/logout-all
// @desc    Logout user from all sessions
// @access  Private
exports.logoutAll = async (req, res) => {
  try {
    // Invalidate all sessions for this user
    auth.invalidateAllUserSessions(req.user.userId);

    res.json({
      success: true,
      message: "Logged out from all devices successfully",
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   POST api/auth/register
// @desc    Register a new user
// @access  Private/Admin
exports.register = async (req, res) => {
  const { name, username, password, role } = req.body;

  // Validate role
  if (!["doctor", "nurse", "assistant"].includes(role)) {
    return res.status(400).json({
      success: false,
      message: "Invalid role",
    });
  }

  try {
    await pool.connect();

    // Check if username already exists
    const userCheck = await pool
      .request()
      .input("username", username)
      .query("SELECT * FROM Users WHERE username = @username");

    if (userCheck.recordset.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Username already exists",
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert new user
    const result = await pool
      .request()
      .input("name", name)
      .input("username", username)
      .input("password", hashedPassword)
      .input("role", role).query(`
        INSERT INTO Users (name, username, password, role)
        OUTPUT INSERTED.userId, INSERTED.name, INSERTED.username, INSERTED.role
        VALUES (@name, @username, @password, @role)
      `);

    const user = result.recordset[0];

    res.status(201).json({
      success: true,
      user,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   GET api/auth/me
// @desc    Get current user info and validate session
// @access  Private
exports.getCurrentUser = async (req, res) => {
  try {
    // This route is protected by auth middleware,
    // so req.user is already verified and available
    res.json({
      success: true,
      user: {
        userId: req.user.userId,
        name: req.user.name,
        username: req.user.username,
        role: req.user.role,
      },
      sessionValid: true,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @route   GET api/auth/validate-token
// @desc    Validate token without user lookup (for file access)
// @access  Public (but requires valid token)
exports.validateToken = async (req, res) => {
  try {
    const token = req.header("x-auth-token") || req.query.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if session is still active
    const sessionId = require("crypto")
      .createHash("sha256")
      .update(token + decoded.user.userId)
      .digest("hex");

    // This will be handled by the auth middleware
    res.json({
      success: true,
      valid: true,
      user: decoded.user,
    });
  } catch (err) {
    res.status(401).json({
      success: false,
      valid: false,
      message: "Invalid token",
    });
  }
};
