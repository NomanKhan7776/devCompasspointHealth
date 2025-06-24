// Fixed AdminContext.jsx - Added missing deleteUser function and SmartToken Logs

import React, { useState, useCallback } from "react";
import { usersAPI, assignmentsAPI, blobsAPI, smartTokenAPI } from "../api";
import { AdminContext } from "../hooks/useAdmin.js";

export const AdminProvider = ({ children }) => {
  // User management data
  const [users, setUsers] = useState([]);

  // Container management data
  const [containers, setContainers] = useState([]);
  const [containerFolders, setContainerFolders] = useState({});

  // Audit logs
  const [auditLogs, setAuditLogs] = useState([]);

  // SmartToken logs
  const [smartTokenLogs, setSmartTokenLogs] = useState([]);
  const [smartTokenLogsPagination, setSmartTokenLogsPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    limit: 50,
  });

  // Loading and error states
  const [loading, setLoading] = useState({
    users: false,
    containers: false,
    folders: false,
    auditLogs: false,
    smartTokenLogs: false,
  });
  const [lastFetched, setLastFetched] = useState({
    users: null,
    containers: null,
    folders: {},
    auditLogs: null,
    smartTokenLogs: null,
  });
  const [error, setError] = useState({
    users: "",
    containers: "",
    folders: "",
    auditLogs: "",
    smartTokenLogs: "",
  });

  // Fetch users with assignments
  const fetchUsers = useCallback(
    async (forceRefresh = false) => {
      if (!localStorage.getItem("token")) {
        return [];
      }

      const dataAge = lastFetched.users
        ? (new Date() - lastFetched.users) / 1000 / 60
        : 999;
      if (users.length > 0 && dataAge < 5 && !forceRefresh) {
        return users;
      }

      try {
        setLoading((prev) => ({ ...prev, users: true }));
        setError((prev) => ({ ...prev, users: "" }));

        const res = await usersAPI.getUsersWithAssignments();
        const userData = res.data.users || [];

        setUsers(userData);
        setLastFetched((prev) => ({ ...prev, users: new Date() }));
        setLoading((prev) => ({ ...prev, users: false }));

        return userData;
      } catch (err) {
        setError((prev) => ({ ...prev, users: "Failed to load users" }));
        console.error(err);
        setLoading((prev) => ({ ...prev, users: false }));
        return [];
      }
    },
    [users, lastFetched.users]
  );

  // ADD: Missing deleteUser function
  const deleteUser = useCallback(
    async (userId) => {
      try {
        setLoading((prev) => ({ ...prev, users: true }));
        setError((prev) => ({ ...prev, users: "" }));

        // Call API to delete user
        await usersAPI.deleteUser(userId);

        // Remove user from local state
        setUsers((prevUsers) =>
          prevUsers.filter((user) => user.userId !== userId)
        );

        // Optionally refresh the users list to ensure consistency
        await fetchUsers(true);

        return { success: true };
      } catch (err) {
        const errorMessage =
          err.response?.data?.message || "Failed to delete user";
        setError((prev) => ({ ...prev, users: errorMessage }));
        console.error("Delete user error:", err);
        throw err;
      } finally {
        setLoading((prev) => ({ ...prev, users: false }));
      }
    },
    [fetchUsers]
  );

  // Fetch containers
  const fetchContainers = useCallback(
    async (forceRefresh = false) => {
      const dataAge = lastFetched.containers
        ? (new Date() - lastFetched.containers) / 1000 / 60
        : 999;
      if (containers.length > 0 && dataAge < 5 && !forceRefresh) {
        return containers;
      }

      try {
        setLoading((prev) => ({ ...prev, containers: true }));
        setError((prev) => ({ ...prev, containers: "" }));

        const res = await assignmentsAPI.getAllContainers();
        const containerData = res.data.containers || [];

        setContainers(containerData);
        setLastFetched((prev) => ({ ...prev, containers: new Date() }));
        setLoading((prev) => ({ ...prev, containers: false }));

        return containerData;
      } catch (err) {
        setError((prev) => ({
          ...prev,
          containers: "Failed to load containers",
        }));
        console.error(err);
        setLoading((prev) => ({ ...prev, containers: false }));
        return [];
      }
    },
    [containers, lastFetched.containers]
  );

  // Fetch folders for a specific container
  const fetchFolders = useCallback(
    async (containerName, forceRefresh = false) => {
      const dataAge = lastFetched.folders[containerName]
        ? (new Date() - lastFetched.folders[containerName]) / 1000 / 60
        : 999;
      if (containerFolders[containerName] && dataAge < 5 && !forceRefresh) {
        return containerFolders[containerName];
      }

      try {
        setLoading((prev) => ({ ...prev, folders: true }));
        setError((prev) => ({ ...prev, folders: "" }));

        const res = await assignmentsAPI.getFolders(containerName);
        const folderData = res.data.folders || [];

        setContainerFolders((prev) => ({
          ...prev,
          [containerName]: folderData,
        }));
        setLastFetched((prev) => ({
          ...prev,
          folders: { ...prev.folders, [containerName]: new Date() },
        }));
        setLoading((prev) => ({ ...prev, folders: false }));

        return folderData;
      } catch (err) {
        setError((prev) => ({ ...prev, folders: "Failed to load folders" }));
        console.error(err);
        setLoading((prev) => ({ ...prev, folders: false }));
        return [];
      }
    },
    [containerFolders, lastFetched.folders]
  );

  // Fetch audit logs
  const fetchAuditLogs = useCallback(
    async (forceRefresh = false) => {
      const dataAge = lastFetched.auditLogs
        ? (new Date() - lastFetched.auditLogs) / 1000 / 60
        : 999;
      if (auditLogs.length > 0 && dataAge < 2 && !forceRefresh) {
        // Only cache for 2 minutes
        return auditLogs;
      }

      try {
        setLoading((prev) => ({ ...prev, auditLogs: true }));
        setError((prev) => ({ ...prev, auditLogs: "" }));

        const res = await blobsAPI.getAuditLogs();
        const logs = res.data.auditLogs || [];

        setAuditLogs(logs);
        setLastFetched((prev) => ({ ...prev, auditLogs: new Date() }));
        setLoading((prev) => ({ ...prev, auditLogs: false }));

        return logs;
      } catch (err) {
        setError((prev) => ({
          ...prev,
          auditLogs: "Failed to load audit logs",
        }));
        console.error(err);
        setLoading((prev) => ({ ...prev, auditLogs: false }));
        return [];
      }
    },
    [auditLogs, lastFetched.auditLogs]
  );

  // Fetch SmartToken logs
  const fetchSmartTokenLogs = useCallback(
    async (page = 1, limit = 50, forceRefresh = false) => {
      if (!localStorage.getItem("token")) {
        return [];
      }

      // Don't cache if different page/limit requested
      const isSamePage = page === smartTokenLogsPagination.currentPage && limit === smartTokenLogsPagination.limit;
      const dataAge = lastFetched.smartTokenLogs
        ? (new Date() - lastFetched.smartTokenLogs) / 1000 / 60
        : 999;
      
      if (smartTokenLogs.length > 0 && dataAge < 2 && !forceRefresh && isSamePage) {
        return smartTokenLogs;
      }

      try {
        setLoading((prev) => ({ ...prev, smartTokenLogs: true }));
        setError((prev) => ({ ...prev, smartTokenLogs: "" }));

        const offset = (page - 1) * limit;
        const res = await smartTokenAPI.getSmartTokenLogs({
          limit,
          offset,
        });
        
        const logs = res.data.logs || [];
        const pagination = res.data.pagination || {};

        setSmartTokenLogs(logs);
        setSmartTokenLogsPagination({
          currentPage: page,
          totalPages: Math.ceil(pagination.total / limit) || 1,
          totalCount: pagination.total || 0,
          limit,
        });
        setLastFetched((prev) => ({ ...prev, smartTokenLogs: new Date() }));
        setLoading((prev) => ({ ...prev, smartTokenLogs: false }));

        return logs;
      } catch (err) {
        setError((prev) => ({
          ...prev,
          smartTokenLogs: "Failed to load SmartToken logs",
        }));
        console.error(err);
        setLoading((prev) => ({ ...prev, smartTokenLogs: false }));
        return [];
      }
    },
    [smartTokenLogs, lastFetched.smartTokenLogs, smartTokenLogsPagination]
  );

  // Clear specific cache entry
  const clearCache = useCallback((type) => {
    switch (type) {
      case "users":
        setUsers([]);
        setLastFetched((prev) => ({ ...prev, users: null }));
        break;
      case "containers":
        setContainers([]);
        setLastFetched((prev) => ({ ...prev, containers: null }));
        break;
      case "folders":
        setContainerFolders({});
        setLastFetched((prev) => ({ ...prev, folders: {} }));
        break;
      case "auditLogs":
        setAuditLogs([]);
        setLastFetched((prev) => ({ ...prev, auditLogs: null }));
        break;
      case "smartTokenLogs":
        setSmartTokenLogs([]);
        setSmartTokenLogsPagination({
          currentPage: 1,
          totalPages: 1,
          totalCount: 0,
          limit: 50,
        });
        setLastFetched((prev) => ({ ...prev, smartTokenLogs: null }));
        break;
      case "all":
        setUsers([]);
        setContainers([]);
        setContainerFolders({});
        setAuditLogs([]);
        setSmartTokenLogs([]);
        setSmartTokenLogsPagination({
          currentPage: 1,
          totalPages: 1,
          totalCount: 0,
          limit: 50,
        });
        setLastFetched({
          users: null,
          containers: null,
          folders: {},
          auditLogs: null,
          smartTokenLogs: null,
        });
        break;
      default:
        break;
    }
  }, []);

  const value = {
    // Data
    users,
    containers,
    containerFolders,
    auditLogs,
    smartTokenLogs,
    smartTokenLogsPagination,

    // Loading states
    loading,
    lastFetched,
    error,

    // Actions
    fetchUsers,
    deleteUser, // ADD: Include deleteUser in the context value
    fetchContainers,
    fetchFolders,
    fetchAuditLogs,
    fetchSmartTokenLogs,
    clearCache,
  };

  return (
    <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
  );
};