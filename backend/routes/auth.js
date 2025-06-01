// routes/auth.js - Enhanced with logout endpoints
const express = require("express");
const router = express.Router();
const {
  login,
  register,
  getCurrentUser,
  logout,
  logoutAll,
  validateToken,
} = require("../controllers/authController");
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/role-check");

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post("/login", login);

// @route   POST api/auth/logout
// @desc    Logout user and invalidate current session
// @access  Private
router.post("/logout", auth, logout);

// @route   POST api/auth/logout-all
// @desc    Logout user from all sessions
// @access  Private
router.post("/logout-all", auth, logoutAll);

// @route   GET api/auth/validate-token
// @desc    Validate token for file access
// @access  Public (but requires token)
router.get("/validate-token", auth, validateToken);

// @route   POST api/auth/register
// @desc    Register a new user
// @access  Private/Admin
router.post("/register", auth, checkRole(["admin"]), register);

// @route   GET api/auth/me
// @desc    Get current user info
// @access  Private
router.get("/me", auth, getCurrentUser);

module.exports = router;
