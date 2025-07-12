// src/context/PatientRequestContext.jsx
import React, {
  createContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { patientRequestsAPI } from "../api";
import { useAuth } from "../hooks/useAuth";

// Create the context
export const PatientRequestContext = createContext();

// Create the provider component
export const PatientRequestProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  // Use a ref to prevent multiple simultaneous fetches
  const isFetchingRef = useRef(false);

  // Reset state when user changes
  useEffect(() => {
    setRequests([]);
    setLastFetched(null);
  }, [currentUser?.id]);

  // Fetch all patient requests
  const fetchRequests = useCallback(
    async (forceRefresh = false) => {
      // Skip if already fetching, no user, or no token
      if (
        isFetchingRef.current ||
        !currentUser ||
        !localStorage.getItem("token")
      ) {
        return { requests: requests || [] };
      }

      // Only fetch if forced, never fetched before, or cache is old (5 minutes)
      const dataAge = lastFetched
        ? (new Date() - lastFetched) / 1000 / 60
        : 999;
      if (requests.length > 0 && dataAge < 5 && !forceRefresh) {
        return { requests };
      }

      try {
        // Set fetching flag to prevent multiple calls
        isFetchingRef.current = true;
        setLoading(true);
        setError(null);

        const response = await patientRequestsAPI.getRequests();
        const fetchedRequests = response.data.requests || [];

        setRequests(fetchedRequests);
        setLastFetched(new Date());

        return { requests: fetchedRequests };
      } catch (err) {
        const errorMessage =
          err.response?.data?.message || "Failed to fetch patient requests";
        setError(errorMessage);
        console.error("Error fetching patient requests:", err);
        return { error: errorMessage, requests: [] };
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    },
    [currentUser] // FIXED: Removed 'lastFetched' from dependency array
  );

  // Get a single patient request by ID
  const getRequest = useCallback(async (requestId) => {
    if (!requestId) return { request: null };

    try {
      setLoading(true);
      setError(null);

      const response = await patientRequestsAPI.getRequest(requestId);
      return { request: response.data.request };
    } catch (err) {
      const errorMessage =
        err.response?.data?.message || "Failed to fetch patient request";
      setError(errorMessage);
      return { error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, []);

  // Create a new patient request (doctor only)
  const createRequest = useCallback(
    async (patientData) => {
      try {
        setLoading(true);
        setError(null);

        const response = await patientRequestsAPI.createRequest(patientData);

        // Refresh the requests list after creating a new one
        await fetchRequests(true);

        return {
          success: true,
          requestId: response.data.requestId,
          message: response.data.message,
        };
      } catch (err) {
        const errorMessage =
          err.response?.data?.message || "Failed to create patient request";
        setError(errorMessage);
        return { error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [fetchRequests]
  );

  // Approve a patient request (admin only)
  const approveRequest = useCallback(
    async (requestId, notes) => {
      try {
        setLoading(true);
        setError(null);

        const response = await patientRequestsAPI.approveRequest(
          requestId,
          notes
        );

        // Refresh the requests list after approval
        await fetchRequests(true);

        return {
          success: true,
          message: response.data.message,
          patientId: response.data.patientId,
          username: response.data.username,
        };
      } catch (err) {
        const errorMessage =
          err.response?.data?.message || "Failed to approve patient request";
        setError(errorMessage);
        return { error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [fetchRequests]
  );

  // Reject a patient request (admin only)
  const rejectRequest = useCallback(
    async (requestId, notes) => {
      try {
        setLoading(true);
        setError(null);

        const response = await patientRequestsAPI.rejectRequest(
          requestId,
          notes
        );

        // Refresh the requests list after rejection
        await fetchRequests(true);

        return {
          success: true,
          message: response.data.message,
        };
      } catch (err) {
        const errorMessage =
          err.response?.data?.message || "Failed to reject patient request";
        setError(errorMessage);
        return { error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [fetchRequests]
  );

  // Get pending requests count - safe to call even if requests is empty
  const getPendingCount = useCallback(() => {
    return (requests || []).filter((req) => req.requestStatus === "pending")
      .length;
  }, [requests]);

  // Value object to be provided by the context
  const value = {
    requests,
    loading,
    error,
    fetchRequests,
    getRequest,
    createRequest,
    approveRequest,
    rejectRequest,
    getPendingCount,
  };

  return (
    <PatientRequestContext.Provider value={value}>
      {children}
    </PatientRequestContext.Provider>
  );
};
