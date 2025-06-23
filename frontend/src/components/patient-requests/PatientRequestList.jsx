// Responsive PatientRequestList.jsx - Replace your existing component with this:

import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { usePatientRequests } from "../../hooks/usePatientRequests";
import Button from "../common/Button";
import Alert from "../common/Alert";
import Loader from "../common/Loader";

const PatientRequestList = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { requests, loading, error, fetchRequests } = usePatientRequests();

  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [filteredRequests, setFilteredRequests] = useState([]);

  const isAdmin = currentUser?.role === "admin";
  const isDoctor = currentUser?.role === "doctor";

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Filter requests based on search and tab
  useEffect(() => {
    let filtered = requests || [];

    // Filter by status
    if (activeTab !== "all") {
      filtered = filtered.filter((req) => req.requestStatus === activeTab);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((req) => {
        return Object.values(req).some(
          (value) =>
            typeof value === "string" && value.toLowerCase().includes(term)
        );
      });
    }

    setFilteredRequests(filtered);
  }, [requests, activeTab, searchTerm]);

  const handleRefresh = async () => {
    await fetchRequests(true);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "approved":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusCounts = () => {
    return {
      all: requests?.length || 0,
      pending:
        requests?.filter((r) => r.requestStatus === "pending").length || 0,
      approved:
        requests?.filter((r) => r.requestStatus === "approved").length || 0,
      rejected:
        requests?.filter((r) => r.requestStatus === "rejected").length || 0,
    };
  };

  const statusCounts = getStatusCounts();

  if (!isAdmin && !isDoctor) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            You do not have permission to view patient requests.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Patient Requests
            </h1>
            <p className="text-gray-600">
              {isAdmin
                ? "Review and approve/reject patient requests from doctors"
                : "View and manage your patient requests"}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleRefresh}
              disabled={loading}
              color="gray"
              className="w-full sm:w-auto"
            >
              {loading ? "Loading..." : "Refresh"}
            </Button>
            {isDoctor && (
              <Button
                as={Link}
                to="/patient-requests/create"
                className="w-full sm:w-auto"
              >
                New Request
              </Button>
            )}
          </div>
        </div>
      </div>

      {error && <Alert type="error" message={error} className="mb-6" />}

      {/* Tabs and Search */}
      <div className="mb-6 space-y-4">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 overflow-x-auto">
            {[
              { key: "all", label: "All", count: statusCounts.all },
              { key: "pending", label: "Pending", count: statusCounts.pending },
              {
                key: "approved",
                label: "Approved",
                count: statusCounts.approved,
              },
              {
                key: "rejected",
                label: "Rejected",
                count: statusCounts.rejected,
              },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === tab.key
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      activeTab === tab.key
                        ? "bg-blue-100 text-blue-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Search */}
        <div>
          <input
            type="text"
            placeholder="Search requests..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Content */}
      {loading && requests?.length === 0 ? (
        <div className="text-center py-12">
          <Loader size="large" />
          <p className="mt-2 text-gray-600">Loading requests...</p>
        </div>
      ) : filteredRequests.length === 0 ? (
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            No requests found
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm || activeTab !== "all"
              ? "Try adjusting your search criteria"
              : isAdmin
              ? "No patient requests submitted by doctors yet"
              : "No patient requests found"}
          </p>
          {isDoctor && !isAdmin && activeTab === "all" && !searchTerm && (
            <Link
              to="/patient-requests/create"
              className="mt-4 inline-block text-blue-600 hover:text-blue-700"
            >
              Create your first request
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Mobile Card Layout (md and below) */}
          <div className="block lg:hidden space-y-4">
            {filteredRequests.map((request) => (
              <div
                key={request.requestId}
                className="bg-white rounded-lg shadow-md p-4 border"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {request.patientName}
                    </h3>
                    <p className="text-sm text-gray-500 truncate">
                      {request.patientEmail}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                      request.requestStatus
                    )}`}
                  >
                    {request.requestStatus}
                  </span>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-sm text-gray-600">
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
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5 0H9m0 0H5m4 0v-4a1 1 0 011-1h4a1 1 0 011 1v4M7 7h10M7 11h4"
                      />
                    </svg>
                    {request.containerName}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
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
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                    {request.folderName}
                  </div>
                  {isAdmin && request.doctorName && (
                    <div className="flex items-center text-sm text-gray-600">
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
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                      Dr. {request.doctorName}
                    </div>
                  )}
                  <div className="flex items-center text-sm text-gray-600">
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
                        d="M8 7V3a4 4 0 118 0v4m-4 5v5a4 4 0 004 4H6a4 4 0 004-4v-5m4-5V3a4 4 0 00-8 0v4m4 1v4"
                      />
                    </svg>
                    {formatDate(request.requestDate)}
                  </div>
                </div>

                <Button
                  as={Link}
                  to={`/patient-requests/${request.requestId}`}
                  size="sm"
                  className="w-full"
                >
                  View Details
                </Button>
              </div>
            ))}
          </div>

          {/* Desktop Table Layout (lg and above) */}
          <div className="hidden lg:block bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Patient Info
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Container/Folder
                    </th>
                    {isAdmin && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Doctor
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRequests.map((request) => (
                    <tr key={request.requestId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {request.patientName}
                          </div>
                          <div className="text-sm text-gray-500">
                            {request.patientEmail}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {request.containerName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {request.folderName}
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {request.doctorName || "N/A"}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                            request.requestStatus
                          )}`}
                        >
                          {request.requestStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(request.requestDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <Button
                          as={Link}
                          to={`/patient-requests/${request.requestId}`}
                          size="sm"
                          color="blue"
                        >
                          View Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PatientRequestList;
