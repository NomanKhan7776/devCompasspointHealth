// src/api/index.js - ENHANCED VERSION WITH EMERGENCY FEATURES
import axios from "axios";

// Create axios instance
const api = axios.create({
  baseURL: `${import.meta.env.VITE_REACT_API_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add authentication token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers["x-auth-token"] = token;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      if (!window.location.pathname.includes("/login")) {
        localStorage.removeItem("token");
        if (window.fileViewerWindows) {
          window.fileViewerWindows.forEach((win) => {
            if (!win.closed) {
              win.close();
            }
          });
          window.fileViewerWindows = [];
        }
        window.location.href = "/login?session=expired";
      }
    }
    return Promise.reject(error);
  }
);

// Authentication API
const authAPI = {
  login: (username, password) =>
    api.post("/auth/login", { username, password }),
  getCurrentUser: () => api.get("/auth/me"),
  logout: () => api.post("/auth/logout"),
  logoutAll: () => api.post("/auth/logout-all"),
  validateToken: () => api.get("/auth/validate-token"),
};

// Users API
const usersAPI = {
  getAllUsers: () => api.get("/users"),
  getUserById: (userId) => api.get(`/users/${userId}`),
  createUser: (userData) => api.post("/auth/register", userData),
  updateUser: (userId, userData) => api.put(`/users/${userId}`, userData),
  deleteUser: (userId) => api.delete(`/users/${userId}`),
  getUsersWithAssignments: () => api.get("/users/with-assignments"),
};

// Assignments API
const assignmentsAPI = {
  getAllContainers: () => api.get("/assignments/containers"),
  getFolders: (containerName) =>
    api.get(`/assignments/containers/${containerName}/folders`),
  assignContainer: (containerName, userId) =>
    api.post(`/assignments/containers/${containerName}/users/${userId}`),
  assignFolders: (containerName, userId, folderNames) =>
    api.post(`/assignments/containers/${containerName}/folders`, {
      userId,
      folderNames,
    }),
  getUserAssignments: (userId) => api.get(`/assignments/users/${userId}`),
  getMyAssignments: () => api.get("/assignments/my-assignments"),
  revokeAssignment: (assignmentId, type) =>
    api.delete(`/assignments/${assignmentId}?type=${type}`),
};

// Global array to track file viewer windows
if (!window.fileViewerWindows) {
  window.fileViewerWindows = [];
}

// Detect if we're on Safari iOS
const isSafariIOS = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  return (
    /iphone|ipad|ipod/.test(userAgent) &&
    /safari/.test(userAgent) &&
    !/chrome|crios|fxios|edgios/.test(userAgent)
  );
};

// SAFARI iOS COMPATIBLE: Handle different browsers appropriately
const openFileInNewTab = (containerName, folderName, blobName) => {
  const token = localStorage.getItem("token");
  if (!token) {
    throw new Error("No authentication token found. Please log in again.");
  }

  // Build URL with token
  const timestamp = Date.now();
  const fileUrl = `${
    import.meta.env.VITE_REACT_API_URL
  }/api/blobs/${containerName}/${folderName}/${encodeURIComponent(
    blobName
  )}/view?t=${timestamp}&auth=${encodeURIComponent(token)}`;

  // Safari iOS specific handling
  if (isSafariIOS()) {
    // For Safari iOS, use location.href instead of window.open
    // This avoids popup blockers entirely
    window.location.href = fileUrl;

    return {
      success: true,
      method: "safari_ios_navigate",
      message: "File opened successfully",
    };
  } else {
    // For all other browsers (Chrome, Firefox, desktop Safari, etc.)
    const newWindow = window.open(fileUrl, "_blank");

    if (!newWindow) {
      throw new Error("Popup blocked. Please allow popups for this site.");
    }

    // Track window for non-iOS browsers
    if (!window.fileViewerWindows) {
      window.fileViewerWindows = [];
    }
    window.fileViewerWindows.push(newWindow);

    return {
      success: true,
      method: "desktop_new_tab",
      message: "File opened in new tab",
    };
  }
};

// Blobs API - ENHANCED VERSION WITH PROFILE IMAGE SUPPORT
const blobsAPI = {
  getBlobs: (containerName, folderName) =>
    api.get(`/blobs/${containerName}/${folderName}`),

  // Get profile image for emergency access (no auth required)
  getProfileImage: (containerName, folderName) =>
    axios.get(
      `${
        import.meta.env.VITE_REACT_API_URL
      }/api/blobs/${containerName}/${folderName}/profile-image`,
      {
        responseType: "blob",
      }
    ),

  // File viewer - just open the URL
  viewBlob: async (containerName, folderName, blobName) => {
    try {
      // Quick token validation (optional)
      await authAPI.validateToken();

      // Open file directly
      return openFileInNewTab(containerName, folderName, blobName);
    } catch (error) {
      console.error("Error opening file:", error);

      if (error.response && error.response.status === 401) {
        throw new Error("Your session has expired. Please log in again.");
      } else if (error.response && error.response.status === 403) {
        throw new Error("You don't have permission to view this file.");
      } else if (error.message.includes("Popup blocked")) {
        throw new Error(
          "Popup blocked. Please allow popups for this site and try again."
        );
      } else {
        throw new Error(
          error.message || "Failed to open file. Please try again."
        );
      }
    }
  },

  getBlobUrl: (containerName, folderName, blobName) =>
    api.get(`/blobs/${containerName}/${folderName}/${blobName}/url`),

  uploadBlob: (containerName, folderName, formData) => {
    return api.post(`/blobs/${containerName}/${folderName}`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 60000,
    });
  },

  // Enhanced upload method specifically for profile images
  uploadProfileImage: (containerName, folderName, imageFile) => {
    const formData = new FormData();
    formData.append("file", imageFile);
    formData.append("filename", imageFile.name);
    formData.append("isProfileImage", "true"); // Flag for profile image processing

    return api.post(`/blobs/${containerName}/${folderName}`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 60000,
    });
  },

  deleteBlob: (containerName, folderName, blobName) => {
    return api.delete(`/blobs/${containerName}/${folderName}/${blobName}`);
  },

  // Delete profile image specifically
  deleteProfileImage: (containerName, folderName) => {
    return api.delete(
      `/blobs/${containerName}/${folderName}/patient-profile.jpg`
    );
  },

  getAuditLogs: (params) => api.get("/blobs/audit", { params }),
};

// ✅ ENHANCED: SmartToken API with Emergency Features
const smartTokenAPI = {
  // Core token management
  getUnclaimedTokens: () => api.get("/smart-tokens/unclaimed"),
  getAllAssignedTokens: () => api.get("/smart-tokens/all-with-users"),

  // Enhanced assignment features
  getPatientsForAssignment: () =>
    api.get("/smart-tokens/patients-for-assignment"),
  getDoctorsForPatient: (patientUserId) =>
    api.get(`/smart-tokens/doctors-for-patient/${patientUserId}`),

  // Token assignment
  assignTokenToPatient: (tokenData) => {
    const {
      tokenId,
      containerName,
      folderName,
      patientName,
      patientDateOfBirth,
      patientUserId,
      doctorUserId,
    } = tokenData;

    return api.post("/smart-tokens/assign-enhanced", {
      tokenId,
      containerName,
      folderName,
      patientName: patientName || "Unknown Patient",
      patientDateOfBirth,
      patientUserId,
      doctorUserId,
    });
  },

  // Token management
  revokeToken: (tokenId, reason) => {
    return api.post("/smart-tokens/revoke", {
      tokenId: tokenId,
      reason: reason,
    });
  },

  reactivateToken: (tokenId) => {
    return api.post("/smart-tokens/reactivate", {
      tokenId: tokenId,
    });
  },

  deleteToken: (tokenId) => {
    return api.delete(`/smart-tokens/${tokenId}`);
  },

  // Folder assignments
  getAssignedFolders: (containerName) =>
    api.get(`/smart-tokens/assigned-folders/${containerName}`),

  // Logs and monitoring
  getSmartTokenLogs: (params) => api.get("/smart-tokens/logs", { params }),

  // ✅ ENHANCED: User-specific token access with emergency features
  getMyTokens: () => api.get("/smart-tokens/my-tokens"),
  getDeviceLogs: (tokenId) => api.get(`/smart-tokens/device-logs/${tokenId}`),
  getMyAlerts: () => api.get("/smart-tokens/my-alerts"),
  markAlertAsRead: (alertId) =>
    api.post(`/smart-tokens/alerts/${alertId}/read`),
};

// Device Management API - ENHANCED with Emergency Features
const deviceAPI = {
  // Core device management with enhanced payload structure
  registerDevice: (deviceData) => {
    console.log("📤 Device API: Sending registration request:", {
      endpoint: "/devices/register",
      visitorId: deviceData.deviceFingerprint?.visitorId,
      requestId: deviceData.deviceFingerprint?.requestId,
      confidenceScore: deviceData.deviceFingerprint?.confidenceScore,
      service: deviceData.deviceFingerprint?.metadata?.service,
      deviceName: deviceData.deviceName,
      deviceType: deviceData.deviceType,
    });

    return api.post("/devices/register", deviceData);
  },

  getMyDevices: () => api.get("/devices/my-devices"),
  removeDevice: (fingerprintId, options = {}) => {
    const params = new URLSearchParams();
    if (options.permanent) {
      params.append("permanent", "true");
    }

    const url = `/devices/${fingerprintId}${
      params.toString() ? `?${params.toString()}` : ""
    }`;
    return api.delete(url);
  },

  // QR Code functionality for family registration
  generateQRForFamilyRegistration: () => api.post("/devices/generate-qr"),
  registerDeviceViaQR: (qrToken, deviceData) => {
    console.log("📤 Device API: Sending QR registration request:", {
      endpoint: `/devices/register-via-qr/${qrToken}`,
      visitorId: deviceData.deviceFingerprint?.visitorId,
      service: deviceData.deviceFingerprint?.metadata?.service,
      deviceName: deviceData.deviceName,
    });

    return api.post(`/devices/register-via-qr/${qrToken}`, deviceData);
  },
  checkQRStatus: (qrToken) => api.get(`/devices/qr-status/${qrToken}`),

  // Device verification with enhanced payload structure
  verifyDevice: (deviceData) => {
    console.log("📤 Device API: Sending verification request:", {
      endpoint: "/devices/verify",
      visitorId: deviceData.deviceFingerprint?.visitorId,
      service: deviceData.deviceFingerprint?.metadata?.service,
    });

    return api.post("/devices/verify", deviceData);
  },

  // Device monitoring
  getDeviceStats: () => api.get("/devices/stats"),
  updateDeviceName: (fingerprintId, newName) =>
    api.put(`/devices/${fingerprintId}`, { deviceName: newName }),
};

// ✅ NEW: Emergency Contacts API
const emergencyContactsAPI = {
  // Emergency contacts management
  getEmergencyContacts: () => api.get("/emergency-contacts"),
  addEmergencyContact: (contactData) =>
    api.post("/emergency-contacts", contactData),
  updateEmergencyContact: (contactId, contactData) =>
    api.put(`/emergency-contacts/${contactId}`, contactData),
  deleteEmergencyContact: (contactId) =>
    api.delete(`/emergency-contacts/${contactId}`),
  testEmergencyContact: (contactId) =>
    api.post(`/emergency-contacts/${contactId}/test`),

  // Emergency alerts management
  getEmergencyAlertsHistory: (params = {}) => {
    const queryParams = new URLSearchParams({
      limit: params.limit || 20,
      offset: params.offset || 0,
      ...params,
    });
    return api.get(`/emergency-contacts/alerts/history?${queryParams}`);
  },

  resolveAlert: (alertId, resolveData = {}) =>
    api.post(`/emergency-contacts/alerts/${alertId}/resolve`, resolveData),

  // Statistics
  getEmergencyContactStats: () => api.get("/emergency-contacts/stats"),

  // Admin/Doctor endpoints
  getPatientEmergencyContacts: (patientId) =>
    api.get(`/emergency-contacts/patient/${patientId}`),
  getPatientEmergencyAlerts: (patientId, params = {}) => {
    const queryParams = new URLSearchParams({
      limit: params.limit || 20,
      offset: params.offset || 0,
      ...params,
    });
    return api.get(
      `/emergency-contacts/alerts/patient/${patientId}?${queryParams}`
    );
  },
};

// Utility functions for SmartToken API
const smartTokenUtils = {
  formatTokenId: (tokenId) => {
    if (!tokenId || tokenId.length < 16) return tokenId;
    return `${tokenId.substring(0, 8)}...${tokenId.substring(
      tokenId.length - 8
    )}`;
  },
  getStatusColor: (status) => {
    switch (status) {
      case "assigned":
        return "green";
      case "revoked":
        return "red";
      case "unclaimed":
        return "yellow";
      default:
        return "gray";
    }
  },
  getStatusText: (status) => {
    switch (status) {
      case "assigned":
        return "Active";
      case "revoked":
        return "Revoked";
      case "unclaimed":
        return "Unclaimed";
      default:
        return "Unknown";
    }
  },
  formatDate: (dateString) => {
    try {
      return new Date(dateString).toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZoneName: "short",
      });
    } catch {
      return "Invalid Date";
    }
  },
  handleApiError: (error, defaultMessage = "An error occurred") => {
    if (error.response && error.response.data && error.response.data.message) {
      return error.response.data.message;
    } else if (error.message) {
      return error.message;
    } else {
      return defaultMessage;
    }
  },
};

// Profile Image Utilities
const profileImageUtils = {
  // Standard profile image configuration
  PROFILE_CONFIG: {
    standardName: "patient-profile.jpg",
    dimensions: { width: 150, height: 150 },
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedFormats: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/bmp",
      "image/webp",
    ],
  },

  // Validate profile image file
  validateProfileImage: (file) => {
    const config = profileImageUtils.PROFILE_CONFIG;

    if (!file) {
      return { valid: false, error: "No file selected" };
    }

    if (!config.allowedFormats.includes(file.type)) {
      return {
        valid: false,
        error:
          "Invalid file format. Please select JPEG, PNG, GIF, BMP, or WebP image.",
      };
    }

    if (file.size > config.maxFileSize) {
      return {
        valid: false,
        error: "File too large. Please select an image smaller than 10MB.",
      };
    }

    return { valid: true };
  },

  // Get profile image URL for emergency access
  getEmergencyProfileImageUrl: (containerName, folderName) => {
    return `${
      import.meta.env.VITE_REACT_API_URL
    }/api/blobs/${containerName}/${folderName}/profile-image`;
  },

  // Generate patient initials for fallback display
  generateInitials: (patientName) => {
    if (!patientName) return "??";
    return patientName
      .split(" ")
      .map((name) => name.charAt(0))
      .join("")
      .substring(0, 2)
      .toUpperCase();
  },

  // Create profile image preview
  createImagePreview: (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
};

// Enhanced logout function
const enhancedLogout = async () => {
  try {
    if (window.fileViewerWindows) {
      window.fileViewerWindows.forEach((win) => {
        if (!win.closed) {
          win.close();
        }
      });
      window.fileViewerWindows = [];
    }
    await authAPI.logout();
  } catch (error) {
    console.error("Logout error:", error);
  } finally {
    localStorage.removeItem("token");
    window.location.href = "/login";
  }
};

const patientRequestsAPI = {
  createRequest: (patientData) => api.post("/patient-requests", patientData),
  getRequests: () => api.get("/patient-requests"),
  getRequest: (requestId) => api.get(`/patient-requests/${requestId}`),
  approveRequest: (requestId, notes) =>
    api.put(`/patient-requests/${requestId}/approve`, {
      rejectionReason: notes,
    }),
  rejectRequest: (requestId, notes) =>
    api.put(`/patient-requests/${requestId}/reject`, {
      rejectionReason: notes,
    }),
  getAvailableFolders: (containerName) =>
    api.get(`/patient-requests/available-folders/${containerName}`),
};

// Listen for logout events from other tabs
window.addEventListener("storage", (e) => {
  if (e.key === "token" && e.newValue === null) {
    if (window.fileViewerWindows) {
      window.fileViewerWindows.forEach((win) => {
        if (!win.closed) {
          win.close();
        }
      });
      window.fileViewerWindows = [];
    }

    if (!window.location.pathname.includes("/login")) {
      window.location.href = "/login?session=expired";
    }
  }
});

// Export everything including new emergency features
export {
  authAPI,
  usersAPI,
  assignmentsAPI,
  blobsAPI,
  smartTokenAPI,
  smartTokenUtils,
  profileImageUtils,
  patientRequestsAPI,
  deviceAPI,
  emergencyContactsAPI, // ✅ NEW: Emergency contacts API
  enhancedLogout,
};
