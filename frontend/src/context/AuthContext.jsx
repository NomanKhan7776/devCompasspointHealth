import React, { useState, useEffect } from "react";
import { authAPI, enhancedLogout } from "../api";
import { AuthContext } from "../hooks/useAuth";

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // This function will handle parsing the token consistently
  const parseUserFromToken = (token) => {
    try {
      // Split the token
      const parts = token.split(".");
      if (parts.length !== 3) {
        console.error("Invalid token format");
        return null;
      }

      // Decode the payload part (middle part)
      const payload = parts[1];
      // Base64 decode
      const decodedPayload = atob(
        payload.replace(/-/g, "+").replace(/_/g, "/")
      );
      const tokenData = JSON.parse(decodedPayload);

      // Check if the expected user data exists
      if (!tokenData.user) {
        console.error("No user data in token");
        return null;
      }

      // Return a properly formatted user object that matches what your app expects
      return {
        id: tokenData.user.userId || tokenData.user.id, // Handle both formats
        role: tokenData.user.role,
        name: tokenData.user.name || "User", // Fallback
        username: tokenData.user.username,
      };
    } catch (e) {
      console.error("Error parsing token:", e);
      return null;
    }
  };

  // Load user from token on initial render
  useEffect(() => {
    const loadUserFromToken = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        // First parse the token to set initial user state quickly
        const parsedUser = parseUserFromToken(token);
        if (parsedUser) {
          setCurrentUser(parsedUser);
        }

        // Then verify the token with the server
        const response = await authAPI.getCurrentUser();

        // Update with server-verified data
        setCurrentUser({
          id: response.data.user.userId || response.data.user.id,
          role: response.data.user.role,
          name: response.data.user.name,
          username: response.data.user.username,
        });
      } catch (err) {
        // If server validation fails, clear the token and user state
        console.error("Token validation failed:", err);
        localStorage.removeItem("token");
        setCurrentUser(null);

        // Close any open file viewer windows
        if (window.fileViewerWindows) {
          window.fileViewerWindows.forEach((win) => {
            if (!win.closed) {
              win.close();
            }
          });
          window.fileViewerWindows = [];
        }
      } finally {
        setLoading(false);
      }
    };

    loadUserFromToken();
  }, []);

  // Listen for app logout events
  useEffect(() => {
    const handleAppLogout = () => {
      setCurrentUser(null);
      localStorage.removeItem("token");
      sessionStorage.clear();
    };

    window.addEventListener("app:logout", handleAppLogout);
    return () => {
      window.removeEventListener("app:logout", handleAppLogout);
    };
  }, []);

  const login = async (username, password) => {
    try {
      setError(null);
      // Clear any existing state first
      localStorage.removeItem("token");
      setCurrentUser(null);

      // Clear any cached data from other context providers
      sessionStorage.clear();

      // Close any existing file viewer windows
      if (window.fileViewerWindows) {
        window.fileViewerWindows.forEach((win) => {
          if (!win.closed) {
            win.close();
          }
        });
        window.fileViewerWindows = [];
      }

      const response = await authAPI.login(username, password);

      const { token, user } = response.data;

      // Store the token
      localStorage.setItem("token", token);

      // Set the current user with a structure that matches parseUserFromToken
      setCurrentUser({
        id: user.userId || user.id, // Handle both formats
        role: user.role,
        name: user.name || username, // Fallback to username
        username: user.username || username,
      });

      return user;
    } catch (err) {
      setError(err.response?.data?.message || "Failed to login");
      throw err;
    }
  };

  const logout = async () => {
    try {
      // Use enhanced logout to close file windows and call API
      await enhancedLogout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // Reset state regardless of API call success
      setCurrentUser(null);

      // Force clear any in-memory data states
      window.dispatchEvent(new Event("app:logout"));
    }
  };

  // Enhanced logout that closes file windows from all sessions
  const logoutAllSessions = async () => {
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

      // Call logout-all API to invalidate all sessions
      await authAPI.logoutAll();
    } catch (error) {
      console.error("Logout all sessions error:", error);
    } finally {
      // Clear authentication data
      localStorage.removeItem("token");

      // Clear any cached data
      localStorage.removeItem("lastFetched");
      sessionStorage.clear();

      // Reset state
      setCurrentUser(null);

      // Force clear any in-memory data states
      window.dispatchEvent(new Event("app:logout"));

      // Redirect to login
      window.location.href = "/login";
    }
  };

  const isAdmin = () => {
    return currentUser?.role === "admin";
  };

  const isDoctor = () => {
    return currentUser?.role === "doctor";
  };

  const isNurse = () => {
    return currentUser?.role === "nurse";
  };

  const isAssistant = () => {
    return currentUser?.role === "assistant";
  };
  const isPatient = () => {
    return (
      currentUser?.role === "patient" && currentUser?.userType === "patient"
    );
  };
  const value = {
    currentUser,
    loading,
    error,
    login,
    logout,
    logoutAllSessions,
    isAdmin,
    isDoctor,
    isNurse,
    isAssistant,
    isPatient,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
