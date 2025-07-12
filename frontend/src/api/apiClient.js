// src/api/apiClient.js - Centralized API Client Configuration for PRMS
import axios from "axios";

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_REACT_API_URL || "http://localhost:5000",
  timeout: 30000, // 30 seconds timeout
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add authentication token
apiClient.interceptors.request.use(
  (config) => {
    // Get token from localStorage
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add request timestamp for debugging
    config.metadata = { startTime: new Date() };

    // Log request in development
    if (import.meta.env.DEV) {
      console.log(
        `🌐 API Request: ${config.method?.toUpperCase()} ${config.url}`,
        {
          headers: config.headers,
          data: config.data,
          params: config.params,
        }
      );
    }

    return config;
  },
  (error) => {
    console.error("Request interceptor error:", error);
    return Promise.reject(error);
  }
);

// Response interceptor to handle common response patterns
apiClient.interceptors.response.use(
  (response) => {
    // Calculate request duration
    const duration = new Date() - response.config.metadata.startTime;

    // Log response in development
    if (import.meta.env.DEV) {
      console.log(
        `✅ API Response: ${response.config.method?.toUpperCase()} ${
          response.config.url
        }`,
        {
          status: response.status,
          duration: `${duration}ms`,
          data: response.data,
        }
      );
    }

    return response;
  },
  (error) => {
    // Calculate request duration if available
    const duration = error.config?.metadata
      ? new Date() - error.config.metadata.startTime
      : "unknown";

    // Log error in development
    if (import.meta.env.DEV) {
      console.error(
        `❌ API Error: ${error.config?.method?.toUpperCase()} ${
          error.config?.url
        }`,
        {
          status: error.response?.status,
          duration: `${duration}ms`,
          message: error.message,
          data: error.response?.data,
        }
      );
    }

    // Handle specific error cases
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;

      switch (status) {
        case 401:
          // Unauthorized - clear token and redirect to login
          console.warn("Unauthorized access - clearing token");
          localStorage.removeItem("token");

          // Dispatch custom event for auth components to handle
          window.dispatchEvent(new CustomEvent("auth:unauthorized"));

          // Redirect to login if not already there
          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
          break;

        case 403:
          // Forbidden - user doesn't have permission
          console.warn("Access forbidden - insufficient permissions");
          break;

        case 404:
          // Not found
          console.warn("Resource not found:", error.config?.url);
          break;

        case 429:
          // Rate limited
          console.warn("Rate limit exceeded - please slow down requests");
          break;

        case 500:
          // Server error
          console.error("Server error occurred");
          break;

        case 503:
          // Service unavailable
          console.error("Service temporarily unavailable");
          break;

        default:
          console.error(
            `HTTP ${status} error:`,
            data?.message || error.message
          );
      }

      // Return a structured error object
      const apiError = new Error(data?.message || `HTTP ${status} Error`);
      apiError.status = status;
      apiError.data = data;
      apiError.config = error.config;

      return Promise.reject(apiError);
    } else if (error.request) {
      // Network error - no response received
      console.error("Network error - no response received:", error.message);

      const networkError = new Error(
        "Network error - please check your connection"
      );
      networkError.isNetworkError = true;
      networkError.originalError = error;

      return Promise.reject(networkError);
    } else {
      // Request setup error
      console.error("Request setup error:", error.message);
      return Promise.reject(error);
    }
  }
);

// Helper methods for common HTTP operations
export const httpMethods = {
  /**
   * GET request
   * @param {string} url - Endpoint URL
   * @param {Object} config - Request configuration
   * @returns {Promise} Axios response promise
   */
  get: (url, config = {}) => apiClient.get(url, config),

  /**
   * POST request
   * @param {string} url - Endpoint URL
   * @param {Object} data - Request body data
   * @param {Object} config - Request configuration
   * @returns {Promise} Axios response promise
   */
  post: (url, data = {}, config = {}) => apiClient.post(url, data, config),

  /**
   * PUT request
   * @param {string} url - Endpoint URL
   * @param {Object} data - Request body data
   * @param {Object} config - Request configuration
   * @returns {Promise} Axios response promise
   */
  put: (url, data = {}, config = {}) => apiClient.put(url, data, config),

  /**
   * DELETE request
   * @param {string} url - Endpoint URL
   * @param {Object} config - Request configuration
   * @returns {Promise} Axios response promise
   */
  delete: (url, config = {}) => apiClient.delete(url, config),

  /**
   * PATCH request
   * @param {string} url - Endpoint URL
   * @param {Object} data - Request body data
   * @param {Object} config - Request configuration
   * @returns {Promise} Axios response promise
   */
  patch: (url, data = {}, config = {}) => apiClient.patch(url, data, config),
};

// Utility functions for API client
export const apiUtils = {
  /**
   * Check if user is authenticated
   * @returns {boolean} True if user has valid token
   */
  isAuthenticated: () => {
    const token = localStorage.getItem("token");
    if (!token) return false;

    try {
      // Check if token is expired (basic JWT parsing)
      const payload = JSON.parse(atob(token.split(".")[1]));
      const now = Date.now() / 1000;
      return payload.exp > now;
    } catch (error) {
      console.warn("Invalid token format:", error);
      return false;
    }
  },

  /**
   * Get user info from stored token
   * @returns {Object|null} User information or null if not available
   */
  getCurrentUser: () => {
    const token = localStorage.getItem("token");
    if (!token) return null;

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return {
        id: payload.userId || payload.user?.userId,
        role: payload.role || payload.user?.role,
        name: payload.name || payload.user?.name,
        username: payload.username || payload.user?.username,
        exp: payload.exp,
      };
    } catch (error) {
      console.warn("Unable to parse user from token:", error);
      return null;
    }
  },

  /**
   * Clear authentication data
   */
  clearAuth: () => {
    localStorage.removeItem("token");
    // Dispatch event for components to react to logout
    window.dispatchEvent(new CustomEvent("auth:logout"));
  },

  /**
   * Set authentication token
   * @param {string} token - JWT token
   */
  setAuthToken: (token) => {
    localStorage.setItem("token", token);
    // Dispatch event for components to react to login
    window.dispatchEvent(new CustomEvent("auth:login"));
  },

  /**
   * Build query string from object
   * @param {Object} params - Query parameters
   * @returns {string} Query string
   */
  buildQueryString: (params) => {
    const filteredParams = Object.entries(params || {})
      .filter(
        ([_, value]) => value !== undefined && value !== null && value !== ""
      )
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
      )
      .join("&");

    return filteredParams ? `?${filteredParams}` : "";
  },

  /**
   * Handle file uploads with progress tracking
   * @param {string} url - Upload endpoint
   * @param {FormData} formData - File data
   * @param {Function} onProgress - Progress callback
   * @returns {Promise} Upload promise
   */
  uploadFile: (url, formData, onProgress = null) => {
    return apiClient.post(url, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        }
      },
    });
  },

  /**
   * Download file with proper handling
   * @param {string} url - Download endpoint
   * @param {string} filename - Desired filename
   * @returns {Promise} Download promise
   */
  downloadFile: async (url, filename = "download") => {
    try {
      const response = await apiClient.get(url, {
        responseType: "blob",
      });

      // Create blob link to download
      const blob = new Blob([response.data]);
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = filename;
      link.click();

      // Clean up
      window.URL.revokeObjectURL(link.href);

      return response;
    } catch (error) {
      console.error("File download failed:", error);
      throw error;
    }
  },
};

// Health check function
export const healthCheck = async () => {
  try {
    const response = await apiClient.get("/api/status");
    return {
      healthy: true,
      status: response.data,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};

// Configure global error handling for unhandled promise rejections
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    if (event.reason?.isNetworkError) {
      console.error("Unhandled network error:", event.reason.message);
      // Could show a toast notification here
    }
  });
}

// Export the configured axios instance as default
export default apiClient;
