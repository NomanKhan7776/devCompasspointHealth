// api/index.js - SIMPLEST APPROACH THAT WORKS
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

// Create separate axios instance for SmartToken APIs
const smartTokenAxios = axios.create({
  baseURL: import.meta.env.VITE_REACT_API_URL,
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

// Blobs API - SIMPLEST VERSION
const blobsAPI = {
  getBlobs: (containerName, folderName) =>
    api.get(`/blobs/${containerName}/${folderName}`),

  // SIMPLEST file viewer - just open the URL
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
  deleteBlob: (containerName, folderName, blobName) =>
    api.delete(`/blobs/${containerName}/${folderName}/${blobName}`),
  getAuditLogs: (params) => api.get("/blobs/audit", { params }),
};

// SmartToken API
const smartTokenAPI = {
  getUnclaimedTokens: () => smartTokenAxios.get("/patients/admin/unclaimed"),
  getAllAssignedTokens: () => smartTokenAxios.get("/patients/admin/assigned"),
  assignTokenToPatient: (tokenData) => {
    const { tokenId, containerName, folderName, patientName } = tokenData;
    return smartTokenAxios.post("/patients/admin/assign", {
      tokenId,
      containerName,
      folderName,
      patientName: patientName || "Unknown Patient",
    });
  },
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
