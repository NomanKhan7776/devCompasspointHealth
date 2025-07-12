// routes/emergencyContactsRoutes.js - Emergency Contact Management Routes
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/role-check");
const emergencyContactsController = require("../controllers/emergencyContactsController");

// ============================================================================
// PATIENT EMERGENCY CONTACT ROUTES (Patient access only)
// ============================================================================

// @route   GET /api/emergency-contacts
// @desc    Get all emergency contacts for current patient
// @access  Private (Patient only)
router.get(
  "/",
  auth,
  checkRole(["patient"]),
  emergencyContactsController.getEmergencyContacts
);

// @route   POST /api/emergency-contacts
// @desc    Add new emergency contact
// @access  Private (Patient only)
router.post(
  "/",
  auth,
  checkRole(["patient"]),
  emergencyContactsController.addEmergencyContact
);

// @route   PUT /api/emergency-contacts/:contactId
// @desc    Update emergency contact
// @access  Private (Patient only)
router.put(
  "/:contactId",
  auth,
  checkRole(["patient"]),
  emergencyContactsController.updateEmergencyContact
);

// @route   DELETE /api/emergency-contacts/:contactId
// @desc    Delete emergency contact
// @access  Private (Patient only)
router.delete(
  "/:contactId",
  auth,
  checkRole(["patient"]),
  emergencyContactsController.deleteEmergencyContact
);

// @route   POST /api/emergency-contacts/:contactId/test
// @desc    Send test alert to emergency contact
// @access  Private (Patient only)
router.post(
  "/:contactId/test",
  auth,
  checkRole(["patient"]),
  emergencyContactsController.testEmergencyContact
);

// ============================================================================
// PATIENT EMERGENCY ALERTS ROUTES
// ============================================================================

// @route   GET /api/emergency-contacts/alerts/history
// @desc    Get emergency alerts history for current patient
// @access  Private (Patient only)
router.get(
  "/alerts/history",
  auth,
  checkRole(["patient"]),
  emergencyContactsController.getEmergencyAlertsHistory
);

// @route   POST /api/emergency-contacts/alerts/:alertId/resolve
// @desc    Mark an emergency alert as resolved
// @access  Private (Patient only)
router.post(
  "/alerts/:alertId/resolve",
  auth,
  checkRole(["patient"]),
  async (req, res) => {
    try {
      const { alertId } = req.params;
      const { notes } = req.body;

      await pool.connect();

      // Verify alert belongs to current patient
      const alertCheck = await pool
        .request()
        .input("alertId", alertId)
        .input("patientUserId", req.user.userId).query(`
          SELECT * FROM SmartTokenEmergencyAlerts 
          WHERE alertId = @alertId AND patientUserId = @patientUserId
        `);

      if (alertCheck.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Alert not found",
        });
      }

      // Mark as resolved
      await pool
        .request()
        .input("alertId", alertId)
        .input("resolvedBy", req.user.userId)
        .input("resolverNotes", notes || "Resolved by patient").query(`
          UPDATE SmartTokenEmergencyAlerts
          SET isResolved = 1,
              resolvedAt = GETDATE(),
              resolvedBy = @resolvedBy,
              resolverNotes = @resolverNotes,
              updatedAt = GETDATE()
          WHERE alertId = @alertId
        `);

      res.json({
        success: true,
        message: "Alert marked as resolved",
      });
    } catch (error) {
      console.error("Error resolving alert:", error);
      res.status(500).json({
        success: false,
        message: "Failed to resolve alert",
      });
    }
  }
);

// ============================================================================
// ADMIN/DOCTOR EMERGENCY CONTACT ROUTES (View only)
// ============================================================================

// @route   GET /api/emergency-contacts/patient/:patientId
// @desc    Get emergency contacts for specific patient (Admin/Doctor only)
// @access  Private (Admin/Doctor only)
router.get(
  "/patient/:patientId",
  auth,
  checkRole(["admin", "doctor"]),
  async (req, res) => {
    try {
      const { patientId } = req.params;

      await pool.connect();

      // Verify patient exists and user has access
      const patientCheck = await pool.request().input("patientId", patientId)
        .query(`
          SELECT userId, name FROM Users 
          WHERE userId = @patientId AND role = 'patient'
        `);

      if (patientCheck.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Patient not found",
        });
      }

      // Get emergency contacts
      const result = await pool.request().input("patientUserId", patientId)
        .query(`
          SELECT 
            contactId,
            contactName,
            phoneNumber,
            relationship,
            isPrimary,
            isActive,
            createdAt,
            updatedAt
          FROM EmergencyContacts 
          WHERE patientUserId = @patientUserId 
            AND isActive = 1
          ORDER BY isPrimary DESC, contactName ASC
        `);

      res.json({
        success: true,
        patient: patientCheck.recordset[0],
        contacts: result.recordset,
        total: result.recordset.length,
      });
    } catch (error) {
      console.error("Error fetching patient emergency contacts:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch emergency contacts",
      });
    }
  }
);

// @route   GET /api/emergency-contacts/alerts/patient/:patientId
// @desc    Get emergency alerts for specific patient (Admin/Doctor only)
// @access  Private (Admin/Doctor only)
router.get(
  "/alerts/patient/:patientId",
  auth,
  checkRole(["admin", "doctor"]),
  async (req, res) => {
    try {
      const { patientId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      await pool.connect();

      // Verify patient exists
      const patientCheck = await pool.request().input("patientId", patientId)
        .query(`
          SELECT userId, name FROM Users 
          WHERE userId = @patientId AND role = 'patient'
        `);

      if (patientCheck.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Patient not found",
        });
      }

      // Get alerts
      const result = await pool
        .request()
        .input("patientUserId", patientId)
        .input("limit", parseInt(limit))
        .input("offset", parseInt(offset)).query(`
          SELECT 
            alertId,
            tokenId,
            alertType,
            deviceInfo,
            locationInfo,
            ipAddress,
            smsAlertsSent,
            emergencyContactsNotified,
            createdAt,
            isResolved,
            resolvedAt,
            severity
          FROM SmartTokenEmergencyAlerts 
          WHERE patientUserId = @patientUserId
          ORDER BY createdAt DESC
          OFFSET @offset ROWS
          FETCH NEXT @limit ROWS ONLY
        `);

      // Get total count
      const countResult = await pool.request().input("patientUserId", patientId)
        .query(`
          SELECT COUNT(*) as total
          FROM SmartTokenEmergencyAlerts 
          WHERE patientUserId = @patientUserId
        `);

      res.json({
        success: true,
        patient: patientCheck.recordset[0],
        alerts: result.recordset.map((alert) => ({
          ...alert,
          locationInfo: alert.locationInfo
            ? JSON.parse(alert.locationInfo)
            : null,
          emergencyContactsNotified: alert.emergencyContactsNotified
            ? JSON.parse(alert.emergencyContactsNotified)
            : [],
        })),
        total: countResult.recordset[0].total,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore:
            parseInt(offset) + parseInt(limit) < countResult.recordset[0].total,
        },
      });
    } catch (error) {
      console.error("Error fetching patient alerts:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch patient alerts",
      });
    }
  }
);

module.exports = router;
