// controllers/emergencyContactsController.js - Complete Emergency Contacts Controller
const { pool } = require("../config/database");
const twilioSMSService = require("../services/twilioSMSService");

// @desc    Get all emergency contacts for current patient
const getEmergencyContacts = async (req, res) => {
  try {
    await pool.connect();

    const result = await pool.request().input("patientUserId", req.user.userId)
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
      contacts: result.recordset,
      total: result.recordset.length,
    });
  } catch (error) {
    console.error("Error fetching emergency contacts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch emergency contacts",
    });
  }
};

// @desc    Add new emergency contact
const addEmergencyContact = async (req, res) => {
  try {
    const {
      contactName,
      phoneNumber,
      relationship,
      isPrimary = false,
    } = req.body;

    if (!contactName || !phoneNumber || !relationship) {
      return res.status(400).json({
        success: false,
        message: "Contact name, phone number, and relationship are required",
      });
    }

    // Validate phone number format
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid phone number",
      });
    }

    await pool.connect();

    // Check if we're at the maximum number of contacts
    const countResult = await pool
      .request()
      .input("patientUserId", req.user.userId).query(`
        SELECT COUNT(*) as contactCount
        FROM EmergencyContacts 
        WHERE patientUserId = @patientUserId AND isActive = 1
      `);

    const maxContacts = process.env.MAX_EMERGENCY_CONTACTS || 10;
    if (countResult.recordset[0].contactCount >= maxContacts) {
      return res.status(400).json({
        success: false,
        message: `Maximum of ${maxContacts} emergency contacts allowed`,
      });
    }

    // Check for duplicate phone numbers
    const duplicateCheck = await pool
      .request()
      .input("patientUserId", req.user.userId)
      .input("phoneNumber", phoneNumber).query(`
        SELECT contactId FROM EmergencyContacts 
        WHERE patientUserId = @patientUserId 
          AND phoneNumber = @phoneNumber 
          AND isActive = 1
      `);

    if (duplicateCheck.recordset.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "This phone number is already registered as an emergency contact",
      });
    }

    // If setting as primary, unset other primary contacts
    if (isPrimary) {
      await pool.request().input("patientUserId", req.user.userId).query(`
          UPDATE EmergencyContacts 
          SET isPrimary = 0 
          WHERE patientUserId = @patientUserId AND isPrimary = 1
        `);
    }

    // Add new contact
    const result = await pool
      .request()
      .input("patientUserId", req.user.userId)
      .input("contactName", contactName)
      .input("phoneNumber", phoneNumber)
      .input("relationship", relationship)
      .input("isPrimary", isPrimary ? 1 : 0).query(`
        INSERT INTO EmergencyContacts (
          patientUserId, contactName, phoneNumber, relationship, isPrimary
        )
        OUTPUT INSERTED.*
        VALUES (
          @patientUserId, @contactName, @phoneNumber, @relationship, @isPrimary
        )
      `);

    res.json({
      success: true,
      contact: result.recordset[0],
      message: "Emergency contact added successfully",
    });
  } catch (error) {
    console.error("Error adding emergency contact:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add emergency contact",
    });
  }
};

// @desc    Update emergency contact
const updateEmergencyContact = async (req, res) => {
  try {
    const { contactId } = req.params;
    const { contactName, phoneNumber, relationship, isPrimary } = req.body;

    await pool.connect();

    // Verify contact belongs to current user
    const contactCheck = await pool
      .request()
      .input("contactId", contactId)
      .input("patientUserId", req.user.userId).query(`
        SELECT * FROM EmergencyContacts 
        WHERE contactId = @contactId AND patientUserId = @patientUserId AND isActive = 1
      `);

    if (contactCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Emergency contact not found",
      });
    }

    // Check for duplicate phone numbers (excluding current contact)
    if (phoneNumber) {
      const duplicateCheck = await pool
        .request()
        .input("patientUserId", req.user.userId)
        .input("phoneNumber", phoneNumber)
        .input("contactId", contactId).query(`
          SELECT contactId FROM EmergencyContacts 
          WHERE patientUserId = @patientUserId 
            AND phoneNumber = @phoneNumber 
            AND contactId != @contactId
            AND isActive = 1
        `);

      if (duplicateCheck.recordset.length > 0) {
        return res.status(400).json({
          success: false,
          message:
            "This phone number is already registered as an emergency contact",
        });
      }
    }

    // If setting as primary, unset other primary contacts
    if (isPrimary) {
      await pool
        .request()
        .input("patientUserId", req.user.userId)
        .input("contactId", contactId).query(`
          UPDATE EmergencyContacts 
          SET isPrimary = 0 
          WHERE patientUserId = @patientUserId AND contactId != @contactId AND isPrimary = 1
        `);
    }

    // Build update query dynamically
    const updates = [];
    const request = pool
      .request()
      .input("contactId", contactId)
      .input("patientUserId", req.user.userId);

    if (contactName) {
      updates.push("contactName = @contactName");
      request.input("contactName", contactName);
    }
    if (phoneNumber) {
      updates.push("phoneNumber = @phoneNumber");
      request.input("phoneNumber", phoneNumber);
    }
    if (relationship) {
      updates.push("relationship = @relationship");
      request.input("relationship", relationship);
    }
    if (isPrimary !== undefined) {
      updates.push("isPrimary = @isPrimary");
      request.input("isPrimary", isPrimary ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    updates.push("updatedAt = GETDATE()");

    const result = await request.query(`
      UPDATE EmergencyContacts 
      SET ${updates.join(", ")}
      OUTPUT INSERTED.*
      WHERE contactId = @contactId AND patientUserId = @patientUserId
    `);

    res.json({
      success: true,
      contact: result.recordset[0],
      message: "Emergency contact updated successfully",
    });
  } catch (error) {
    console.error("Error updating emergency contact:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update emergency contact",
    });
  }
};

// @desc    Delete emergency contact
const deleteEmergencyContact = async (req, res) => {
  try {
    const { contactId } = req.params;

    await pool.connect();

    // Verify contact belongs to current user
    const contactCheck = await pool
      .request()
      .input("contactId", contactId)
      .input("patientUserId", req.user.userId).query(`
        SELECT * FROM EmergencyContacts 
        WHERE contactId = @contactId AND patientUserId = @patientUserId AND isActive = 1
      `);

    if (contactCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Emergency contact not found",
      });
    }

    // Soft delete (mark as inactive)
    await pool
      .request()
      .input("contactId", contactId)
      .input("patientUserId", req.user.userId).query(`
        UPDATE EmergencyContacts 
        SET isActive = 0, updatedAt = GETDATE()
        WHERE contactId = @contactId AND patientUserId = @patientUserId
      `);

    res.json({
      success: true,
      message: "Emergency contact deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting emergency contact:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete emergency contact",
    });
  }
};

// @desc    Send test alert to emergency contact
const testEmergencyContact = async (req, res) => {
  try {
    const { contactId } = req.params;

    await pool.connect();

    // Get contact details
    const contactResult = await pool
      .request()
      .input("contactId", contactId)
      .input("patientUserId", req.user.userId).query(`
        SELECT ec.*, u.name as patientName
        FROM EmergencyContacts ec
        INNER JOIN Users u ON ec.patientUserId = u.userId
        WHERE ec.contactId = @contactId 
          AND ec.patientUserId = @patientUserId 
          AND ec.isActive = 1
      `);

    if (contactResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Emergency contact not found",
      });
    }

    const contact = contactResult.recordset[0];

    // Send test SMS
    const testResult = await twilioSMSService.sendTestAlert(
      contact.phoneNumber
    );

    // Log the test in SMS delivery log
    if (testResult.success) {
      await pool
        .request()
        .input("phoneNumber", contact.phoneNumber)
        .input("message", "Test alert from CompassPoint Health PRMS")
        .input("twilioSid", testResult.sid)
        .input("twilioStatus", testResult.status)
        .input("contactName", contact.contactName)
        .input("relationship", contact.relationship)
        .input("patientUserId", req.user.userId).query(`
          INSERT INTO SMSDeliveryLog (
            phoneNumber, message, twilioSid, twilioStatus,
            contactName, relationship, patientUserId
          )
          VALUES (
            @phoneNumber, @message, @twilioSid, @twilioStatus,
            @contactName, @relationship, @patientUserId
          )
        `);
    }

    res.json({
      success: testResult.success,
      message: testResult.success
        ? `Test alert sent successfully to ${contact.contactName}`
        : `Failed to send test alert: ${testResult.error}`,
      contact: {
        contactName: contact.contactName,
        phoneNumber: contact.phoneNumber,
        relationship: contact.relationship,
      },
      smsResult: testResult,
    });
  } catch (error) {
    console.error("Error sending test alert:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send test alert",
    });
  }
};

// @desc    Get emergency alerts history for current patient
const getEmergencyAlertsHistory = async (req, res) => {
  try {
    const { limit = 50, offset = 0, severity, resolved } = req.query;

    await pool.connect();

    // Build WHERE clause for filters
    let whereClause = "WHERE patientUserId = @patientUserId";
    const request = pool
      .request()
      .input("patientUserId", req.user.userId)
      .input("limit", parseInt(limit))
      .input("offset", parseInt(offset));

    if (severity) {
      whereClause += " AND severity = @severity";
      request.input("severity", severity);
    }

    if (resolved !== undefined) {
      whereClause += " AND isResolved = @resolved";
      request.input("resolved", resolved === "true" ? 1 : 0);
    }

    const result = await request.query(`
        SELECT 
          alertId,
          tokenId,
          alertType,
          alertMessage,
          deviceInfo,
          deviceType,
          locationInfo,
          ipAddress,
          smsAlertsSent,
          emergencyContactsNotified,
          severity,
          createdAt,
          isResolved,
          resolvedAt,
          resolverNotes
        FROM SmartTokenEmergencyAlerts 
        ${whereClause}
        ORDER BY createdAt DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `);

    // Get total count
    const countResult = await pool
      .request()
      .input("patientUserId", req.user.userId).query(`
        SELECT COUNT(*) as total
        FROM SmartTokenEmergencyAlerts 
        WHERE patientUserId = @patientUserId
      `);

    res.json({
      success: true,
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
      filters: {
        severity,
        resolved:
          resolved === "true" ? true : resolved === "false" ? false : undefined,
      },
    });
  } catch (error) {
    console.error("Error fetching alerts history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch alerts history",
    });
  }
};

// @desc    Get emergency contact statistics for patient dashboard
const getEmergencyContactStats = async (req, res) => {
  try {
    await pool.connect();

    // Get contact counts
    const contactStats = await pool
      .request()
      .input("patientUserId", req.user.userId).query(`
        SELECT 
          COUNT(*) as totalContacts,
          SUM(CASE WHEN isPrimary = 1 THEN 1 ELSE 0 END) as primaryContacts
        FROM EmergencyContacts 
        WHERE patientUserId = @patientUserId AND isActive = 1
      `);

    // Get recent alert counts
    const alertStats = await pool
      .request()
      .input("patientUserId", req.user.userId).query(`
        SELECT 
          COUNT(*) as totalAlerts,
          SUM(CASE WHEN createdAt >= DATEADD(day, -30, GETDATE()) THEN 1 ELSE 0 END) as recentAlerts,
          SUM(CASE WHEN isResolved = 0 THEN 1 ELSE 0 END) as unresolvedAlerts,
          SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) as highSeverityAlerts
        FROM SmartTokenEmergencyAlerts 
        WHERE patientUserId = @patientUserId
      `);

    // Get SMS delivery stats
    const smsStats = await pool
      .request()
      .input("patientUserId", req.user.userId).query(`
        SELECT 
          COUNT(*) as totalSMSSent,
          SUM(CASE WHEN twilioStatus = 'delivered' THEN 1 ELSE 0 END) as deliveredSMS,
          SUM(CASE WHEN sentAt >= DATEADD(day, -30, GETDATE()) THEN 1 ELSE 0 END) as recentSMS
        FROM SMSDeliveryLog 
        WHERE patientUserId = @patientUserId
      `);

    res.json({
      success: true,
      stats: {
        contacts: contactStats.recordset[0],
        alerts: alertStats.recordset[0],
        sms: smsStats.recordset[0],
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching emergency contact stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch emergency contact statistics",
    });
  }
};

module.exports = {
  getEmergencyContacts,
  addEmergencyContact,
  updateEmergencyContact,
  deleteEmergencyContact,
  testEmergencyContact,
  getEmergencyAlertsHistory,
  getEmergencyContactStats,
};
