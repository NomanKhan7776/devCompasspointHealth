// src/components/Dashboard/Patient/MySmartTokens.jsx - Patient's SmartToken Dashboard
import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { smartTokenAPI } from "../../../api";
import Loader from "../../common/Loader";
import Alert from "../../common/Alert";
import Modal from "../../common/Modal";
import Button from "../../common/Button";

const MySmartTokens = () => {
  const [tokens, setTokens] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [deviceLogs, setDeviceLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedToken, setSelectedToken] = useState(null);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadTokens(), loadAlerts()]);
    } catch (error) {
      console.error("Error loading data:", error);
      setError("Failed to load SmartToken data");
    } finally {
      setLoading(false);
    }
  };

  const loadTokens = async () => {
    try {
      const response = await smartTokenAPI.getMyTokens();
      if (response.data.success) {
        setTokens(response.data.tokens || []);
      }
    } catch (error) {
      console.error("Error loading tokens:", error);
    }
  };

  const loadAlerts = async () => {
    try {
      const response = await smartTokenAPI.getMyAlerts();
      if (response.data.success) {
        setAlerts(response.data.alerts || []);
      }
    } catch (error) {
      console.error("Error loading alerts:", error);
    }
  };

  const loadDeviceLogs = async (tokenId) => {
    try {
      const response = await smartTokenAPI.getDeviceLogs(tokenId);
      if (response.data.success) {
        setDeviceLogs(response.data.logs || []);
      }
    } catch (error) {
      console.error("Error loading device logs:", error);
      toast.error("Failed to load device access logs");
    }
  };

  const handleViewToken = async (token) => {
    setSelectedToken(token);
    setShowTokenModal(true);
    await loadDeviceLogs(token.smartTokenId);
  };

  const handleViewLogs = async (token) => {
    setSelectedToken(token);
    await loadDeviceLogs(token.smartTokenId);
    setShowLogsModal(true);
  };

  const markAlertAsRead = async (alertId) => {
    try {
      const response = await smartTokenAPI.markAlertAsRead(alertId);
      if (response.data.success) {
        setAlerts(
          alerts.map((alert) =>
            alert.alertId === alertId ? { ...alert, isRead: true } : alert
          )
        );
        toast.success("Alert marked as read");
      }
    } catch (error) {
      console.error("Error marking alert as read:", error);
      toast.error("Failed to mark alert as read");
    }
  };

  const getTokenStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "active":
      case "assigned": // ADDED: Treat "assigned" same as "active"
        return "bg-green-100 text-green-800 border-green-200";
      case "inactive":
      case "revoked": // ADDED: Handle "revoked" status
        return "bg-red-100 text-red-800 border-red-200";
      case "pending":
      case "unclaimed": // ADDED: Handle "unclaimed" status
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTimeAgo = (dateString) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDateTime(dateString);
  };

  // Calculate statistics
  const stats = {
    totalTokens: tokens.length,
    activeTokens: tokens.filter(
      (t) => t.status === "active" || t.status === "assigned"
    ).length, // FIXED: Count both "active" and "assigned" tokens
    recentAlerts: alerts.filter((a) => {
      const alertDate = new Date(a.createdAt);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return alertDate > weekAgo;
    }).length,
    unreadAlerts: alerts.filter((a) => !a.isRead).length,
  };

  if (loading) return <Loader size="large" />;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">My SmartTokens</h1>
          <p className="text-gray-600 mt-1">
            View and manage your emergency medical access tokens
          </p>
        </div>
      </div>

      {error && <Alert message={error} type="error" className="mb-6" />}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Total Tokens</p>
              <p className="text-3xl font-bold text-blue-600">
                {stats.totalTokens}
              </p>
            </div>
            <div className="text-blue-600 text-3xl">🏷️</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Active Tokens</p>
              <p className="text-3xl font-bold text-green-600">
                {stats.activeTokens}
              </p>
            </div>
            <div className="text-green-600 text-3xl">✅</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Recent Alerts</p>
              <p className="text-3xl font-bold text-yellow-600">
                {stats.recentAlerts}
              </p>
            </div>
            <div className="text-yellow-600 text-3xl">⚠️</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Unread Alerts</p>
              <p className="text-3xl font-bold text-red-600">
                {stats.unreadAlerts}
              </p>
            </div>
            <div className="text-red-600 text-3xl">🔔</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-lg shadow-md mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab("overview")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "overview"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              My Tokens
            </button>
            <button
              onClick={() => setActiveTab("alerts")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "alerts"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Security Alerts{" "}
              {stats.unreadAlerts > 0 && (
                <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  {stats.unreadAlerts}
                </span>
              )}
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === "overview" && (
            <div>
              {/* SmartTokens List */}
              {tokens.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-6xl mb-4">🏷️</div>
                  <h3 className="text-lg font-medium text-gray-800 mb-2">
                    No SmartTokens Assigned
                  </h3>
                  <p className="text-gray-600">
                    Contact your healthcare provider to get a SmartToken
                    assigned to your account.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {tokens.map((token) => (
                    <div
                      key={token.smartTokenId}
                      className="bg-gray-50 rounded-lg border border-gray-200 p-6"
                    >
                      {/* Token Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <i className="fas fa-microchip text-blue-600 text-xl"></i>
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-800">
                              SmartToken
                            </h3>
                            <p className="text-sm text-gray-600 font-mono">
                              {token.smartTokenId.substring(0, 8)}...
                            </p>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full border ${getTokenStatusColor(
                            token.status
                          )}`}
                        >
                          {token.status?.toUpperCase() || "UNKNOWN"}
                        </span>
                      </div>

                      {/* Token Details */}
                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Assigned Files:</span>
                          <span className="font-medium text-gray-800">
                            {token.assignedContainer && token.assignedFolder
                              ? "Yes"
                              : "No"}
                          </span>
                        </div>
                        {token.assignedContainer && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Container:</span>
                            <span className="font-medium text-gray-800">
                              {token.assignedContainer}
                            </span>
                          </div>
                        )}
                        {token.assignedFolder && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Folder:</span>
                            <span className="font-medium text-gray-800">
                              {token.assignedFolder}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Created:</span>
                          <span className="font-medium text-gray-800">
                            {formatDateTime(token.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Token Actions */}
                      <div className="flex space-x-2">
                        <Button
                          onClick={() => handleViewToken(token)}
                          className="flex-1 bg-blue-100 text-blue-700 hover:bg-blue-200 text-sm"
                        >
                          View Details
                        </Button>
                        <Button
                          onClick={() => handleViewLogs(token)}
                          className="flex-1 bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm"
                        >
                          Access Logs
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "alerts" && (
            <div>
              {/* Security Alerts */}
              {alerts.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-6xl mb-4">🔒</div>
                  <h3 className="text-lg font-medium text-gray-800 mb-2">
                    No Security Alerts
                  </h3>
                  <p className="text-gray-600">
                    No unauthorized access attempts have been detected for your
                    SmartTokens.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {alerts.map((alert) => (
                    <div
                      key={alert.alertId}
                      className={`bg-white rounded-lg border p-4 ${
                        alert.isRead
                          ? "border-gray-200"
                          : "border-yellow-300 bg-yellow-50"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <i className="fas fa-exclamation-triangle text-red-600"></i>
                            <h4 className="font-semibold text-gray-800">
                              Unregistered Device Access
                            </h4>
                            {!alert.isRead && (
                              <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">
                                New
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-2">
                            Token: {alert.tokenId?.substring(0, 8)}... •{" "}
                            {getTimeAgo(alert.createdAt)}
                          </p>
                          <p className="text-sm text-gray-700">
                            Device: {alert.deviceInfo || "Unknown device"} •
                            Location:{" "}
                            {alert.locationSummary || "Unknown location"}
                          </p>
                        </div>
                        {!alert.isRead && (
                          <Button
                            onClick={() => markAlertAsRead(alert.alertId)}
                            className="bg-blue-100 text-blue-700 hover:bg-blue-200 text-sm px-3 py-1"
                          >
                            Mark Read
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Token Details Modal */}
      <Modal
        isOpen={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        title="SmartToken Details"
        size="large"
      >
        {selectedToken && (
          <div className="space-y-6">
            {/* Token Information */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-gray-800 mb-3">
                Token Information
              </h4>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-700">
                    Token ID
                  </dt>
                  <dd className="text-sm text-gray-600 font-mono">
                    {selectedToken.smartTokenId}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-700">Status</dt>
                  <dd
                    className={`text-sm font-medium ${
                      selectedToken.status === "active" ||
                      selectedToken.status === "assigned"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {selectedToken.status?.toUpperCase()}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-700">
                    Product Code
                  </dt>
                  <dd className="text-sm text-gray-600">
                    {selectedToken.productCode || "Unknown"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-700">Created</dt>
                  <dd className="text-sm text-gray-600">
                    {formatDateTime(selectedToken.createdAt)}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Assigned Files */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-gray-800 mb-3">
                Assigned Medical Files
              </h4>
              {selectedToken.assignedContainer &&
              selectedToken.assignedFolder ? (
                <dl className="space-y-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-700">
                      Container
                    </dt>
                    <dd className="text-sm text-gray-600">
                      {selectedToken.assignedContainer}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-700">
                      Folder
                    </dt>
                    <dd className="text-sm text-gray-600">
                      {selectedToken.assignedFolder}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-gray-600">
                  No medical files have been assigned to this token yet.
                </p>
              )}
            </div>

            {/* Recent Access */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-gray-800 mb-3">
                Recent Access History
              </h4>
              {deviceLogs.length === 0 ? (
                <p className="text-sm text-gray-600">
                  No access history available.
                </p>
              ) : (
                <div className="space-y-2">
                  {deviceLogs.slice(0, 5).map((log, index) => (
                    <div
                      key={index}
                      className="flex justify-between items-center text-sm"
                    >
                      <span className="text-gray-700">
                        {log.deviceType || "Unknown"} device •{" "}
                        {log.deviceName || "Unregistered"}
                      </span>
                      <span className="text-gray-500">
                        {getTimeAgo(log.accessTime)}
                      </span>
                    </div>
                  ))}
                  {deviceLogs.length > 5 && (
                    <button
                      onClick={() => handleViewLogs(selectedToken)}
                      className="text-blue-600 hover:text-blue-700 text-sm"
                    >
                      View all access logs →
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => setShowTokenModal(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800"
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Device Logs Modal */}
      <Modal
        isOpen={showLogsModal}
        onClose={() => setShowLogsModal(false)}
        title="Device Access Logs"
        size="large"
      >
        {selectedToken && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-800">
                Access logs for Token:{" "}
                {selectedToken.smartTokenId.substring(0, 8)}...
              </h4>
            </div>

            {deviceLogs.length === 0 ? (
              <p className="text-center text-gray-600 py-8">
                No access logs available.
              </p>
            ) : (
              <div className="space-y-3">
                {deviceLogs.map((log, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <i
                            className={`fas ${
                              log.isRegisteredDevice
                                ? "fa-check-circle text-green-600"
                                : "fa-exclamation-triangle text-red-600"
                            }`}
                          ></i>
                          <span className="font-medium text-gray-800">
                            {log.deviceName || "Unknown Device"}
                          </span>
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              log.isRegisteredDevice
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {log.isRegisteredDevice
                              ? "Registered"
                              : "Unregistered"}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {log.deviceType} • {log.accessMode || "Unknown mode"}
                        </p>
                        <p className="text-sm text-gray-600">
                          IP: {log.ipAddress} • {formatDateTime(log.accessTime)}
                        </p>
                      </div>
                      {log.alertsSent && (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                          Alerts Sent
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={() => setShowLogsModal(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800"
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MySmartTokens;
