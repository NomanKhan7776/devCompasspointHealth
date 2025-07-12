// routes/patientRequests.js
const express = require("express");
const router = express.Router();
const {
  createPatientRequest,
  getPatientRequests,
  getPatientRequest,
  approvePatientRequest,
  rejectPatientRequest,
  getAvailableFolders,
} = require("../controllers/patientRequestController");
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/role-check");

// @route   POST api/patient-requests
// @desc    Create a new patient request
// @access  Private/Doctor
router.post("/", auth, checkRole(["doctor"]), createPatientRequest);

// @route   GET api/patient-requests
// @desc    Get all patient requests (admin) or doctor's requests (doctor)
// @access  Private/Admin,Doctor
router.get("/", auth, checkRole(["admin", "doctor"]), getPatientRequests);

// @route   GET api/patient-requests/:requestId
// @desc    Get a specific patient request
// @access  Private/Admin,Doctor(own)
router.get(
  "/:requestId",
  auth,
  checkRole(["admin", "doctor"]),
  getPatientRequest
);

// @route   PUT api/patient-requests/:requestId/approve
// @desc    Approve a patient request and create patient account
// @access  Private/Admin
router.put(
  "/:requestId/approve",
  auth,
  checkRole(["admin"]),
  approvePatientRequest
);

// @route   PUT api/patient-requests/:requestId/reject
// @desc    Reject a patient request
// @access  Private/Admin
router.put(
  "/:requestId/reject",
  auth,
  checkRole(["admin"]),
  rejectPatientRequest
);

// @route   GET api/patient-requests/available-folders/:containerName
// @desc    Get available folders for a container
// @access  Private/Doctor
router.get(
  "/available-folders/:containerName",
  auth,
  checkRole(["doctor"]),
  getAvailableFolders
);

module.exports = router;
