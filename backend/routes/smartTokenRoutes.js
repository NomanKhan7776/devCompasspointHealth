// routes/smartTokenRoutes.js - Production version (cleaned)

const express = require("express");
const router = express.Router();
const {
  verifySmartToken,
  getPatientFile,
  getUnclaimedTokens,
  assignTokenToPatient,
  // getAvailablePatientFolders - REMOVED: No longer needed since SmartToken uses assignmentsAPI
} = require("../controllers/smartTokenController");

// Middleware
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/role-check");

// Public routes (no authentication required)
router.get("/verify/:id", verifySmartToken);
router.get("/file/:containerName/:folderName/:fileName", getPatientFile);

// Admin routes (authentication required)
router.get("/admin/unclaimed", auth, checkRole(["admin"]), getUnclaimedTokens);
router.post("/admin/assign", auth, checkRole(["admin"]), assignTokenToPatient);

// NOTE: /admin/folders endpoint removed - SmartToken management now uses assignmentsAPI

module.exports = router;
