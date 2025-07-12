import React, { useState, useCallback, useEffect, useRef } from "react";
import { assignmentsAPI, blobsAPI } from "../api";
import { AssignmentsContext } from "../hooks/useAssignments";
import { useAuth } from "../hooks/useAuth";

export const AssignmentsProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [assignmentsData, setAssignmentsData] = useState([]);
  const [folderStats, setFolderStats] = useState({});
  const [summaryStats, setSummaryStats] = useState({
    totalFiles: 0,
    fileTypes: {},
    containerCount: 0,
    folderCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [lastFetched, setLastFetched] = useState(null);
  const [error, setError] = useState("");
  const [hasAssignments, setHasAssignments] = useState(null);
  
  // Use refs to track ongoing requests
  const isFetchingRef = useRef(false);
  const isCheckingRef = useRef(false);
  const isStatsFetchingRef = useRef(false);

  // Reset data when user changes
  useEffect(() => {
    // Clear all state when user changes or becomes null
    setAssignmentsData([]);
    setFolderStats({});
    setSummaryStats({
      totalFiles: 0,
      fileTypes: {},
      containerCount: 0,
      folderCount: 0,
    });
    setLastFetched(null);
    setHasAssignments(null);
    setError("");
  }, [currentUser?.id]);

  // Helper to get file extension
  const getFileExtension = (filename) => {
    return (
      filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2) || "none"
    );
  };

  // Function to check if user has any assignments (lightweight)
  const checkHasAssignments = useCallback(async () => {
    // Don't make API calls if there's no token or no user
    if (!localStorage.getItem("token") || !currentUser) {
      setHasAssignments(false);
      return false;
    }

    // Skip if we already know and assignments data is fresh
    if (hasAssignments !== null && assignmentsData.length > 0) {
      return hasAssignments;
    }

    // Prevent concurrent calls
    if (isCheckingRef.current) {
      return hasAssignments;
    }

    isCheckingRef.current = true;

    try {
      setLoading(true);

      // Make API call to check assignments
      const assignmentsRes = await assignmentsAPI.getMyAssignments();
      const assignments = assignmentsRes.data.assignments || [];

      // Set the flag based on whether assignments exist
      const hasAny = assignments.length > 0;
      setHasAssignments(hasAny);

      // If there are assignments, also store them to avoid duplicate calls
      if (hasAny) {
        setAssignmentsData(assignments);
        setLastFetched(new Date());

        // Calculate initial counts
        const containerCount = assignments.length;
        const folderCount = assignments.reduce(
          (total, container) => total + container.folders.length,
          0
        );

        // Update summary with initial counts
        setSummaryStats((prev) => ({
          ...prev,
          containerCount,
          folderCount,
        }));
      } else {
        // Ensure data is cleared if no assignments
        setAssignmentsData([]);
        setSummaryStats({
          totalFiles: 0,
          fileTypes: {},
          containerCount: 0,
          folderCount: 0,
        });
      }

      setLoading(false);
      isCheckingRef.current = false;
      return hasAny;
    } catch (err) {
      console.error("Failed to check assignments:", err);
      setLoading(false);
      isCheckingRef.current = false;
      return false;
    }
  }, [currentUser, hasAssignments, assignmentsData.length]);

  // Initialize exactly once on component mount
  useEffect(() => {
    if (currentUser && !lastFetched) {
      checkHasAssignments();
    }
  }, [currentUser, checkHasAssignments, lastFetched]);

  // Fetch assignments data
  const fetchAssignments = useCallback(
    async (forceRefresh = false) => {
      // Don't fetch if no token or no user
      if (!localStorage.getItem("token") || !currentUser) {
        return { assignmentsData: [], summaryStats, folderStats };
      }
      
      // Prevent concurrent calls
      if (isFetchingRef.current && !forceRefresh) {
        return { assignmentsData, summaryStats, folderStats };
      }
      
      // If we have data and it's less than 5 minutes old, don't refetch unless forced
      const dataAge = lastFetched
        ? (new Date() - lastFetched) / 1000 / 60
        : 999;
      if (assignmentsData.length > 0 && dataAge < 5 && !forceRefresh) {
        return { assignmentsData, summaryStats, folderStats };
      }

      isFetchingRef.current = true;

      try {
        setLoading(true);
        setError("");

        // Get user assignments
        const assignmentsRes = await assignmentsAPI.getMyAssignments();
        const assignments = assignmentsRes.data.assignments || [];
        
        // Ensure we're setting data for the current user
        if (currentUser) {
          setAssignmentsData(assignments);
          
          // Update the hasAssignments flag
          setHasAssignments(assignments.length > 0);

          // Calculate initial counts
          const containerCount = assignments.length;
          const folderCount = assignments.reduce(
            (total, container) => total + container.folders.length,
            0
          );

          // Update summary with initial counts
          setSummaryStats((prev) => ({
            ...prev,
            containerCount,
            folderCount,
          }));

          setLastFetched(new Date());

          // Only fetch stats if there are assignments and stats weren't fetched recently
          if (assignments.length > 0 && forceRefresh) {
            fetchFileStats(assignments);
          }
        }

        setLoading(false);
        isFetchingRef.current = false;
        
        return { assignmentsData: assignments, summaryStats, folderStats };
      } catch (err) {
        setError("Failed to load assignments data");
        console.error(err);
        setLoading(false);
        isFetchingRef.current = false;
        return { error: err.message };
      }
    },
    [assignmentsData, lastFetched, folderStats, summaryStats, currentUser]
  );

  // Fetch file statistics for assignments
  const fetchFileStats = async (assignments) => {
    if (!currentUser || isStatsFetchingRef.current) return;
    
    isStatsFetchingRef.current = true;
    setLoadingStats(true);

    const stats = {};
    let totalFiles = 0;
    const aggregateFileTypes = {};

    // Process in small batches to avoid overwhelming the API
    const batchSize = 5;
    const folders = [];

    // Build a flat list of all folders
    assignments.forEach((container) => {
      container.folders.forEach((folder) => {
        folders.push({
          containerName: container.containerName,
          folderName: folder.folderName,
        });
      });
    });

    // Process folders in batches
    for (let i = 0; i < folders.length; i += batchSize) {
      const batch = folders.slice(i, i + batchSize);

      // Fetch all folders in this batch in parallel
      await Promise.all(
        batch.map(async ({ containerName, folderName }) => {
          const folderKey = `${containerName}/${folderName}`;

          try {
            const blobsRes = await blobsAPI.getBlobs(containerName, folderName);
            const blobs = blobsRes.data.blobs || [];

            // Count files by type
            const fileTypes = {};
            blobs.forEach((blob) => {
              const extension = getFileExtension(blob.name).toLowerCase();
              fileTypes[extension] = (fileTypes[extension] || 0) + 1;

              // Update aggregate counts
              totalFiles++;
              aggregateFileTypes[extension] =
                (aggregateFileTypes[extension] || 0) + 1;
            });

            stats[folderKey] = {
              totalFiles: blobs.length,
              fileTypes,
            };

            // Only update if user is still logged in
            if (currentUser) {
              // Update stats incrementally to show progress
              setFolderStats((prevStats) => ({
                ...prevStats,
                [folderKey]: { totalFiles: blobs.length, fileTypes },
              }));

              setSummaryStats((prev) => ({
                ...prev,
                totalFiles,
                fileTypes: aggregateFileTypes,
              }));
            }
          } catch (err) {
            console.error(`Error fetching blobs for ${folderKey}:`, err);
            stats[folderKey] = { totalFiles: 0, fileTypes: {} };
          }
        })
      );

      // Small delay to prevent overwhelming the server
      if (i + batchSize < folders.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    setLoadingStats(false);
    isStatsFetchingRef.current = false;
  };

  const value = {
    assignmentsData,
    folderStats,
    summaryStats,
    loading,
    loadingStats,
    error,
    fetchAssignments,
    lastFetched,
    hasAssignments,
    checkHasAssignments,
  };

  return (
    <AssignmentsContext.Provider value={value}>
      {children}
    </AssignmentsContext.Provider>
  );
};