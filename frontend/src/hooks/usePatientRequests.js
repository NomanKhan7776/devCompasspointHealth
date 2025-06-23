// src/hooks/usePatientRequests.js
import { useContext } from "react";
import { PatientRequestContext } from "../context/PatientRequestContext";

export const usePatientRequests = () => {
  const context = useContext(PatientRequestContext);
  
  if (context === undefined) {
    // Return a fallback object with default values to prevent errors
    return {
      requests: [],
      loading: false,
      error: null,
      fetchRequests: async () => ({ requests: [] }),
      getRequest: async () => ({ request: null }),
      createRequest: async () => ({ error: "Context not available" }),
      approveRequest: async () => ({ error: "Context not available" }),
      rejectRequest: async () => ({ error: "Context not available" }),
      getPendingCount: () => 0,
    };
  }
  
  return context;
};