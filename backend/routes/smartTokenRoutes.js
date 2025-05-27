// routes/smartTokenRoutes.js - Production version with remote disconnect

const express = require("express");
const router = express.Router();
const {
  verifySmartToken,
  getPatientFile,
  getUnclaimedTokens,
  assignTokenToPatient,
  getAllAssignedTokens,
  revokeSmartToken,
  reactivateSmartToken,
} = require("../controllers/smartTokenController");

// Middleware
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/role-check");

// Public routes (no authentication required)
router.get("/verify/:id", verifySmartToken);
router.get("/file/:containerName/:folderName/:fileName", getPatientFile);

// Admin routes (authentication required)
router.get("/admin/unclaimed", auth, checkRole(["admin"]), getUnclaimedTokens);
router.get("/admin/assigned", auth, checkRole(["admin"]), getAllAssignedTokens);
router.post("/admin/assign", auth, checkRole(["admin"]), assignTokenToPatient);

// NEW: Remote disconnect routes
router.post("/admin/revoke", auth, checkRole(["admin"]), revokeSmartToken);
router.post(
  "/admin/reactivate",
  auth,
  checkRole(["admin"]),
  reactivateSmartToken
);

module.exports = router;
