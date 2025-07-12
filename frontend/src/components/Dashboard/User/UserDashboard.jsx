// components/Dashboard/User/UserDashboard.jsx - UPDATED
import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuth } from "../../../hooks/useAuth.js";
import { useAssignments } from "../../../hooks/useAssignments.js";
import { deviceAPI, smartTokenAPI } from "../../../api"; // ✅ Import APIs
import Loader from "../../common/Loader";
import Alert from "../../common/Alert";
import AssociatedTokens from "../Patient/AssociatedTokens";
import DeviceRegistration from "../Patient/DeviceRegistration";

const UserDashboard = () => {
  const { currentUser } = useAuth();
  const {
    assignmentsData,
    loading: assignmentsLoading,
    error: assignmentsError,
    fetchAssignments,
    lastFetched,
  } = useAssignments();

  const [activeSection, setActiveSection] = useState("overview");
  const [stats, setStats] = useState({
    assignedTokens: 0,
    registeredDevices: 0,
    recentAlerts: 0,
    myAssignments: 0,
  });
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);

  // Ref to track if initial load happened
  const initialLoadDone = useRef(false);

  useEffect(() => {
    // Only fetch once when the component mounts
    if (currentUser && !initialLoadDone.current) {
      fetchAssignments(true);
      initialLoadDone.current = true;
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      loadStats();
      if (currentUser.role === "doctor") {
        loadAlerts();
      }
    }
  }, [currentUser, assignmentsData]);

  // ✅ UPDATED: Load dashboard statistics using APIs
  const loadStats = async () => {
    try {
      let assignedTokens = 0;
      let registeredDevices = 0;

      // If user is a doctor, load associated tokens and devices
      if (currentUser?.role === "doctor") {
        try {
          const tokensResponse = await smartTokenAPI.getMyTokens(); // ✅ Using smartTokenAPI
          assignedTokens = tokensResponse.data.success
            ? tokensResponse.data.tokens.length
            : 0;
        } catch (error) {
          console.error("Error loading tokens:", error);
        }

        try {
          const devicesResponse = await deviceAPI.getMyDevices(); // ✅ Using deviceAPI
          registeredDevices = devicesResponse.data.success
            ? devicesResponse.data.devices.filter((d) => d.isActive).length
            : 0;
        } catch (error) {
          console.error("Error loading devices:", error);
        }
      }

      setStats({
        assignedTokens,
        registeredDevices,
        recentAlerts: 0, // Will be updated by loadAlerts
        myAssignments: assignmentsData.length || 0,
      });
    } catch (error) {
      console.error("Error loading stats:", error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ UPDATED: Load recent alerts using smartTokenAPI
  const loadAlerts = async () => {
    try {
      const response = await smartTokenAPI.getMyAlerts(); // ✅ Using smartTokenAPI

      if (response.data.success) {
        const recentAlerts = response.data.alerts.filter(
          (alert) =>
            !alert.isRead &&
            new Date(alert.createdAt) >
              new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        );
        setAlerts(recentAlerts);
        setStats((prev) => ({ ...prev, recentAlerts: recentAlerts.length }));
      }
    } catch (error) {
      console.error("Error loading alerts:", error);
    }
  };

  // ✅ UPDATED: Mark alert as read using smartTokenAPI
  const markAlertAsRead = async (alertId) => {
    try {
      await smartTokenAPI.markAlertAsRead(alertId); // ✅ Using smartTokenAPI

      loadAlerts(); // Refresh alerts
      toast.success("Alert marked as read");
    } catch (error) {
      console.error("Error marking alert as read:", error);
      toast.error("Failed to mark alert as read");
    }
  };

  // Handle manual refresh
  const handleRefresh = () => {
    fetchAssignments(true);
    loadStats();
    if (currentUser?.role === "doctor") {
      loadAlerts();
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  // Get alert type icon
  const getAlertIcon = (alertType) => {
    switch (alertType) {
      case "unauthorized_access":
        return "🚨";
      case "token_assigned":
        return "✅";
      case "emergency_alert":
        return "🆘";
      default:
        return "📢";
    }
  };

  if ((assignmentsLoading && !initialLoadDone.current) || loading) {
    return <Loader size="large" />;
  }

  if (assignmentsError) {
    return <Alert message={assignmentsError} type="error" />;
  }

  const isDoctorUser = currentUser?.role === "doctor";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className={`bg-gradient-to-r ${
          isDoctorUser
            ? "from-green-600 to-teal-600"
            : "from-blue-600 to-indigo-600"
        } rounded-lg shadow-lg p-6 text-white`}
      >
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">
              {isDoctorUser ? "Doctor Dashboard" : "User Dashboard"}
            </h1>
            <p className="text-blue-100 mt-2">
              Welcome back, {isDoctorUser ? "Dr." : ""}{" "}
              {currentUser?.name || "User"}!
              {isDoctorUser
                ? " Manage your patient tokens and devices."
                : " Access your assigned resources."}
            </p>
          </div>
          <div className="flex items-center">
            {lastFetched && (
              <span className="text-xs text-blue-100 mr-3">
                Last updated: {new Date(lastFetched).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={handleRefresh}
              className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white py-2 px-4 rounded-lg flex items-center transition-all"
              disabled={assignmentsLoading}
            >
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
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">
                My Assignments
              </p>
              <p className="text-3xl font-bold text-blue-600">
                {stats.myAssignments}
              </p>
            </div>
            <div className="text-blue-600 text-3xl">📁</div>
          </div>
        </div>

        {isDoctorUser && (
          <>
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">
                    Patient Tokens
                  </p>
                  <p className="text-3xl font-bold text-green-600">
                    {stats.assignedTokens}
                  </p>
                </div>
                <div className="text-green-600 text-3xl">🏷️</div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">
                    My Devices
                  </p>
                  <p className="text-3xl font-bold text-purple-600">
                    {stats.registeredDevices}
                  </p>
                </div>
                <div className="text-purple-600 text-3xl">📱</div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">
                    Recent Alerts
                  </p>
                  <p className="text-3xl font-bold text-amber-600">
                    {stats.recentAlerts}
                  </p>
                </div>
                <div className="text-amber-600 text-3xl">🔔</div>
              </div>
            </div>
          </>
        )}

        {!isDoctorUser && (
          <>
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">
                    Patient Folders
                  </p>
                  <p className="text-3xl font-bold text-green-600">
                    {assignmentsData.reduce(
                      (total, container) => total + container.folders.length,
                      0
                    )}
                  </p>
                </div>
                <div className="text-green-600 text-3xl">📂</div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">Role</p>
                  <p className="text-3xl font-bold text-purple-600">
                    {currentUser?.role?.charAt(0).toUpperCase() +
                      currentUser?.role?.slice(1)}
                  </p>
                </div>
                <div className="text-purple-600 text-3xl">👤</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveSection("overview")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeSection === "overview"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Overview
            </button>

            <button
              onClick={() => setActiveSection("assignments")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeSection === "assignments"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              My Assignments
            </button>

            {isDoctorUser && (
              <>
                <button
                  onClick={() => setActiveSection("tokens")}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeSection === "tokens"
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Patient Tokens
                </button>

                <button
                  onClick={() => setActiveSection("devices")}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeSection === "devices"
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Device Registration
                </button>

                <button
                  onClick={() => setActiveSection("alerts")}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeSection === "alerts"
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Alerts{" "}
                  {stats.recentAlerts > 0 && (
                    <span className="ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                      {stats.recentAlerts}
                    </span>
                  )}
                </button>
              </>
            )}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Section */}
          {activeSection === "overview" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  {isDoctorUser
                    ? "Doctor Account Overview"
                    : "Account Overview"}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Quick Actions */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3">
                      Quick Actions
                    </h3>
                    <div className="space-y-2">
                      <button
                        onClick={() => setActiveSection("assignments")}
                        className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        📁 View My Assignments
                      </button>

                      {isDoctorUser && (
                        <>
                          <button
                            onClick={() => setActiveSection("tokens")}
                            className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                          >
                            🏷️ Manage Patient Tokens
                          </button>
                          <button
                            onClick={() => setActiveSection("devices")}
                            className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                          >
                            📱 Register My Device
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Account Info */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3">
                      Account Information
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Name:</span>
                        <span className="text-gray-900 font-medium">
                          {currentUser?.name}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Username:</span>
                        <span className="text-gray-900 font-medium">
                          {currentUser?.username}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Role:</span>
                        <span
                          className={`font-medium ${
                            isDoctorUser ? "text-green-600" : "text-blue-600"
                          }`}
                        >
                          {isDoctorUser ? "Doctor" : currentUser?.role}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity for Doctors */}
              {isDoctorUser && alerts.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-2">
                    Recent Patient Activity
                  </h3>
                  <div className="space-y-2">
                    {alerts.slice(0, 3).map((alert) => (
                      <div
                        key={alert.alertId}
                        className="flex items-start space-x-2 text-sm"
                      >
                        <span className="text-lg">
                          {getAlertIcon(alert.alertType)}
                        </span>
                        <div>
                          <p className="text-blue-900">{alert.alertMessage}</p>
                          <p className="text-blue-700 text-xs">
                            {formatDate(alert.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* My Assignments Section */}
          {activeSection === "assignments" && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                My Assignments
              </h2>

              {assignmentsData.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-4xl mb-4">📁</div>
                  <p className="text-gray-600">
                    You don't have any assigned containers yet.
                  </p>
                </div>
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
          )}

          {/* Patient Tokens Section (Doctors only) */}
          {isDoctorUser && activeSection === "tokens" && (
            <AssociatedTokens userRole="doctor" />
          )}

          {/* Device Registration Section (Doctors only) */}
          {isDoctorUser && activeSection === "devices" && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-medium text-green-900 mb-2">
                  👨‍⚕️ Doctor Device Registration
                </h3>
                <p className="text-sm text-green-800">
                  Register your devices to access patient SmartTokens without
                  triggering security alerts. This ensures seamless access to
                  patient records during emergencies and routine care.
                </p>
              </div>
              <DeviceRegistration />
            </div>
          )}

          {/* Alerts Section (Doctors only) */}
          {isDoctorUser && activeSection === "alerts" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Patient Access Alerts
                  </h2>
                  <p className="text-gray-600 text-sm">
                    Monitor access to your patients' SmartToken medical records
                  </p>
                </div>
                <button
                  onClick={loadAlerts}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  Refresh
                </button>
              </div>

              {alerts.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-4xl mb-4">🔔</div>
                  <p className="text-gray-600">No recent alerts</p>
                  <p className="text-gray-500 text-sm">
                    You'll see notifications here when someone accesses your
                    patients' SmartTokens
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {alerts.map((alert) => (
                    <div
                      key={alert.alertId}
                      className={`border rounded-lg p-4 ${
                        alert.isRead
                          ? "border-gray-200 bg-white"
                          : "border-blue-200 bg-blue-50"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-start space-x-3">
                          <div className="text-2xl">
                            {getAlertIcon(alert.alertType)}
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">
                              {alert.alertMessage}
                            </h4>
                            <div className="text-sm text-gray-600 mt-1">
                              <p>Patient: {alert.patientName || "Unknown"}</p>
                              <p>Time: {formatDate(alert.createdAt)}</p>
                              {alert.location && (
                                <p>
                                  Location:{" "}
                                  {JSON.parse(alert.location).ip || "Unknown"}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        {!alert.isRead && (
                          <button
                            onClick={() => markAlertAsRead(alert.alertId)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Mark as Read
                          </button>
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
    </div>
  );
};

export default UserDashboard;
