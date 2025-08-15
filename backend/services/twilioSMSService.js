// services/twilioSMSService.js - Enhanced Twilio SMS Service for Emergency Alerts
const twilio = require("twilio");

class TwilioSMSService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      console.error(
        "⚠️ Twilio configuration missing - SMS alerts will not work"
      );
      this.client = null;
    } else {
      this.client = twilio(this.accountSid, this.authToken);
      console.log("✅ Twilio SMS Service initialized");
    }
  }

  /**
   * Send emergency alert SMS to emergency contact - ENHANCED with trial account handling
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} message - Alert message
   * @param {string} contactName - Name of the contact (for logging)
   * @returns {Object} Result object with success status and details
   */
  async sendEmergencyAlert(phoneNumber, message, contactName = "") {
    if (!this.client) {
      console.error("Twilio client not initialized - cannot send SMS");
      return {
        success: false,
        error: "SMS service not configured",
        errorCode: "SERVICE_UNAVAILABLE",
      };
    }

    try {
      // Clean phone number (remove formatting)
      const cleanPhoneNumber = this.formatPhoneNumber(phoneNumber);

      if (!this.isValidPhoneNumber(cleanPhoneNumber)) {
        return {
          success: false,
          error: "Invalid phone number format",
          errorCode: "INVALID_PHONE",
        };
      }

      // Check if trial account and truncate message if needed
      const isTrial = await this.isTrialAccount();
      let finalMessage = message;

      if (isTrial && message.length > 140) {
        // Truncate to fit in single segment for trial
        finalMessage = message.substring(0, 140) + "...";
        console.log(
          `⚠️ Trial account: Message truncated to ${finalMessage.length} chars`
        );
      }

      // Send SMS via Twilio
      const messageResult = await this.client.messages.create({
        body: finalMessage,
        from: this.fromNumber,
        to: cleanPhoneNumber,
        // Optional: Add status callback URL for delivery tracking
        statusCallback: process.env.TWILIO_STATUS_CALLBACK_URL || undefined,
      });

      console.log(
        `📱 Emergency SMS sent to ${contactName || phoneNumber}: ${
          messageResult.sid
        }`
      );

      return {
        success: true,
        sid: messageResult.sid,
        status: messageResult.status,
        phoneNumber: cleanPhoneNumber,
        contactName: contactName,
        sentAt: new Date().toISOString(),
        isTrialAccount: isTrial,
      };
    } catch (error) {
      console.error(
        `❌ Failed to send SMS to ${contactName || phoneNumber}:`,
        error
      );

      // ✅ Enhanced error handling for specific Twilio errors
      let errorCode = error.code || "TWILIO_ERROR";
      let errorMessage = error.message;
      let isTrialUnverified = false;
      let verificationUrl = null;

      if (error.code === 21608) {
        errorCode = "UNVERIFIED_NUMBER_TRIAL";
        isTrialUnverified = true;
        verificationUrl =
          "https://console.twilio.com/us1/develop/phone-numbers/manage/verified";
        errorMessage = `Phone number is not verified. Trial accounts can only send to verified numbers. Verify at: ${verificationUrl}`;

        console.warn(
          `⚠️ TRIAL ACCOUNT LIMITATION: Cannot send to unverified number ${cleanPhoneNumber}`
        );
      }

      return {
        success: false,
        error: errorMessage,
        errorCode: errorCode,
        phoneNumber: phoneNumber,
        contactName: contactName,
        isTrialUnverified: isTrialUnverified,
        verificationUrl: verificationUrl,
        twilioErrorCode: error.code,
        isTrialAccount: await this.isTrialAccount().catch(() => true), // Default to trial on error
      };
    }
  }

  /**
   * Check if Twilio account is trial
   * @returns {boolean} True if trial account
   */
  async isTrialAccount() {
    if (!this.client) return false;

    try {
      const account = await this.client.api.accounts(this.accountSid).fetch();
      return account.type === "Trial";
    } catch (error) {
      console.error("Error checking account type:", error);
      return true; // Assume trial if we can't check
    }
  }

  /**
   * Send test alert with appropriate message length
   */
  async sendTestAlert(phoneNumber) {
    const isTrial = await this.isTrialAccount();

    const testMessage = isTrial
      ? `🩺 TEST: CompassPoint Health emergency test. Contact info works if received.`
      : `🩺 TEST ALERT from CompassPoint Health PRMS: This is a test of your emergency contact notification. If you received this message, your contact information is working correctly. No action is required.`;

    return await this.sendEmergencyAlert(
      phoneNumber,
      testMessage,
      "Test Contact"
    );
  }

  /**
   * Send batch SMS alerts to multiple contacts - ENHANCED with trial account handling
   * @param {Array} contacts - Array of contact objects with phoneNumber and name
   * @param {string} message - Alert message
   * @returns {Object} Results with success/failure counts and details
   */
  async sendBatchEmergencyAlerts(contacts, message) {
    const results = {
      total: contacts.length,
      successful: 0,
      failed: 0,
      trialUnverified: 0, // ✅ NEW: Track unverified numbers
      details: [],
    };

    const isTrial = await this.isTrialAccount();

    if (isTrial) {
      console.log(
        `⚠️ Trial account detected - checking number verification for ${contacts.length} contacts`
      );
    }

    // Send SMS to all contacts (with slight delay to avoid rate limits)
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];

      try {
        const result = await this.sendEmergencyAlert(
          contact.phoneNumber,
          message,
          contact.contactName || contact.name
        );

        results.details.push({
          contact: contact,
          result: result,
        });

        if (result.success) {
          results.successful++;
        } else {
          results.failed++;

          // ✅ Track trial unverified numbers separately
          if (result.errorCode === "UNVERIFIED_NUMBER_TRIAL") {
            results.trialUnverified++;
          }
        }

        // Add small delay between messages to avoid rate limits
        if (i < contacts.length - 1) {
          await this.delay(500); // 500ms delay between messages
        }
      } catch (error) {
        results.failed++;
        results.details.push({
          contact: contact,
          result: {
            success: false,
            error: error.message,
            errorCode: "BATCH_ERROR",
          },
        });
      }
    }

    console.log(
      `📊 Batch SMS complete: ${results.successful}/${results.total} successful` +
        (results.trialUnverified > 0
          ? `, ${results.trialUnverified} unverified (trial)`
          : "")
    );

    return results;
  }

  /**
   * Get SMS delivery status from Twilio
   * @param {string} messageSid - Twilio message SID
   * @returns {Object} Message status details
   */
  async getMessageStatus(messageSid) {
    if (!this.client) {
      return { error: "SMS service not configured" };
    }

    try {
      const message = await this.client.messages(messageSid).fetch();

      return {
        success: true,
        sid: message.sid,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        dateCreated: message.dateCreated,
        dateSent: message.dateSent,
        price: message.price,
        priceUnit: message.priceUnit,
      };
    } catch (error) {
      console.error(`Error fetching message status for ${messageSid}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Format phone number for Twilio (E.164 format)
   * @param {string} phoneNumber - Raw phone number
   * @returns {string} Formatted phone number
   */
  formatPhoneNumber(phoneNumber) {
    // Handle object input (fix for object being passed)
    if (typeof phoneNumber === "object" && phoneNumber.phoneNumber) {
      phoneNumber = phoneNumber.phoneNumber;
    }

    // Ensure it's a string
    if (typeof phoneNumber !== "string") {
      phoneNumber = String(phoneNumber);
    }

    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, "");

    // Add country code if not present (assume US/Canada +1)
    if (cleaned.length === 10) {
      cleaned = "1" + cleaned;
    }

    // Add + prefix for E.164 format
    if (!cleaned.startsWith("+")) {
      cleaned = "+" + cleaned;
    }

    return cleaned;
  }

  /**
   * Validate phone number format
   * @param {string} phoneNumber - Phone number to validate
   * @returns {boolean} True if valid
   */
  isValidPhoneNumber(phoneNumber) {
    // Basic E.164 validation (starts with +, followed by 10-15 digits)
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phoneNumber);
  }

  /**
   * Create location-aware emergency message
   * @param {string} patientName - Patient name
   * @param {Object} deviceInfo - Device information
   * @param {Object} locationData - Location data (GPS or IP-based)
   * @returns {string} Formatted emergency message
   */
  async createEmergencyMessage(
    patientName,
    deviceInfo,
    locationData,
    alertType = "unregistered_device"
  ) {
    const isTrial = await this.isTrialAccount();

    if (isTrial) {
      // Short message for trial accounts (under 160 characters)
      const city = locationData?.city || "unknown location";

      if (alertType === "timer_based_emergency_alert") {
        return `🆘 EMERGENCY: ${patientName}'s SmartToken accessed from ${city}. Emergency access timer expired. Contact if unauthorized.`;
      } else {
        return `🚨 ALERT: ${patientName}'s SmartToken accessed from ${city} by unregistered device. Contact medical staff if unauthorized.`;
      }
    }

    // Full message for paid accounts
    const deviceDesc =
      deviceInfo.type === "mobile" ? "mobile device" : "device";
    const browserInfo = deviceInfo.browser ? ` (${deviceInfo.browser})` : "";

    let locationStr = "";
    if (locationData.type === "gps" && locationData.address) {
      locationStr = `at GPS location ${locationData.address} (${locationData.latitude}, ${locationData.longitude})`;
    } else if (locationData.type === "gps") {
      locationStr = `at GPS coordinates ${locationData.latitude}, ${locationData.longitude}`;
    } else if (locationData.type === "ip" && locationData.city !== "Unknown") {
      locationStr = `in the ${locationData.city}, ${locationData.region} area (determined from internet connection)`;
    } else {
      locationStr = "from an unknown location";
    }

    if (alertType === "timer_based_emergency_alert") {
      return `🆘 EMERGENCY ACCESS: Someone ${locationStr} accessed ${patientName}'s medical SmartToken. Emergency access timer expired without cancellation${browserInfo}. If this was not authorized, please contact medical staff immediately. CompassPoint Health PRMS`;
    } else {
      return `🚨 SECURITY ALERT: Someone ${locationStr} just accessed ${patientName}'s medical SmartToken with an unregistered ${deviceDesc}${browserInfo}. If this was not authorized, please contact medical staff immediately. CompassPoint Health PRMS`;
    }
  }

  /**
   * Utility function to add delay
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after delay
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if Twilio service is configured and available
   * @returns {boolean} True if service is available
   */
  isServiceAvailable() {
    return this.client !== null;
  }

  /**
   * Get service status and configuration info - ENHANCED with trial account info
   * @returns {Object} Service status information
   */
  getServiceStatus() {
    return {
      available: this.isServiceAvailable(),
      fromNumber: this.fromNumber
        ? this.fromNumber.substring(0, 6) + "***"
        : "Not configured",
      configured: !!(this.accountSid && this.authToken && this.fromNumber),
      verificationRequired: "Trial accounts can only send to verified numbers",
    };
  }

  /**
   * Create trial-safe emergency message
   * @param {string} patientName - Patient name
   * @param {Object} deviceInfo - Device information with ipLocation
   * @returns {string} Short emergency message for trial accounts
   */
  async createTrialEmergencyMessage(
    patientName,
    deviceInfo,
    alertType = "unregistered_device"
  ) {
    const location = deviceInfo.ipLocation?.city
      ? `${deviceInfo.ipLocation.city}, ${deviceInfo.ipLocation.country}`
      : "unknown location";

    // Keep under 160 characters for single segment
    if (alertType === "timer_based_emergency_alert") {
      return `🆘 ${patientName}'s SmartToken emergency access from ${location}. Timer expired. Contact if unauthorized.`;
    } else {
      return `🚨 ${patientName}'s SmartToken accessed from ${location}. Contact medical staff if unauthorized.`;
    }
  }

  /**
   * ✅ NEW: Get verification instructions for trial accounts
   */
  getTrialVerificationInstructions() {
    return {
      message:
        "To send SMS to this number, you need to verify it first (trial account limitation)",
      steps: [
        "1. Go to https://console.twilio.com/us1/develop/phone-numbers/manage/verified",
        "2. Click 'Add a new number'",
        "3. Enter the phone number you want to verify",
        "4. Choose verification method (SMS or Voice call)",
        "5. Enter the verification code you receive",
        "6. The number will then be able to receive SMS from your trial account",
      ],
      upgradeOption:
        "Or upgrade to a paid Twilio account to send to any number",
      verificationUrl:
        "https://console.twilio.com/us1/develop/phone-numbers/manage/verified",
      upgradeUrl: "https://console.twilio.com/billing",
    };
  }

  /**
   * ✅ NEW: Check if phone number is verified (for trial accounts)
   * Note: Twilio API doesn't provide direct verification check, so this simulates the check
   */
  async isPhoneNumberVerified(phoneNumber) {
    if (!this.client) {
      return { verified: false, error: "Service not available" };
    }

    try {
      const cleanNumber = this.formatPhoneNumber(phoneNumber);

      // For trial accounts, we can't actually check verification status via API
      // This is more of a simulation - in reality, you'd need to attempt sending to verify

      return {
        verified: false, // Always return false since we can't check
        phoneNumber: cleanNumber,
        note: "Verification status cannot be checked via API - attempt sending to verify",
      };
    } catch (error) {
      console.error("Error checking phone verification:", error);
      return { verified: false, error: error.message };
    }
  }

  /**
   * ✅ NEW: Get trial account limitations summary
   */
  async getTrialAccountLimitations() {
    const isTrial = await this.isTrialAccount();

    if (!isTrial) {
      return {
        isTrialAccount: false,
        limitations: null,
        message: "No limitations - paid account",
      };
    }

    return {
      isTrialAccount: true,
      limitations: {
        unverifiedNumbers: "Cannot send SMS to unverified phone numbers",
        messageLength: "Messages may be truncated to 140 characters",
        rateLimits: "Lower rate limits may apply",
        geographicRestrictions: "May have geographic sending restrictions",
      },
      solutions: {
        verifyNumbers: "Verify emergency contact numbers at Twilio Console",
        upgrade: "Upgrade to paid account to remove all restrictions",
      },
      verificationInstructions: this.getTrialVerificationInstructions(),
    };
  }

  /**
   * ✅ NEW: Test emergency contact with detailed feedback
   */
  async testEmergencyContactWithFeedback(phoneNumber, contactName = "") {
    console.log(`📱 Testing emergency contact: ${contactName || phoneNumber}`);

    const isTrial = await this.isTrialAccount();
    const testResult = await this.sendTestAlert(phoneNumber);

    return {
      ...testResult,
      testType: "emergency_contact_test",
      contactName: contactName,
      isTrialAccount: isTrial,
      recommendations: testResult.success
        ? ["Contact is working correctly"]
        : testResult.errorCode === "UNVERIFIED_NUMBER_TRIAL"
        ? [
            "Verify this number in Twilio Console",
            "Or upgrade to paid Twilio account",
            "Emergency alerts will fail until number is verified",
          ]
        : ["Check phone number format and try again"],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * ✅ NEW: Batch test multiple emergency contacts
   */
  async testAllEmergencyContacts(contacts) {
    console.log(`📱 Testing ${contacts.length} emergency contacts...`);

    const results = {
      total: contacts.length,
      successful: 0,
      failed: 0,
      unverified: 0,
      details: [],
    };

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];

      try {
        const testResult = await this.testEmergencyContactWithFeedback(
          contact.phoneNumber,
          contact.contactName || contact.name
        );

        results.details.push({
          contact: contact,
          testResult: testResult,
        });

        if (testResult.success) {
          results.successful++;
        } else {
          results.failed++;
          if (testResult.errorCode === "UNVERIFIED_NUMBER_TRIAL") {
            results.unverified++;
          }
        }

        // Add delay between tests
        if (i < contacts.length - 1) {
          await this.delay(1000); // 1 second delay for tests
        }
      } catch (error) {
        results.failed++;
        results.details.push({
          contact: contact,
          testResult: {
            success: false,
            error: error.message,
            errorCode: "TEST_ERROR",
          },
        });
      }
    }

    console.log(
      `📊 Emergency contact testing complete: ${results.successful}/${results.total} working` +
        (results.unverified > 0
          ? `, ${results.unverified} need verification`
          : "")
    );

    return {
      ...results,
      summary: {
        workingContacts: results.successful,
        failedContacts: results.failed,
        unverifiedContacts: results.unverified,
        needsAttention: results.failed > 0,
        trialAccountIssues: results.unverified > 0,
      },
      recommendations: this.getContactTestRecommendations(results),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * ✅ NEW: Get recommendations based on contact test results
   */
  getContactTestRecommendations(testResults) {
    const recommendations = [];

    if (testResults.successful === testResults.total) {
      recommendations.push("✅ All emergency contacts are working correctly");
    } else {
      if (testResults.unverified > 0) {
        recommendations.push(
          `⚠️ ${testResults.unverified} contacts need verification in Twilio Console`,
          "🔗 Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/verified"
        );
      }

      if (testResults.failed > testResults.unverified) {
        recommendations.push(
          `❌ ${
            testResults.failed - testResults.unverified
          } contacts have other issues`,
          "📞 Check phone number formats and network connectivity"
        );
      }

      recommendations.push(
        "💡 Consider upgrading to paid Twilio account to avoid verification requirements"
      );
    }

    return recommendations;
  }
}

// Create singleton instance
const twilioSMSService = new TwilioSMSService();

module.exports = twilioSMSService;
