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
    // Handle authentication errors
    if (error.response && error.response.status === 401) {
      // Only redirect if not already on the login page
      if (!window.location.pathname.includes("/login")) {
        // Clear auth data
        localStorage.removeItem("token");

        // Force page refresh to reset the application state
        window.location.href = "/login?session=expired";
      }
    }
    return Promise.reject(error);
  }
);

// Create separate axios instance for SmartToken APIs (different base path)
const smartTokenAxios = axios.create({
  baseURL: import.meta.env.VITE_REACT_API_URL, // Direct to backend without /api
  headers: {
    "Content-Type": "application/json",
  },
});

// Add authentication token to SmartToken requests
smartTokenAxios.interceptors.request.use(
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

// Add response interceptor for SmartToken API
smartTokenAxios.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle authentication errors
    if (error.response && error.response.status === 401) {
      if (!window.location.pathname.includes("/login")) {
        localStorage.removeItem("token");
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

// Blobs API
const blobsAPI = {
  getBlobs: (containerName, folderName) =>
    api.get(`/blobs/${containerName}/${folderName}`),
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
  deleteBlob: (containerName, folderName, blobName) =>
    api.delete(`/blobs/${containerName}/${folderName}/${blobName}`),
  getAuditLogs: (params) => api.get("/blobs/audit", { params }),
};

// SmartToken API - Complete version with remote disconnect functionality
const smartTokenAPI = {
  // Token Management
  getUnclaimedTokens: () => smartTokenAxios.get("/patients/admin/unclaimed"),
  getAllAssignedTokens: () => smartTokenAxios.get("/patients/admin/assigned"),

  // Token Assignment
  assignTokenToPatient: (tokenData) => {
    const { tokenId, containerName, folderName, patientName } = tokenData;

    return smartTokenAxios.post("/patients/admin/assign", {
      tokenId,
      containerName,
      folderName,
      patientName: patientName || "Unknown Patient",
    });
  },

  // Remote Disconnect Functions
  revokeToken: (tokenId, reason) => {
    return smartTokenAxios.post("/patients/admin/revoke", {
      tokenId: tokenId,
      reason: reason,
    });
  },

  reactivateToken: (tokenId) => {
    return smartTokenAxios.post("/patients/admin/reactivate", {
      tokenId: tokenId,
    });
  },
};

// Utility functions for SmartToken API
const smartTokenUtils = {
  // Format token ID for display
  formatTokenId: (tokenId) => {
    if (!tokenId || tokenId.length < 16) return tokenId;
    return `${tokenId.substring(0, 8)}...${tokenId.substring(
      tokenId.length - 8
    )}`;
  },

  // Get status color for UI
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

  // Get status display text
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

  // Format dates consistently
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

  // Error handler for API calls
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

// Export everything
export {
  authAPI,
  usersAPI,
  assignmentsAPI,
  blobsAPI,
  smartTokenAPI,
  smartTokenUtils,
};
