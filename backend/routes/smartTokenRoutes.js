// Enhanced smartTokenRoutes.js - Add these routes to existing file

const express = require("express");
const router = express.Router();
const {
  verifySmartToken,
  getPatientFileViewOnly, // Emergency access (no auth needed)
  getUnclaimedTokens,
  assignTokenToPatient,
  getAllAssignedTokens,
  revokeSmartToken,
  reactivateSmartToken,
  deleteSmartToken, // NEW: Delete token function
  getAssignedFolders, // NEW: Get assigned folders function
  getSmartTokenLogs,
} = require("../controllers/smartTokenController");

// Middleware
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/role-check");

// PUBLIC ROUTES (no authentication required)
// Emergency access for SmartTokens

// Main SmartToken verification route
router.get("/verify/:id", verifySmartToken);

// FIXED: Emergency file access routes (no authentication required)
router.get(
  "/file/:containerName/:folderName/:fileName/view",
  getPatientFileViewOnly
);

// Legacy file route (kept for backward compatibility)
router.get(
  "/file/:containerName/:folderName/:fileName",
  getPatientFileViewOnly
);

// AUTHENTICATED ROUTES (auth middleware required)
// Admin routes
router.get("/admin/unclaimed", auth, checkRole(["admin"]), getUnclaimedTokens);
router.get("/admin/assigned", auth, checkRole(["admin"]), getAllAssignedTokens);
router.post("/admin/assign", auth, checkRole(["admin"]), assignTokenToPatient);
router.get("/admin/logs", auth, checkRole(["admin"]), getSmartTokenLogs);
// NEW: Get assigned folders for a container (to show in UI)
router.get(
  "/admin/assigned-folders/:containerName",
  auth,
  checkRole(["admin"]),
  getAssignedFolders
);

// Remote disconnect routes
router.post("/admin/revoke", auth, checkRole(["admin"]), revokeSmartToken);
router.post(
  "/admin/reactivate",
  auth,
  checkRole(["admin"]),
  reactivateSmartToken
);

// NEW: Delete token permanently (for lost tokens)
router.delete(
  "/admin/delete/:tokenId",
  auth,
  checkRole(["admin"]),
  deleteSmartToken
);

module.exports = router;
