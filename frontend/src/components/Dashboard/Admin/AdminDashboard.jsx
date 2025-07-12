// Complete AdminDashboard.jsx with Patients support

import React, { useEffect } from "react";
import { useDashboard } from "../../../hooks/useDashboard";
import Loader from "../../common/Loader";
import Alert from "../../common/Alert";

const AdminDashboard = () => {
  const {
    dashboardData,
    loading,
    error,
    fetchDashboardData,
    lastFetched,
    noUsersConfirmed,
  } = useDashboard();

  useEffect(() => {
    // Don't fetch if we've confirmed there are no users
    if (!noUsersConfirmed) {
      fetchDashboardData();
    }
  }, [fetchDashboardData, noUsersConfirmed]);

  const handleRefresh = () => {
    fetchDashboardData(true); // Force refresh
  };

  if (loading) return <Loader size="large" />;
  if (error) return <Alert message={error} type="error" />;

  const { users } = dashboardData;
  const { totalUsers, doctors, nurses, assistants, patients } =
    dashboardData.stats;

  return (
    <div>
      <div className="flex justify-between items-center mb-4 sm:mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>

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

      {/* UPDATED: 5-column grid for all user types */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Total Users
          </h2>
          <p className="text-3xl font-bold text-blue-600">{totalUsers}</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Doctors</h2>
          <p className="text-3xl font-bold text-green-600">{doctors}</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Nurses</h2>
          <p className="text-3xl font-bold text-purple-600">{nurses}</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Assistants
          </h2>
          <p className="text-3xl font-bold text-orange-600">{assistants}</p>
        </div>

        {/* NEW: Patients card */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Patients</h2>
          <p className="text-3xl font-bold text-indigo-600">{patients}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          {users.length > 0 ? "Recent Users" : "No Users in System"}
        </h2>

        {users.length > 0 ? (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Username
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Containers
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.slice(0, 5).map((user) => (
                  <tr key={user.userId}>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.name}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.username}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${
                          user.role === "doctor"
                            ? "bg-green-100 text-green-800"
                            : user.role === "nurse"
                            ? "bg-purple-100 text-purple-800"
                            : user.role === "assistant"
                            ? "bg-orange-100 text-orange-800"
                            : user.role === "patient"
                            ? "bg-indigo-100 text-indigo-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.containerAssignments?.length || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-gray-600">
              There are currently no users in the system.
            </p>
            <p className="text-gray-500 mt-2">
              Create a new user from the Users menu to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
