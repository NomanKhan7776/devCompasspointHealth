// src/components/Dashboard/Patient/SecurityAlerts.jsx - Security Alerts Management
import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { emergencyContactsAPI } from "../../../api";
import Loader from "../../common/Loader";
import Alert from "../../common/Alert";
import Modal from "../../common/Modal";
import Button from "../../common/Button";

const SecurityAlerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    hasMore: false,
    total: 0,
  });
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    loadAlerts();
  }, [pagination.offset]);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const response = await emergencyContactsAPI.getEmergencyAlertsHistory({
        limit: pagination.limit,
        offset: pagination.offset,
      });

      if (response.data.success) {
        setAlerts(response.data.alerts);
        setPagination((prev) => ({
          ...prev,
          hasMore: response.data.pagination.hasMore,
          total: response.data.total,
        }));
      } else {
        setError(response.data.message || "Failed to load security alerts");
      }
    } catch (error) {
      console.error("Error loading security alerts:", error);
      setError("Failed to load security alerts");
    } finally {
      setLoading(false);
    }
  };

  const handleResolveAlert = async (alertId) => {
    try {
      const response = await emergencyContactsAPI.resolveAlert(alertId, {
        notes: "Resolved by patient via portal",
      });

      if (response.data.success) {
        toast.success("Alert marked as resolved");
        await loadAlerts();
      } else {
        toast.error(response.data.message || "Failed to resolve alert");
      }
    } catch (error) {
      console.error("Error resolving alert:", error);
      toast.error("Failed to resolve alert");
    }
  };

  const viewAlertDetails = (alert) => {
    setSelectedAlert(alert);
    setShowDetailModal(true);
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getAlertSeverityColor = (severity) => {
    switch (severity) {
      case "high":
        return "bg-red-100 text-red-800 border-red-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "low":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const formatLocation = (locationInfo) => {
    if (!locationInfo) return "Location unknown";

    if (locationInfo.type === "gps") {
      return (
        locationInfo.address ||
        `GPS: ${locationInfo.latitude}, ${locationInfo.longitude}`
      );
    } else if (locationInfo.type === "ip") {
      if (locationInfo.city && locationInfo.city !== "Unknown") {
        return `${locationInfo.city}, ${locationInfo.region}, ${locationInfo.country}`;
      } else {
        return "Location determined from IP address";
      }
    }

    return "Location unknown";
  };

  const loadMore = () => {
    setPagination((prev) => ({
      ...prev,
      offset: prev.offset + prev.limit,
    }));
  };

  if (loading && alerts.length === 0) return <Loader size="large" />;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Security Alerts</h1>
          <p className="text-gray-600 mt-1">
            View alerts when your SmartToken is accessed by unregistered devices
          </p>
        </div>
        <div className="text-sm text-gray-500">
          {pagination.total} total alerts
        </div>
      </div>

      {error && <Alert message={error} type="error" className="mb-6" />}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start space-x-3">
          <div className="text-blue-600 text-xl">🛡️</div>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">About Security Alerts</p>
            <p>
              You'll receive alerts whenever someone accesses your SmartToken
              with a device that hasn't been registered in your account. These
              alerts help monitor unauthorized access to your medical
              information.
            </p>
          </div>
        </div>
      </div>

      {/* Alerts List */}
      {alerts.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <div className="text-gray-400 text-6xl mb-4">🔒</div>
          <h3 className="text-lg font-medium text-gray-800 mb-2">
            No Security Alerts
          </h3>
          <p className="text-gray-600">
            No unregistered device access has been detected for your SmartToken
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.alertId}
              className="bg-white rounded-lg shadow-md border border-gray-200 p-6"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  {/* Alert Header */}
                  <div className="flex items-center space-x-3 mb-3">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full border ${getAlertSeverityColor(
                        alert.severity
                      )}`}
                    >
                      {alert.severity?.toUpperCase() || "MEDIUM"} PRIORITY
                    </span>
                    <span className="text-sm text-gray-500">
                      {formatDateTime(alert.createdAt)}
                    </span>
                    {alert.isResolved && (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 border border-green-200">
                        RESOLVED
                      </span>
                    )}
                  </div>

                  {/* Alert Type */}
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    🚨 Unregistered Device Access Detected
                  </h3>

                  {/* Device Information */}
                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">
                        Device Information
                      </h4>
                      <p className="text-sm text-gray-600">
                        {alert.deviceInfo || "Unknown device"}
                      </p>
                      <p className="text-xs text-gray-500">
                        IP: {alert.ipAddress || "Unknown"}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">
                        Access Location
                      </h4>
                      <p className="text-sm text-gray-600">
                        {formatLocation(alert.locationInfo)}
                      </p>
                    </div>
                  </div>

                  {/* SMS Alerts Sent */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">
                      Emergency Contacts Notified
                    </h4>
                    <p className="text-sm text-gray-600">
                      {alert.smsAlertsSent} SMS alert
                      {alert.smsAlertsSent !== 1 ? "s" : ""} sent
                    </p>
                    {alert.emergencyContactsNotified &&
                      alert.emergencyContactsNotified.length > 0 && (
                        <div className="mt-1">
                          {alert.emergencyContactsNotified.map(
                            (contact, index) => (
                              <span
                                key={index}
                                className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded mr-1 mb-1"
                              >
                                {contact.name} ({contact.relationship})
                              </span>
                            )
                          )}
                        </div>
                      )}
                  </div>

                  {/* Token Information */}
                  <div className="text-xs text-gray-500">
                    Token ID: {alert.tokenId}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col space-y-2 ml-4">
                  <Button
                    onClick={() => viewAlertDetails(alert)}
                    className="bg-blue-100 text-blue-700 hover:bg-blue-200 text-sm px-3 py-1"
                  >
                    View Details
                  </Button>
                  {!alert.isResolved && (
                    <Button
                      onClick={() => handleResolveAlert(alert.alertId)}
                      className="bg-green-100 text-green-700 hover:bg-green-200 text-sm px-3 py-1"
                    >
                      Mark Resolved
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Load More Button */}
          {pagination.hasMore && (
            <div className="text-center pt-4">
              <Button
                onClick={loadMore}
                disabled={loading}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800"
              >
                {loading ? "Loading..." : "Load More Alerts"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Alert Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="Security Alert Details"
        size="large"
      >
        {selectedAlert && (
          <div className="space-y-6">
            {/* Alert Summary */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-red-600 text-xl">🚨</span>
                <h3 className="text-lg font-semibold text-red-800">
                  Unregistered Device Access
                </h3>
              </div>
              <p className="text-red-700">
                Someone accessed your SmartToken with a device that is not
                registered in your account.
              </p>
            </div>

            {/* Detailed Information */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Access Details */}
              <div>
                <h4 className="text-lg font-semibold text-gray-800 mb-3">
                  Access Details
                </h4>
                <dl className="space-y-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-700">
                      Date & Time
                    </dt>
                    <dd className="text-sm text-gray-600">
                      {formatDateTime(selectedAlert.createdAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-700">
                      Device Information
                    </dt>
                    <dd className="text-sm text-gray-600">
                      {selectedAlert.deviceInfo}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-700">
                      IP Address
                    </dt>
                    <dd className="text-sm text-gray-600">
                      {selectedAlert.ipAddress}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-700">
                      Token ID
                    </dt>
                    <dd className="text-sm text-gray-600 font-mono">
                      {selectedAlert.tokenId}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Location Details */}
              <div>
                <h4 className="text-lg font-semibold text-gray-800 mb-3">
                  Location Information
                </h4>
                <dl className="space-y-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-700">
                      Access Location
                    </dt>
                    <dd className="text-sm text-gray-600">
                      {formatLocation(selectedAlert.locationInfo)}
                    </dd>
                  </div>
                  {selectedAlert.locationInfo?.type === "gps" && (
                    <>
                      <div>
                        <dt className="text-sm font-medium text-gray-700">
                          GPS Coordinates
                        </dt>
                        <dd className="text-sm text-gray-600">
                          {selectedAlert.locationInfo.latitude},{" "}
                          {selectedAlert.locationInfo.longitude}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-700">
                          Accuracy
                        </dt>
                        <dd className="text-sm text-gray-600">
                          {selectedAlert.locationInfo.accuracy}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>
            </div>

            {/* Notification Details */}
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-3">
                Emergency Notifications
              </h4>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 mb-2">
                  <strong>{selectedAlert.smsAlertsSent}</strong> SMS alert
                  {selectedAlert.smsAlertsSent !== 1 ? "s" : ""} sent to your
                  emergency contacts
                </p>
                {selectedAlert.emergencyContactsNotified &&
                  selectedAlert.emergencyContactsNotified.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        Notified Contacts:
                      </p>
                      <div className="space-y-1">
                        {selectedAlert.emergencyContactsNotified.map(
                          (contact, index) => (
                            <div
                              key={index}
                              className="flex items-center space-x-2 text-sm text-gray-600"
                            >
                              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                              <span>
                                {contact.name} ({contact.relationship}) -{" "}
                                {contact.phone}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
              </div>
            </div>

            {/* Resolution Status */}
            {selectedAlert.isResolved && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="text-lg font-semibold text-green-800 mb-2">
                  Resolution
                </h4>
                <dl className="space-y-1">
                  <div>
                    <dt className="text-sm font-medium text-green-700">
                      Resolved At
                    </dt>
                    <dd className="text-sm text-green-600">
                      {formatDateTime(selectedAlert.resolvedAt)}
                    </dd>
                  </div>
                  {selectedAlert.resolverNotes && (
                    <div>
                      <dt className="text-sm font-medium text-green-700">
                        Notes
                      </dt>
                      <dd className="text-sm text-green-600">
                        {selectedAlert.resolverNotes}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-4 border-t border-gray-200">
              <Button
                onClick={() => setShowDetailModal(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800"
              >
                Close
              </Button>
              {!selectedAlert.isResolved && (
                <Button
                  onClick={() => {
                    handleResolveAlert(selectedAlert.alertId);
                    setShowDetailModal(false);
                  }}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                >
                  Mark as Resolved
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SecurityAlerts;
