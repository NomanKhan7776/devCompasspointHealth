// src/api/emergencyContactsAPI.js - Emergency Contacts API Integration
import apiClient from "./apiClient";

const emergencyContactsAPI = {
  // ============================================================================
  // EMERGENCY CONTACTS MANAGEMENT
  // ============================================================================

  /**
   * Get all emergency contacts for current patient
   * @returns {Promise} API response with contacts list
   */
  getEmergencyContacts: () => {
    return apiClient.get("/api/emergency-contacts");
  },

  /**
   * Add new emergency contact
   * @param {Object} contactData - Contact information
   * @param {string} contactData.contactName - Contact's name
   * @param {string} contactData.phoneNumber - Contact's phone number
   * @param {string} contactData.relationship - Relationship to patient
   * @param {boolean} contactData.isPrimary - Whether this is primary contact
   * @returns {Promise} API response with created contact
   */
  addEmergencyContact: (contactData) => {
    return apiClient.post("/api/emergency-contacts", contactData);
  },

  /**
   * Update existing emergency contact
   * @param {number} contactId - Contact ID to update
   * @param {Object} contactData - Updated contact information
   * @returns {Promise} API response with updated contact
   */
  updateEmergencyContact: (contactId, contactData) => {
    return apiClient.put(`/api/emergency-contacts/${contactId}`, contactData);
  },

  /**
   * Delete emergency contact
   * @param {number} contactId - Contact ID to delete
   * @returns {Promise} API response
   */
  deleteEmergencyContact: (contactId) => {
    return apiClient.delete(`/api/emergency-contacts/${contactId}`);
  },

  /**
   * Send test alert to emergency contact
   * @param {number} contactId - Contact ID to test
   * @returns {Promise} API response with test result
   */
  testEmergencyContact: (contactId) => {
    return apiClient.post(`/api/emergency-contacts/${contactId}/test`);
  },

  // ============================================================================
  // EMERGENCY ALERTS & SECURITY
  // ============================================================================

  /**
   * Get emergency alerts history for current patient
   * @param {Object} params - Query parameters
   * @param {number} params.limit - Number of alerts to fetch
   * @param {number} params.offset - Offset for pagination
   * @returns {Promise} API response with alerts list
   */
  getEmergencyAlertsHistory: (params = {}) => {
    const queryParams = new URLSearchParams({
      limit: params.limit || 20,
      offset: params.offset || 0,
      ...params,
    });

    return apiClient.get(
      `/api/emergency-contacts/alerts/history?${queryParams}`
    );
  },

  /**
   * Mark emergency alert as resolved
   * @param {number} alertId - Alert ID to resolve
   * @param {Object} resolveData - Resolution data
   * @param {string} resolveData.notes - Resolution notes
   * @returns {Promise} API response
   */
  resolveAlert: (alertId, resolveData = {}) => {
    return apiClient.post(
      `/api/emergency-contacts/alerts/${alertId}/resolve`,
      resolveData
    );
  },

  // ============================================================================
  // ADMIN/DOCTOR ENDPOINTS (for healthcare providers)
  // ============================================================================

  /**
   * Get emergency contacts for specific patient (Admin/Doctor only)
   * @param {number} patientId - Patient ID
   * @returns {Promise} API response with patient's contacts
   */
  getPatientEmergencyContacts: (patientId) => {
    return apiClient.get(`/api/emergency-contacts/patient/${patientId}`);
  },

  /**
   * Get emergency alerts for specific patient (Admin/Doctor only)
   * @param {number} patientId - Patient ID
   * @param {Object} params - Query parameters
   * @returns {Promise} API response with patient's alerts
   */
  getPatientEmergencyAlerts: (patientId, params = {}) => {
    const queryParams = new URLSearchParams({
      limit: params.limit || 20,
      offset: params.offset || 0,
      ...params,
    });

    return apiClient.get(
      `/api/emergency-contacts/alerts/patient/${patientId}?${queryParams}`
    );
  },

  // ============================================================================
  // DEVICE & TOKEN MANAGEMENT INTEGRATION
  // ============================================================================

  /**
   * Get SmartToken alerts for current user
   * @param {Object} params - Query parameters
   * @returns {Promise} API response with token alerts
   */
  getMyTokenAlerts: (params = {}) => {
    return apiClient.get("/api/smart-tokens/my-alerts", { params });
  },

  /**
   * Get device access logs for specific token
   * @param {string} tokenId - SmartToken ID
   * @param {Object} params - Query parameters
   * @returns {Promise} API response with device logs
   */
  getTokenDeviceLogs: (tokenId, params = {}) => {
    return apiClient.get(`/api/smart-tokens/device-logs/${tokenId}`, {
      params,
    });
  },

  /**
   * Mark token alert as read
   * @param {number} alertId - Alert ID
   * @returns {Promise} API response
   */
  markTokenAlertAsRead: (alertId) => {
    return apiClient.post(`/api/smart-tokens/alerts/${alertId}/read`);
  },

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Validate phone number format
   * @param {string} phoneNumber - Phone number to validate
   * @returns {Object} Validation result
   */
  validatePhoneNumber: (phoneNumber) => {
    const cleaned = phoneNumber.replace(/\D/g, "");

    return {
      isValid: cleaned.length >= 10,
      cleaned: cleaned,
      formatted:
        cleaned.length === 10
          ? `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(
              6
            )}`
          : phoneNumber,
      international: cleaned.length === 10 ? `+1${cleaned}` : `+${cleaned}`,
    };
  },

  /**
   * Format emergency contact for display
   * @param {Object} contact - Raw contact object
   * @returns {Object} Formatted contact object
   */
  formatContactForDisplay: (contact) => {
    const phoneValidation = emergencyContactsAPI.validatePhoneNumber(
      contact.phoneNumber
    );

    return {
      ...contact,
      formattedPhone: phoneValidation.formatted,
      createdDate: new Date(contact.createdAt).toLocaleDateString(),
      updatedDate: new Date(contact.updatedAt).toLocaleDateString(),
      isPrimaryContact: !!contact.isPrimary,
    };
  },

  /**
   * Format alert for display with enhanced information
   * @param {Object} alert - Raw alert object
   * @returns {Object} Formatted alert object
   */
  formatAlertForDisplay: (alert) => {
    const alertDate = new Date(alert.createdAt);

    return {
      ...alert,
      formattedDate: alertDate.toLocaleString(),
      timeAgo: emergencyContactsAPI.getTimeAgo(alertDate),
      severityLabel: (alert.severity || "medium").toUpperCase(),
      severityColor: emergencyContactsAPI.getSeverityColor(alert.severity),
      locationSummary: emergencyContactsAPI.formatLocationSummary(
        alert.locationInfo
      ),
      deviceSummary: alert.deviceInfo || "Unknown device",
      notificationCount: alert.smsAlertsSent || 0,
      contactsNotified: alert.emergencyContactsNotified || [],
      isRecent: Date.now() - alertDate.getTime() < 24 * 60 * 60 * 1000, // Within 24 hours
    };
  },

  /**
   * Get human-readable time ago string
   * @param {Date} date - Date to compare
   * @returns {string} Time ago string
   */
  getTimeAgo: (date) => {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60)
      return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  },

  /**
   * Get severity color class
   * @param {string} severity - Alert severity level
   * @returns {string} CSS color class
   */
  getSeverityColor: (severity) => {
    switch (severity?.toLowerCase()) {
      case "high":
        return "text-red-600 bg-red-100 border-red-200";
      case "medium":
        return "text-yellow-600 bg-yellow-100 border-yellow-200";
      case "low":
        return "text-blue-600 bg-blue-100 border-blue-200";
      default:
        return "text-gray-600 bg-gray-100 border-gray-200";
    }
  },

  /**
   * Format location information for display
   * @param {Object} locationInfo - Location data object
   * @returns {string} Formatted location string
   */
  formatLocationSummary: (locationInfo) => {
    if (!locationInfo) return "Location unknown";

    if (locationInfo.type === "gps") {
      return (
        locationInfo.address ||
        `GPS: ${locationInfo.latitude}, ${locationInfo.longitude}`
      );
    } else if (locationInfo.type === "ip") {
      if (locationInfo.isPrivate) {
        return "Local network";
      } else if (locationInfo.city && locationInfo.city !== "Unknown") {
        return `${locationInfo.city}, ${locationInfo.region}`;
      } else {
        return "Internet connection location";
      }
    }

    return "Location unknown";
  },

  // ============================================================================
  // ERROR HANDLING HELPERS
  // ============================================================================

  /**
   * Handle API errors with user-friendly messages
   * @param {Error} error - API error object
   * @returns {string} User-friendly error message
   */
  getErrorMessage: (error) => {
    if (error.response?.data?.message) {
      return error.response.data.message;
    }

    switch (error.response?.status) {
      case 400:
        return "Invalid information provided. Please check your input.";
      case 401:
        return "You are not authorized to perform this action.";
      case 403:
        return "Access denied. Please contact your healthcare provider.";
      case 404:
        return "The requested information was not found.";
      case 429:
        return "Too many requests. Please wait a moment and try again.";
      case 500:
        return "A system error occurred. Please contact support if this continues.";
      default:
        return "An unexpected error occurred. Please try again.";
    }
  },
};

export default emergencyContactsAPI;
