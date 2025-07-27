// components/Dashboard/PatientDashboard.jsx - UPDATED
import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { deviceAPI, smartTokenAPI } from "../../api"; // ✅ Import APIs
import DeviceRegistration from "./Patient/DeviceRegistration";
import AssociatedTokens from "./Patient/AssociatedTokens";
import FamilyDeviceQR from "./Patient/FamilyDeviceQR";
const PatientDashboard = () => {
  const [activeSection, setActiveSection] = useState("overview");
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({
    assignedTokens: 0,
    registeredDevices: 0,
    recentAlerts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    loadUserData();
    loadStats();
    loadAlerts();
  }, []);

  // Load user data from token
  const loadUserData = () => {
    try {
      const token = localStorage.getItem("token");
      if (token) {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setUser(payload.user);
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  // ✅ UPDATED: Load dashboard statistics using APIs
  const loadStats = async () => {
    try {
      // ✅ Load assigned tokens using smartTokenAPI
      const tokensResponse = await smartTokenAPI.getMyTokens();

      // ✅ Load registered devices using deviceAPI
      const devicesResponse = await deviceAPI.getMyDevices();

      setStats({
        assignedTokens: tokensResponse.data.success
          ? tokensResponse.data.tokens.length
          : 0,
        registeredDevices: devicesResponse.data.success
          ? devicesResponse.data.devices.filter((d) => d.isActive).length
          : 0,
        recentAlerts: 0, // Will be updated by loadAlerts
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

      // Refresh alerts
      loadAlerts();
      toast.success("Alert marked as read");
    } catch (error) {
      console.error("Error marking alert as read:", error);
      toast.error("Failed to mark alert as read");
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg shadow-lg p-6 text-white">
        <h1 className="text-3xl font-bold">Patient Dashboard</h1>
        <p className="text-blue-100 mt-2">
          Welcome back, {user?.name || "Patient"}! Manage your SmartToken
          devices and access.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">
                Assigned Tokens
              </p>
              <p className="text-3xl font-bold text-blue-600">
                {stats.assignedTokens}
              </p>
            </div>
            <div className="text-blue-600 text-3xl">🏷️</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">
                Registered Devices
              </p>
              <p className="text-3xl font-bold text-green-600">
                {stats.registeredDevices}
              </p>
            </div>
            <div className="text-green-600 text-3xl">📱</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Recent Alerts</p>
              <p className="text-3xl font-bold text-amber-600">
                {stats.recentAlerts}
              </p>
            </div>
            <div className="text-amber-600 text-3xl">🔔</div>
          </div>
        </div>
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
              onClick={() => setActiveSection("family-qr")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeSection === "family-qr"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Family Registration
            </button>
            <button
              onClick={() => setActiveSection("tokens")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeSection === "tokens"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              My Tokens
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
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Section */}
          {activeSection === "overview" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Account Overview
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Quick Actions */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3">
                      Quick Actions
                    </h3>
                    <div className="space-y-2">
                      <button
                        onClick={() => setActiveSection("devices")}
                        className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        📱 Register New Device
                      </button>
                      <button
                        onClick={() => setActiveSection("family-qr")}
                        className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        👨‍👩‍👧‍👦 Family Registration
                      </button>
                      <button
                        onClick={() => setActiveSection("tokens")}
                        className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        🏷️ View My Tokens
                      </button>
                      <button
                        onClick={() => setActiveSection("alerts")}
                        className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        🔔 Check Alerts
                      </button>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3">
                      Recent Activity
                    </h3>
                    {alerts.length === 0 ? (
                      <p className="text-gray-600 text-sm">
                        No recent activity
                      </p>
                    ) : (
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
                              <p className="text-gray-900">
                                {alert.alertMessage}
                              </p>
                              <p className="text-gray-500 text-xs">
                                {formatDate(alert.createdAt)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Security Tips */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">
                  🔒 Security Tips
                </h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>
                    • Register all your personal devices to avoid false security
                    alerts
                  </li>
                  <li>
                    • Only share family registration QR codes with trusted
                    family members
                  </li>
                  <li>
                    • Review alerts regularly to ensure authorized access to
                    your medical records
                  </li>
                  <li>• Keep your device registrations up to date</li>
                </ul>
              </div>
            </div>
          )}

          {/* Device Registration Section */}
          {activeSection === "devices" && <DeviceRegistration />}
          {activeSection === "family-qr" && <FamilyDeviceQR />}
          {/* My Tokens Section */}
          {activeSection === "tokens" && (
            <AssociatedTokens userRole="patient" />
          )}

          {/* Alerts Section */}
          {activeSection === "alerts" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Security Alerts
                  </h2>
                  <p className="text-gray-600 text-sm">
                    Monitor access to your SmartToken medical records
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
                    SmartToken
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
                              <p>Token: {alert.patientName || "Unknown"}</p>
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

export default PatientDashboard;
