// routes/smartTokenRoutes.js - FIXED VERSION with working file routes

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

// Remote disconnect routes
router.post("/admin/revoke", auth, checkRole(["admin"]), revokeSmartToken);
router.post(
  "/admin/reactivate",
  auth,
  checkRole(["admin"]),
  reactivateSmartToken
);

module.exports = router;
