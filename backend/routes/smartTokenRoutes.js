// routes/smartTokenRoutes.js - SECURE version with proper route separation

const express = require("express");
const router = express.Router();
const {
  verifySmartToken,
  getPatientFile,
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
router.get("/verify/:id", verifySmartToken);
router.get(
  "/file/:containerName/:folderName/:fileName/view",
  getPatientFileViewOnly
);

// Legacy file route (kept for backward compatibility)
router.get("/file/:containerName/:folderName/:fileName", getPatientFile);

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
