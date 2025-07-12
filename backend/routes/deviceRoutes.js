// routes/deviceRoutes.js - Updated with proper organization and Android compatibility
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const deviceController = require("../controllers/deviceManagementController");

// ✅ PUBLIC ROUTES (No authentication required)

// @route   GET api/devices/qr-status/:qrToken
// @desc    Check QR code status (public endpoint for family registration)
// @access  Public
router.get("/qr-status/:qrToken", deviceController.checkQRStatus);

// @route   POST api/devices/register-via-qr/:qrToken
// @desc    Register device using QR code (public endpoint for family registration)
// @access  Public
router.post("/register-via-qr/:qrToken", deviceController.registerDeviceViaQR);

// ✅ PRIVATE ROUTES (Authentication required)

// @route   POST api/devices/register
// @desc    Register a new device for current user
// @access  Private
router.post("/register", auth, deviceController.registerDevice);

// @route   GET api/devices/my-devices
// @desc    Get all registered devices for current user
// @access  Private
router.get("/my-devices", auth, deviceController.getMyDevices);

// @route   POST api/devices/verify
// @desc    Verify if current device is authorized
// @access  Private
router.post("/verify", auth, deviceController.verifyDevice);

// @route   POST api/devices/generate-qr
// @desc    Generate QR code for family device registration
// @access  Private (Patient only)
router.post(
  "/generate-qr",
  auth,
  deviceController.generateQRForFamilyRegistration
);

// @route   DELETE api/devices/:fingerprintId
// @desc    Remove/deactivate a device
// @access  Private
router.delete("/:fingerprintId", auth, deviceController.removeDevice);

// ✅ OPTIONAL: Debug route for development (remove in production)
if (process.env.NODE_ENV === "development") {
  // @route   GET api/devices/debug/fingerprint-test
  // @desc    Test fingerprinting service availability
  // @access  Public (development only)
  router.get("/debug/fingerprint-test", (req, res) => {
    res.json({
      success: true,
      message: "Device fingerprinting service endpoint test",
      timestamp: new Date().toISOString(),
      userAgent: req.headers["user-agent"],
      isAndroid: /Android/i.test(req.headers["user-agent"]),
      isMobile:
        /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(
          req.headers["user-agent"]
        ),
    });
  });
}

module.exports = router;
