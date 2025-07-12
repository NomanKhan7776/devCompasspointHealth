// routes/blobs.js - ENHANCED VERSION WITH PROFILE IMAGE SUPPORT
const express = require("express");
const router = express.Router();

const {
  getBlobs,
  getBlobSasUrl,
  viewBlob,
  uploadBlob,
  deleteBlob,
  getAuditLogs,
  getProfileImage, // NEW: Profile image endpoint
} = require("../controllers/blobController.js");
const auth = require("../middleware/auth.js");
const { checkRole } = require("../middleware/role-check.js");

// @route   GET api/blobs/:containerName/:folderName
// @desc    Get all blobs in a folder (TXT files only, no RTF files shown) + Profile Image Check
// @access  Private
router.get("/:containerName/:folderName", auth, getBlobs);

// @route   GET api/blobs/:containerName/:folderName/profile-image
// @desc    Get patient profile image (for emergency access - NO AUTH REQUIRED)
// @access  Public
router.get("/:containerName/:folderName/profile-image", getProfileImage);

// @route   GET api/blobs/:containerName/:folderName/:blobName/view
// @desc    View file content directly in new tab
// @access  Private
router.get("/:containerName/:folderName/:blobName/view", auth, viewBlob);

// @route   GET api/blobs/:containerName/:folderName/:blobName/url
// @desc    Get SAS URL for a blob (view-only)
// @access  Private
router.get("/:containerName/:folderName/:blobName/url", auth, getBlobSasUrl);

// @route   POST api/blobs/:containerName/:folderName
// @desc    Upload a blob (RTF files are automatically converted to TXT and only TXT is stored)
//          Images can be processed as profile images with standardized dimensions
// @access  Private/Admin,Doctor,Nurse,Patient
router.post(
  "/:containerName/:folderName",
  auth,
  checkRole(["admin", "doctor", "nurse", "patient"]),
  uploadBlob
);

// @route   DELETE api/blobs/:containerName/:folderName/:blobName
// @desc    Delete a blob (including profile images)
// @access  Private/Admin
router.delete(
  "/:containerName/:folderName/:blobName",
  auth,
  checkRole(["admin"]),
  deleteBlob
);

// @route   GET api/blobs/audit
// @desc    Get audit logs for file operations (including profile image operations)
// @access  Private/Admin
router.get("/audit", auth, checkRole(["admin"]), getAuditLogs);

module.exports = router;
