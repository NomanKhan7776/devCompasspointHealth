// Fully Responsive UserList.jsx with beautiful action buttons and mobile cards

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAdmin } from "../../../hooks/useAdmin";
import Button from "../../common/Button";
import Alert from "../../common/Alert";
import Loader from "../../common/Loader";
import Modal from "../../common/Modal";

const UserList = () => {
  const { users, loading, error, fetchUsers, deleteUser } = useAdmin();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleDeleteClick = (user) => {
    setUserToDelete(user);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;

    try {
      setDeleteLoading(true);
      await deleteUser(userToDelete.userId);
      setDeleteModalOpen(false);
      setUserToDelete(null);
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  // Action Button Component
  const ActionButton = ({ to, onClick, color, icon, children, title }) => {
    const baseClasses =
      "inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md focus:outline-none focus:ring-2 transition-colors duration-200";

    const colorClasses = {
      blue: "text-blue-700 bg-blue-100 hover:bg-blue-200 focus:ring-blue-500",
      green:
        "text-green-700 bg-green-100 hover:bg-green-200 focus:ring-green-500",
      red: "text-red-700 bg-red-100 hover:bg-red-200 focus:ring-red-500",
    };

    const className = `${baseClasses} ${colorClasses[color]}`;

    if (to) {
      return (
        <Link to={to} className={className} title={title}>
          {icon}
          <span className="hidden sm:inline ml-1">{children}</span>
        </Link>
      );
    }

    return (
      <button onClick={onClick} className={className} title={title}>
        {icon}
        <span className="hidden sm:inline ml-1">{children}</span>
      </button>
    );
  };

  // Icons
  const EditIcon = () => (
    <svg
      className="w-3 h-3"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );

  const AssignIcon = () => (
    <svg
      className="w-3 h-3"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    </svg>
  );

  const DeleteIcon = () => (
    <svg
      className="w-3 h-3"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );

  if (loading.users) return <Loader size="large" />;

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            User Management
          </h1>
          <p className="text-gray-600">Manage system users and their roles</p>
        </div>
        <Link to="/users/create">
          <Button color="blue" className="w-full sm:w-auto">
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            Add New User
          </Button>
        </Link>
      </div>

      {/* Show error if exists */}
      {error.users && <Alert message={error.users} type="error" />}

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Search users by name, username, or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <svg
            className="absolute left-3 top-3.5 h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Mobile Cards (sm and below) */}
      <div className="block lg:hidden space-y-4">
        {filteredUsers.map((user) => (
          <div
            key={user.userId}
            className="bg-white rounded-lg shadow-md p-4 border border-gray-200"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center">
                <div className="h-12 w-12 rounded-full bg-gray-300 flex items-center justify-center mr-3">
                  <span className="text-lg font-medium text-gray-700">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    {user.name}
                  </h3>
                  <p className="text-sm text-gray-500">{user.username}</p>
                </div>
              </div>
              <span
                className={`px-2 py-1 text-xs font-semibold rounded-full ${getRoleColor(
                  user.role
                )}`}
              >
                {user.role}
              </span>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Assignments:</span>{" "}
                {user.containerAssignments?.length > 0 ? (
                  <span className="text-green-600 font-medium">
                    {user.containerAssignments.length} container(s)
                  </span>
                ) : (
                  <span className="text-gray-400">No assignments</span>
                )}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <ActionButton
                to={`/users/edit/${user.userId}`}
                color="blue"
                icon={<EditIcon />}
                title="Edit User"
              >
                Edit
              </ActionButton>
              <ActionButton
                to={`/users/assign/${user.userId}`}
                color="green"
                icon={<AssignIcon />}
                title="Assign Resources"
              >
                Assign
              </ActionButton>
              <ActionButton
                onClick={() => handleDeleteClick(user)}
                color="red"
                icon={<DeleteIcon />}
                title="Delete User"
              >
                Delete
              </ActionButton>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table (lg and above) */}
      <div className="hidden lg:block bg-white rounded-lg shadow overflow-hidden">
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
                  Assignments
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.userId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-700">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
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
                      <span className="text-green-600 font-medium">
                        {user.containerAssignments.length} container(s)
                      </span>
                    ) : (
                      <span className="text-gray-400">No assignments</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <ActionButton
                        to={`/users/edit/${user.userId}`}
                        color="blue"
                        icon={<EditIcon />}
                        title="Edit User"
                      >
                        Edit
                      </ActionButton>
                      <ActionButton
                        to={`/users/assign/${user.userId}`}
                        color="green"
                        icon={<AssignIcon />}
                        title="Assign Resources"
                      >
                        Assign
                      </ActionButton>
                      <ActionButton
                        onClick={() => handleDeleteClick(user)}
                        color="red"
                        icon={<DeleteIcon />}
                        title="Delete User"
                      >
                        Delete
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty State */}
      {filteredUsers.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            No users found
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm
              ? "Try adjusting your search criteria"
              : "Get started by creating a new user"}
          </p>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)}>
        <div className="p-6">
          <div className="flex items-center mb-4">
            <div className="flex-shrink-0">
              <svg
                className="h-6 w-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h3 className="ml-2 text-lg font-medium text-gray-900">
              Confirm Delete User
            </h3>
          </div>

          <div className="mb-4">
            <p className="text-gray-600">
              Are you sure you want to delete{" "}
              <strong>{userToDelete?.name}</strong>?
            </p>
            <p className="text-red-600 text-sm mt-2">
              This action cannot be undone and will remove all their
              assignments.
            </p>
          </div>

          <div className="flex justify-end space-x-3">
            <Button
              color="gray"
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleteLoading}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleDeleteConfirm}
              loading={deleteLoading}
            >
              {deleteLoading ? "Deleting..." : "Delete User"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UserList;
