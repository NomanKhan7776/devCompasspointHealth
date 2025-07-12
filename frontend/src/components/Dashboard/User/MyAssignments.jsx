import React, { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAssignments } from "../../../hooks/useAssignments";
import Loader from "../../common/Loader";
import Alert from "../../common/Alert";

const MyAssignments = () => {
  const {
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
  } = useAssignments();

  // Only fetch if data hasn't been loaded yet
  useEffect(() => {
    const loadData = async () => {
      // Check if user has assignments before fetching detailed data
      const userHasAssignments = await checkHasAssignments();
      if (userHasAssignments) {
        await fetchAssignments();
      }
    };

    loadData();
  }, [checkHasAssignments, fetchAssignments]);

  // Memoize calculations to prevent unnecessary recalculations
  const containerCount = useMemo(
    () => assignmentsData.length,
    [assignmentsData]
  );

  const folderCount = useMemo(
    () =>
      assignmentsData.reduce(
        (total, container) => total + container.folders.length,
        0
      ),
    [assignmentsData]
  );

  const handleRefresh = () => {
    fetchAssignments(true); // Force refresh
  };

  // Only show loading indicator if we're actually loading and user might have assignments
  if (loading && hasAssignments !== false) return <Loader size="large" />;
  if (error) return <Alert message={error} type="error" />;

  return (
    <div>
      <div className="flex justify-between items-center mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
          My Assignments Dashboard
        </h1>

        {hasAssignments && (
          <div className="flex items-center">
            {lastFetched && (
              <span className="text-xs text-gray-500 mr-2">
                Last updated: {new Date(lastFetched).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={handleRefresh}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 py-1 px-3 rounded flex items-center"
              disabled={loading || loadingStats}
            >
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-gray-800 mb-2">
            Assigned Containers
          </h2>
          <p className="text-2xl sm:text-3xl font-bold text-blue-600">
            {containerCount}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-gray-800 mb-2">
            Patient Folders
          </h2>
          <p className="text-2xl sm:text-3xl font-bold text-green-600">
            {folderCount}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-semibold text-gray-800 mb-2">
            Total Files
          </h2>
          <div className="flex items-center">
            <p className="text-2xl sm:text-3xl font-bold text-purple-600">
              {summaryStats.totalFiles || 0}
            </p>
            {loadingStats && (
              <span className="ml-2 inline-block">
                <Loader size="small" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* File Type Statistics */}
      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-800">
            File Type Statistics
          </h2>
          {loadingStats && <Loader size="small" />}
        </div>

        {!summaryStats.fileTypes ||
        Object.keys(summaryStats.fileTypes).length === 0 ? (
          <p className="text-gray-500">
            {loadingStats
              ? "Loading file statistics..."
              : "No files found in your assigned folders."}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Object.entries(summaryStats.fileTypes)
              .sort((a, b) => b[1] - a[1]) // Sort by count (highest first)
              .map(([type, count]) => (
                <div
                  key={type}
                  className="bg-gray-50 rounded p-3 border border-gray-200"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700 uppercase text-sm">
                      .{type}
                    </span>
                    <span className="text-lg font-bold text-blue-600">
                      {count}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {Math.round((count / summaryStats.totalFiles) * 100)}% of
                    files
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Container and Folder List */}
      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-800">
            Assigned Containers & Folders
          </h2>
          {loadingStats && <Loader size="small" />}
        </div>

        {assignmentsData.length === 0 ? (
          <p className="text-gray-600">
            You don't have any assigned containers yet.
          </p>
        ) : (
          <div className="space-y-6">
            {assignmentsData.map((container) => (
              <div
                key={container.id}
                className="border border-gray-200 rounded-lg p-4"
              >
                <h3 className="text-base sm:text-lg font-medium text-gray-800 mb-3">
                  {container.containerName}
                </h3>

                <div className="space-y-3">
                  {container.folders.map((folder) => {
                    const folderKey = `${container.containerName}/${folder.folderName}`;
                    const stats = folderStats[folderKey] || {
                      totalFiles: "...",
                      fileTypes: {},
                    };
                    const isLoading =
                      loadingStats && stats.totalFiles === "...";

                    return (
                      <div
                        key={folder.id}
                        className="bg-gray-50 p-3 rounded-lg"
                      >
                        <div className="flex flex-wrap justify-between items-center mb-2">
                          <h4 className="text-sm sm:text-base font-medium text-blue-700">
                            {folder.folderName}
                          </h4>
                          <span className="text-xs bg-blue-100 text-blue-800 py-1 px-2 rounded-full">
                            {isLoading ? (
                              <span className="inline-flex items-center">
                                <Loader size="small" />
                                <span className="ml-1">Loading</span>
                              </span>
                            ) : (
                              `${stats.totalFiles} files`
                            )}
                          </span>
                        </div>

                        {!isLoading && stats.totalFiles > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(stats.fileTypes).map(
                              ([type, count]) => (
                                <span
                                  key={type}
                                  className="text-xs bg-gray-200 text-gray-700 py-1 px-2 rounded-full"
                                >
                                  {count} {type.toUpperCase()}
                                </span>
                              )
                            )}
                          </div>
                        ) : !isLoading ? (
                          <p className="text-xs text-gray-500">
                            No files in this folder
                          </p>
                        ) : (
                          <div className="h-6"></div> // Placeholder for loading
                        )}

                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <Link
                            to={`/containers/${container.containerName}/folders/${folder.folderName}`}
                            className="text-xs sm:text-sm text-blue-600 hover:text-blue-800"
                          >
                            View Files →
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyAssignments;
