// routes/blobs.js - SIMPLE NEW TAB ONLY VERSION
const express = require("express");
const router = express.Router();

const {
  getBlobs,
  getBlobSasUrl,
  viewBlob, // View-only endpoint for new tabs (no iframe support)
  uploadBlob,
  deleteBlob,
  getAuditLogs,
} = require("../controllers/blobController.js");
const auth = require("../middleware/auth.js");
const { checkRole } = require("../middleware/role-check.js");

// @route   GET api/blobs/:containerName/:folderName
// @desc    Get all blobs in a folder
// @access  Private
router.get("/:containerName/:folderName", auth, getBlobs);

// @route   GET api/blobs/:containerName/:folderName/:blobName/view
// @desc    View file content directly in new tab (no download) - SECURE WITH AUTH
// @access  Private
router.get("/:containerName/:folderName/:blobName/view", auth, viewBlob);

// @route   GET api/blobs/:containerName/:folderName/:blobName/url
// @desc    Get SAS URL for a blob (view-only)
// @access  Private
router.get("/:containerName/:folderName/:blobName/url", auth, getBlobSasUrl);

// @route   POST api/blobs/:containerName/:folderName
// @desc    Upload a blob
// @access  Private/Admin,Doctor,Nurse
router.post(
  "/:containerName/:folderName",
  auth,
  checkRole(["admin", "doctor", "nurse"]),
  uploadBlob
);

// @route   DELETE api/blobs/:containerName/:folderName/:blobName
// @desc    Delete a blob
// @access  Private/Admin
router.delete(
  "/:containerName/:folderName/:blobName",
  auth,
  checkRole(["admin"]),
  deleteBlob
);

// @route   GET api/blobs/audit
// @desc    Get audit logs for file operations
// @access  Private/Admin
router.get("/audit", auth, checkRole(["admin"]), getAuditLogs);

module.exports = router;
