import React, { useState, useCallback } from "react";
import { usersAPI } from "../api";
import { DashboardContext } from "../hooks/useDashboard";

export const DashboardProvider = ({ children }) => {
  const [dashboardData, setDashboardData] = useState({
    users: [],
    stats: {
      totalUsers: 0,
      doctors: 0,
      nurses: 0,
      assistants: 0,
      patients: 0, // FIXED: Added patients to initial state
    },
  });
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState(null);
  const [error, setError] = useState("");
  const [noUsersConfirmed, setNoUsersConfirmed] = useState(false);
  const [consecutiveEmptyResponses, setConsecutiveEmptyResponses] = useState(0);

  // Fetch dashboard data
  const fetchDashboardData = useCallback(
    async (forceRefresh = false) => {
      if (!localStorage.getItem("token")) {
        return dashboardData;
      }
      // If we have confirmed there are no users, don't make unnecessary API calls
      // unless forced to refresh
      if (noUsersConfirmed && !forceRefresh) {
        return dashboardData;
      }

      // If we have data and it's less than 5 minutes old, don't refetch unless forced
      const dataAge = lastFetched
        ? (new Date() - lastFetched) / 1000 / 60
        : 999;
      if (dashboardData.users.length > 0 && dataAge < 5 && !forceRefresh) {
        return dashboardData;
      }

      try {
        setLoading(true);
        setError("");

        const res = await usersAPI.getUsersWithAssignments();
        const users = res.data.users || [];

        // Check if there are no users and update our tracking
        if (users.length === 0) {
          setConsecutiveEmptyResponses((prev) => prev + 1);

          // After 2 consecutive empty responses, mark as confirmed
          if (consecutiveEmptyResponses >= 1) {
            setNoUsersConfirmed(true);
          }
        } else {
          // Reset our trackers if we do find users
          setConsecutiveEmptyResponses(0);
          setNoUsersConfirmed(false);
        }

        // FIXED: Calculate stats including patients
        const doctors = users.filter((user) => user.role === "doctor");
        const nurses = users.filter((user) => user.role === "nurse");
        const assistants = users.filter((user) => user.role === "assistant");
        const patients = users.filter((user) => user.role === "patient");

        const newData = {
          users,
          stats: {
            totalUsers: users.length,
            doctors: doctors.length,
            nurses: nurses.length,
            assistants: assistants.length,
            patients: patients.length, // FIXED: Added patients count
          },
        };

        setDashboardData(newData);
        setLastFetched(new Date());
        setLoading(false);

        return newData;
      } catch (err) {
        setError("Failed to load dashboard data");
        console.error(err);
        setLoading(false);
        return { error: err.message };
      }
    },
    [dashboardData, lastFetched, consecutiveEmptyResponses, noUsersConfirmed]
  );

  // Reset the no users flag - useful when a new user is added
  const resetNoUsersFlag = useCallback(() => {
    setNoUsersConfirmed(false);
    setConsecutiveEmptyResponses(0);
  }, []);

  const value = {
    dashboardData,
    loading,
    error,
    fetchDashboardData,
    lastFetched,
    noUsersConfirmed,
    resetNoUsersFlag,
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
};
