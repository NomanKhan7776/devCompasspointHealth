// Fixed AssignmentsList.jsx - Loading state issue resolved

import React, { useEffect, useState } from "react";
import { useAdmin } from "../../../hooks/useAdmin";
import Button from "../../common/Button";
import Alert from "../../common/Alert";
import Loader from "../../common/Loader";

const AssignmentsList = () => {
  const { users, loading, error, fetchUsers } = useAdmin();
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.username.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === "all" || user.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  const getRoleColor = (role) => {
    switch (role) {
      case "admin":
        return "bg-red-100 text-red-800";
      case "doctor":
        return "bg-green-100 text-green-800";
      case "nurse":
        return "bg-purple-100 text-purple-800";
      case "assistant":
        return "bg-orange-100 text-orange-800";
      case "patient":
        return "bg-indigo-100 text-indigo-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // FIX: Check loading.users instead of loading object
  if (loading.users) return <Loader size="large" />;

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Resource Assignments
        </h1>
        <p className="text-gray-600">
          View user assignments to containers and folders
        </p>
      </div>

      {/* Show error if exists */}
      {error.users && <Alert message={error.users} type="error" />}

      {/* Filters */}
      <div className="mb-6 space-y-4 sm:space-y-0 sm:flex sm:space-x-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="sm:w-48">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="doctor">Doctor</option>
            <option value="nurse">Nurse</option>
            <option value="assistant">Assistant</option>
            <option value="patient">Patient</option>
          </select>
        </div>
      </div>

      {/* Assignments Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Container Assignments
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Folder Assignments
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Access
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.userId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {user.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {user.username}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleColor(
                        user.role
                      )}`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {user.containerAssignments?.length > 0 ? (
                      <div className="space-y-1">
                        {user.containerAssignments.map((assignment, index) => (
                          <div
                            key={index}
                            className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs inline-block mr-1 mb-1"
                          >
                            {assignment.containerName}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400">No containers</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {user.folderAssignments?.length > 0 ? (
                      <div className="space-y-1">
                        {user.folderAssignments
                          .slice(0, 3)
                          .map((assignment, index) => (
                            <div
                              key={index}
                              className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs inline-block mr-1 mb-1"
                            >
                              {assignment.folderName}
                            </div>
                          ))}
                        {user.folderAssignments.length > 3 && (
                          <div className="text-xs text-gray-500">
                            +{user.folderAssignments.length - 3} more
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">No folders</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="text-center">
                      <div className="text-lg font-semibold text-gray-900">
                        {(user.containerAssignments?.length || 0) +
                          (user.folderAssignments?.length || 0)}
                      </div>
                      <div className="text-xs text-gray-500">assignments</div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            {searchTerm || roleFilter !== "all"
              ? "No users found matching your filters."
              : "No users found."}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="mt-6 bg-gray-50 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {filteredUsers.length}
            </div>
            <div className="text-sm text-gray-500">Total Users</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {filteredUsers.reduce(
                (sum, user) => sum + (user.containerAssignments?.length || 0),
                0
              )}
            </div>
            <div className="text-sm text-gray-500">Container Assignments</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {filteredUsers.reduce(
                (sum, user) => sum + (user.folderAssignments?.length || 0),
                0
              )}
            </div>
            <div className="text-sm text-gray-500">Folder Assignments</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssignmentsList;
