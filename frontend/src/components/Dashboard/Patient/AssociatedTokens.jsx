// components/Dashboard/Patient/AssociatedTokens.jsx - FIXED VERSION
import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { smartTokenAPI } from "../../../api"; // ✅ Import from main API file

const AssociatedTokens = ({ userRole = "patient" }) => {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedToken, setSelectedToken] = useState(null);
  const [showDeviceLogs, setShowDeviceLogs] = useState(false);
  const [deviceLogs, setDeviceLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    loadAssociatedTokens();
  }, []);

  // ✅ FIXED: Use smartTokenAPI instead of manual axios calls
  const loadAssociatedTokens = async () => {
    try {
      setLoading(true);
      console.log("🔍 Loading associated tokens...");

      // ✅ Use the API from your main index.js file
      const response = await smartTokenAPI.getMyTokens();

      console.log("✅ Tokens response:", response);

      if (response.data.success) {
        setTokens(response.data.tokens);
        console.log("✅ Tokens loaded:", response.data.tokens.length);
      } else {
        toast.error("Failed to load associated tokens");
      }
    } catch (error) {
      console.error("❌ Error loading tokens:", error);

      // More detailed error handling
      if (error.response?.status === 401) {
        toast.error("Authentication failed. Please log in again.");
      } else if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error("Failed to load associated tokens");
      }
    } finally {
      setLoading(false);
    }
  };

  // ✅ FIXED: Use smartTokenAPI for device logs
  const loadDeviceLogs = async (tokenId) => {
    try {
      setLogsLoading(true);
      console.log("🔍 Loading device logs for token:", tokenId);

      // ✅ Use the API from your main index.js file
      const response = await smartTokenAPI.getDeviceLogs(tokenId);

      console.log("✅ Device logs response:", response);

      if (response.data.success) {
        setDeviceLogs(response.data.logs);
        setShowDeviceLogs(true);
        console.log("✅ Device logs loaded:", response.data.logs.length);
      } else {
        toast.error("Failed to load device logs");
      }
    } catch (error) {
      console.error("❌ Error loading device logs:", error);

      if (error.response?.status === 401) {
        toast.error("Authentication failed. Please log in again.");
      } else if (error.response?.status === 404) {
        toast.error("Token not found or access denied");
      } else if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error("Failed to load device logs");
      }
    } finally {
      setLogsLoading(false);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  // Get status badge color
  const getStatusColor = (status) => {
    switch (status) {
      case "assigned":
        return "bg-green-100 text-green-800";
      case "revoked":
        return "bg-red-100 text-red-800";
      case "unclaimed":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-blue-100 text-blue-800";
    }
  };

  // Truncate token ID for display
  const truncateTokenId = (tokenId) => {
    if (!tokenId || tokenId.length <= 16) return tokenId;
    return `${tokenId.substring(0, 8)}...${tokenId.substring(
      tokenId.length - 8
    )}`;
  };

  // Get access type icon
  const getAccessTypeIcon = (accessType) => {
    switch (accessType) {
      case "file_view":
        return "👁️";
      case "emergency_access":
        return "🚨";
      case "device_registration":
        return "📱";
      case "unauthorized_access":
        return "⚠️";
      default:
        return "📋";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading associated tokens...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Assigned Tokens</h2>
        <button
          onClick={loadAssociatedTokens}
          disabled={loading}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {tokens.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">🏷️</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No tokens assigned
          </h3>
          <p className="text-gray-600">
            {userRole === "patient"
              ? "Contact your healthcare provider to get a SmartToken assigned to your medical records."
              : "No patients have been assigned SmartTokens under your care yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {tokens.map((token) => (
            <div
              key={token.smartTokenId}
              className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-lg">
                      {token.patientName || "Unknown Patient"}
                    </h3>
                    {token.patientDateOfBirth && (
                      <p className="text-sm text-gray-600">
                        DOB: {token.patientDateOfBirth}
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                      token.status
                    )}`}
                  >
                    {token.status}
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Token ID</p>
                      <p className="font-mono text-gray-900">
                        {truncateTokenId(token.smartTokenId)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Assigned</p>
                      <p className="text-gray-900">
                        {formatDate(token.assignedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Container</p>
                      <p className="text-gray-900 font-medium">
                        {token.containerName}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Folder</p>
                      <p className="text-gray-900 font-medium">
                        {token.folderName}
                      </p>
                    </div>
                  </div>

                  {/* Show different info based on user role */}
                  {userRole === "patient" && token.doctorName && (
                    <div className="text-sm">
                      <p className="text-gray-600">Assigned Doctor</p>
                      <p className="text-gray-900 font-medium">
                        Dr. {token.doctorName}
                      </p>
                    </div>
                  )}

                  {userRole === "doctor" && token.patientUserName && (
                    <div className="text-sm">
                      <p className="text-gray-600">Patient Account</p>
                      <p className="text-gray-900 font-medium">
                        {token.patientUserName} ({token.patientUsername})
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => loadDeviceLogs(token.smartTokenId)}
                    disabled={logsLoading}
                    className="w-full text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50"
                  >
                    {logsLoading ? "Loading..." : "View Access Logs"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Device Logs Modal */}
      {showDeviceLogs && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Device Access Logs
              </h3>
              <button
                onClick={() => setShowDeviceLogs(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="p-6 max-h-96 overflow-y-auto">
              {deviceLogs.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-4xl mb-4">📋</div>
                  <p className="text-gray-600">No access logs found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {deviceLogs.map((log, index) => (
                    <div
                      key={index}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-start space-x-3">
                          <div className="text-2xl">
                            {getAccessTypeIcon(log.accessMode)}
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">
                              {log.accessMode
                                ?.replace(/_/g, " ")
                                .toUpperCase() || "ACCESS"}
                            </h4>
                            <div className="text-sm text-gray-600 space-y-1">
                              <p>Time: {formatDate(log.accessTime)}</p>
                              <p>IP Address: {log.ipAddress || "Unknown"}</p>
                              <p>
                                Location: {log.containerName}/{log.folderName}
                              </p>
                              {log.deviceName &&
                                log.deviceName !== "Unknown" && (
                                  <p>
                                    Device: {log.deviceName} ({log.deviceType})
                                  </p>
                                )}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            log.deviceIsActive
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {log.deviceIsActive
                            ? "Active Device"
                            : "Unknown Device"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200">
              <button
                onClick={() => setShowDeviceLogs(false)}
                className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssociatedTokens;
