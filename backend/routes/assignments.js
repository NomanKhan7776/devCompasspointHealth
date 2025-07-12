// routes/assignments.js - ENHANCED VERSION
const express = require("express");
const router = express.Router();
const {
  getAllContainers,
  getContainerFolders,
  assignContainerToUser,
  assignFoldersToUser,
  getUserAssignments,
  revokeAssignment,
  getMyAssignments,
  checkUserAccess, // ✅ NEW: Import the new function
} = require("../controllers/assignmentController");
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/role-check");

// =============================================================================
// CONTAINER MANAGEMENT ROUTES
// =============================================================================

// @route   GET api/assignments/containers
// @desc    Get all containers from Azure Storage
// @access  Private/Admin
router.get("/containers", auth, checkRole(["admin"]), getAllContainers);

// @route   GET api/assignments/containers/:containerName/folders
// @desc    Get all folders in a specific container
// @access  Private/Admin
router.get(
  "/containers/:containerName/folders",
  auth,
  checkRole(["admin"]),
  getContainerFolders
);

// =============================================================================
// ASSIGNMENT MANAGEMENT ROUTES
// =============================================================================

// @route   POST api/assignments/containers/:containerName/users/:userId
// @desc    Assign container to user
// @access  Private/Admin
router.post(
  "/containers/:containerName/users/:userId",
  auth,
  checkRole(["admin"]),
  assignContainerToUser
);

// @route   POST api/assignments/containers/:containerName/folders
// @desc    Assign folders to user within a container
// @access  Private/Admin
router.post(
  "/containers/:containerName/folders",
  auth,
  checkRole(["admin"]),
  assignFoldersToUser
);

// @route   DELETE api/assignments/:assignmentId
// @desc    Revoke assignment (container or folder)
// @access  Private/Admin
router.delete("/:assignmentId", auth, checkRole(["admin"]), revokeAssignment);

// =============================================================================
// USER ASSIGNMENT QUERY ROUTES
// =============================================================================

// @route   GET api/assignments/users/:userId
// @desc    Get user assignments (Enhanced for SmartToken UI)
// @access  Private/Admin
router.get("/users/:userId", auth, checkRole(["admin"]), getUserAssignments);

// @route   GET api/assignments/my-assignments
// @desc    Get current user's assignments
// @access  Private (Patient/Doctor/Admin)
router.get("/my-assignments", auth, getMyAssignments);

// ✅ NEW: Enhanced route for SmartToken assignment validation
// @route   GET api/assignments/check-access/:userId/:containerName/:folderName
// @desc    Check if user has access to specific container/folder combination
// @access  Private/Admin
// @purpose Used by SmartToken assignment UI to validate patient access
router.get(
  "/check-access/:userId/:containerName/:folderName",
  auth,
  checkRole(["admin"]),
  checkUserAccess
);

// =============================================================================
// LEGACY COMPATIBILITY ROUTES (if needed)
// =============================================================================

// Note: Add any legacy route aliases here if needed for backward compatibility
// Example:
// router.get("/user/:userId", auth, checkRole(["admin"]), getUserAssignments);

module.exports = router;
