import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../hooks/useAuth.js";
import { useAssignments } from "../../../hooks/useAssignments.js";
import Loader from "../../common/Loader";
import Alert from "../../common/Alert";

const UserDashboard = () => {
  const { currentUser } = useAuth();
  const { assignmentsData, loading, error, fetchAssignments, lastFetched } =
    useAssignments();

  // Ref to track if initial load happened
  const initialLoadDone = useRef(false);

  useEffect(() => {
    // Only fetch once when the component mounts
    if (currentUser && !initialLoadDone.current) {
      fetchAssignments(true);
      initialLoadDone.current = true;
    }

    // Cleanup function
    return () => {
      // Component unmounted
    };
  }, [currentUser]); // Remove fetchAssignments from dependencies

  // Handle manual refresh
  const handleRefresh = () => {
    fetchAssignments(true); // Force refresh
  };

  if (loading && !initialLoadDone.current) return <Loader size="large" />;
  if (error) return <Alert message={error} type="error" />;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Welcome, {currentUser.name}
        </h1>

        <div className="flex items-center">
          {lastFetched && (
            <span className="text-xs text-gray-500 mr-2">
              Last updated: {new Date(lastFetched).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleRefresh}
            className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 py-1 px-3 rounded flex items-center"
            disabled={loading}
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Containers
          </h2>
          <p className="text-3xl font-bold text-blue-600">
            {assignmentsData.length}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Patient Folders
          </h2>
          <p className="text-3xl font-bold text-green-600">
            {assignmentsData.reduce(
              (total, container) => total + container.folders.length,
              0
            )}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Role</h2>
          <p className="text-3xl font-bold text-purple-600">
            {currentUser.role.charAt(0).toUpperCase() +
              currentUser.role.slice(1)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          Your Assigned Containers
        </h2>

        {assignmentsData.length === 0 ? (
          <p className="text-gray-600">
            You don't have any assigned containers yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assignmentsData.map((container) => (
              <div
                key={container.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <h3 className="text-lg font-medium text-gray-800 mb-2">
                  {container.containerName}
                </h3>
                <p className="text-gray-600 mb-4">
                  {container.folders.length} patient folders
                </p>
                <Link
                  to={`/containers/${container.containerName}`}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  View Details →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserDashboard;
