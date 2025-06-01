// api/index.js - SAFARI iOS COMPATIBLE VERSION
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

// Add response interceptor to handle auth errors and session validation
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

        // Close any open file viewer windows
        if (window.fileViewerWindows) {
          window.fileViewerWindows.forEach((win) => {
            if (!win.closed) {
              win.close();
            }
          });
          window.fileViewerWindows = [];
        }

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

        // Close any open file viewer windows
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

// Universal File Viewer - Works on all browsers including Safari iOS
const createUniversalFileViewer = async (
  containerName,
  folderName,
  blobName
) => {
  return new Promise(async (resolve, reject) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        reject(
          new Error("No authentication token found. Please log in again.")
        );
        return;
      }

      // First validate the session
      await authAPI.validateToken();

      // Create URL with authentication
      const timestamp = Date.now();
      const secureUrl = `${
        import.meta.env.VITE_REACT_API_URL
      }/api/blobs/${containerName}/${folderName}/${encodeURIComponent(
        blobName
      )}/view?t=${timestamp}&auth=${encodeURIComponent(token)}`;

      // Try window.open first - this should work for most browsers
      const newWindow = window.open(secureUrl, "_blank", "noopener,noreferrer");

      // Check if window.open succeeded
      if (newWindow && !newWindow.closed) {
        // Window opened successfully - track it for cleanup
        if (!window.fileViewerWindows) {
          window.fileViewerWindows = [];
        }
        window.fileViewerWindows.push(newWindow);

        // Clean up closed windows
        window.fileViewerWindows = window.fileViewerWindows.filter(
          (win) => !win.closed
        );

        // Set up session validation interval
        const sessionCheckInterval = setInterval(async () => {
          if (newWindow.closed) {
            clearInterval(sessionCheckInterval);
            return;
          }

          try {
            await authAPI.validateToken();
          } catch (error) {
            // Session invalid, close the window
            if (!newWindow.closed) {
              newWindow.close();
            }
            clearInterval(sessionCheckInterval);
          }
        }, 30000); // Check every 30 seconds

        resolve({
          success: true,
          method: "window_open",
          message: "File opened successfully",
        });
      } else {
        // Window.open failed (likely popup blocker)
        // Only use fallback if user explicitly allows it
        const userWantsToNavigate = confirm(
          "Popup was blocked. Would you like to open the file in the current tab instead?"
        );

        if (userWantsToNavigate) {
          window.location.href = secureUrl;
          resolve({
            success: true,
            method: "location_redirect",
            message: "File opened in current tab",
          });
        } else {
          reject(
            new Error(
              "File opening was cancelled. Please allow popups for this site or try again."
            )
          );
        }
      }
    } catch (error) {
      reject(error);
    }
  });
};

// Blobs API - SAFARI COMPATIBLE VERSION
const blobsAPI = {
  getBlobs: (containerName, folderName) =>
    api.get(`/blobs/${containerName}/${folderName}`),

  // SAFARI iOS COMPATIBLE: View file with enhanced browser compatibility
  viewBlob: async (containerName, folderName, blobName) => {
    try {
      // First validate the current session
      await authAPI.validateToken();

      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("No authentication token found. Please log in again.");
      }

      // Use universal viewer that works on all browsers
      return await createUniversalFileViewer(
        containerName,
        folderName,
        blobName
      );
    } catch (error) {
      console.error("Error opening file:", error);

      if (error.message.includes("Authentication")) {
        throw new Error("Your session has expired. Please log in again.");
      } else if (error.message.includes("Access denied")) {
        throw new Error("You don't have permission to view this file.");
      } else {
        throw new Error(
          "Failed to open file. Please try again or contact support."
        );
      }
    }
  },

  // Rest of the API functions remain the same...
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

// Enhanced logout function to close all file viewer windows
const enhancedLogout = async () => {
  try {
    // Close all file viewer windows
    if (window.fileViewerWindows) {
      window.fileViewerWindows.forEach((win) => {
        if (!win.closed) {
          win.close();
        }
      });
      window.fileViewerWindows = [];
    }

    // Call logout API to invalidate session
    await authAPI.logout();
  } catch (error) {
    console.error("Logout error:", error);
  } finally {
    // Clear local storage regardless of API call success
    localStorage.removeItem("token");

    // Redirect to login
    window.location.href = "/login";
  }
};

// Listen for logout events from other tabs
window.addEventListener("storage", (e) => {
  if (e.key === "token" && e.newValue === null) {
    // Token was removed in another tab, close file windows and redirect
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

// Export everything
export {
  authAPI,
  usersAPI,
  assignmentsAPI,
  blobsAPI,
  smartTokenAPI,
  smartTokenUtils,
  enhancedLogout,
};
