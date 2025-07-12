// src/components/Dashboard/Patient/DeviceRegistration.jsx - Device Management for Patients
import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { deviceAPI } from "../../../api";
import Loader from "../../common/Loader";
import Alert from "../../common/Alert";
import Modal from "../../common/Modal";
import Button from "../../common/Button";
import { QRCodeSVG } from "qrcode.react";

const DeviceRegistration = () => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [qrData, setQrData] = useState(null);
  const [registeringDevice, setRegisteringDevice] = useState(false);
  const [generatingQR, setGeneratingQR] = useState(false);

  // Device registration form
  const [deviceName, setDeviceName] = useState("");
  const [deviceServiceReady, setDeviceServiceReady] = useState(false);
  const [activeSection, setActiveSection] = useState("devices"); // 'register', 'devices', 'qr'

  // Enhanced error handling state
  const [duplicateDeviceInfo, setDuplicateDeviceInfo] = useState(null);

  useEffect(() => {
    loadDevices();
    checkDeviceFingerprintingService();
  }, []);

  const loadDevices = async () => {
    try {
      setLoading(true);
      const response = await deviceAPI.getMyDevices();
      if (response.data.success) {
        setDevices(response.data.devices);
      } else {
        setError(response.data.message || "Failed to load devices");
      }
    } catch (error) {
      console.error("Error loading devices:", error);
      setError("Failed to load devices");
    } finally {
      setLoading(false);
    }
  };

  const checkDeviceFingerprintingService = () => {
    // Check if device fingerprinting service is available
    const checkService = () => {
      if (window.DeviceFingerprintingService) {
        setDeviceServiceReady(true);
        // Auto-detect current device name
        const service = new window.DeviceFingerprintingService();
        const deviceType = service.getDeviceType();
        const browser = service.getBrowserName();
        const os = service.getOSName();
        setDeviceName(
          `My ${
            deviceType === "mobile" ? "Phone" : "Computer"
          } (${browser} on ${os})`
        );
        return true;
      }
      return false;
    };

    if (!checkService()) {
      // Retry every 500ms for up to 5 seconds
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (checkService() || attempts >= 10) {
          clearInterval(interval);
          if (!deviceServiceReady) {
            console.warn("Device fingerprinting service not available");
          }
        }
      }, 500);
    }
  };

  const handleRegisterCurrentDevice = async () => {
    if (!deviceServiceReady) {
      toast.error("Device fingerprinting service not available");
      return;
    }

    if (!deviceName.trim()) {
      toast.error("Please enter a device name");
      return;
    }

    try {
      setRegisteringDevice(true);
      setDuplicateDeviceInfo(null); // Clear any previous duplicate info

      // Generate device fingerprint
      const service = new window.DeviceFingerprintingService();
      const fingerprint = await service.generateFingerprint();

      const response = await deviceAPI.registerDevice({
        deviceFingerprint: fingerprint,
        deviceName: deviceName.trim(),
      });

      if (response.data.success) {
        toast.success("Device registered successfully", {
          style: {
            backgroundColor: "#F0FDF4",
            color: "#166534",
            border: "1px solid #BBF7D0",
          },
        });
        setDeviceName("");
        setActiveSection("devices"); // Switch to devices section
        await loadDevices();
      } else {
        toast.error(response.data.message || "Failed to register device");
      }
    } catch (error) {
      console.error("Error registering device:", error);

      // Enhanced error handling for different scenarios
      if (error.response?.status === 409) {
        // Device already registered error
        const errorData = error.response.data;
        console.log("🔍 Duplicate device detected:", errorData);

        // Set duplicate device info for visual display
        if (errorData.existingDevice) {
          setDuplicateDeviceInfo(errorData.existingDevice);
        }

        // Show enhanced toast error
        if (errorData.existingDevice) {
          const existingDevice = errorData.existingDevice;
          const lastUsedDate = existingDevice.lastUsed
            ? new Date(existingDevice.lastUsed).toLocaleDateString()
            : "Unknown";

          toast.error(
            `This device is already registered as "${existingDevice.deviceName}". Last used: ${lastUsedDate}`,
            {
              duration: 8000,
              style: {
                backgroundColor: "#FEF2F2",
                color: "#DC2626",
                border: "1px solid #FECACA",
                fontSize: "14px",
                maxWidth: "500px",
              },
            }
          );
        } else {
          toast.error("This device is already registered", { duration: 6000 });
        }
      } else if (error.response?.status === 400) {
        // Bad request error
        const errorMessage =
          error.response.data?.message || "Invalid device data";
        toast.error(errorMessage, { duration: 6000 });
      } else if (error.response?.data?.message) {
        // Other API errors
        toast.error(error.response.data.message, { duration: 6000 });
      } else {
        // General error
        toast.error("Failed to register device. Please try again.", {
          duration: 6000,
        });
      }
    } finally {
      setRegisteringDevice(false);
    }
  };

  const handleGenerateQRForFamily = async () => {
    try {
      setGeneratingQR(true);
      const response = await deviceAPI.generateQRForFamilyRegistration();

      if (response.data.success) {
        setQrData({
          token: response.data.qrToken,
          url: response.data.qrUrl,
          expiresAt: response.data.expiresAt,
        });
        toast.success("QR code generated successfully");
      } else {
        toast.error(response.data.message || "Failed to generate QR code");
      }
    } catch (error) {
      console.error("Error generating QR code:", error);
      toast.error("Failed to generate QR code");
    } finally {
      setGeneratingQR(false);
    }
  };

  const handleRemoveDevice = async (fingerprintId, deviceName) => {
    if (
      !window.confirm(
        `Are you sure you want to remove "${deviceName}"? This device will trigger security alerts if it accesses your SmartToken again.`
      )
    ) {
      return;
    }

    try {
      const response = await deviceAPI.removeDevice(fingerprintId);
      if (response.data.success) {
        toast.success("Device removed successfully");
        await loadDevices();
      } else {
        toast.error(response.data.message || "Failed to remove device");
      }
    } catch (error) {
      console.error("Error removing device:", error);
      toast.error("Failed to remove device");
    }
  };

  const getDeviceIcon = (deviceType) => {
    switch (deviceType?.toLowerCase()) {
      case "mobile":
        return "fa-mobile-alt";
      case "tablet":
        return "fa-tablet-alt";
      case "desktop":
        return "fa-desktop";
      default:
        return "fa-laptop";
    }
  };

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "Invalid Date";
    }
  };

  const getTimeAgo = (dateString) => {
    try {
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
      return formatDate(dateString);
    } catch (e) {
      return "Unknown";
    }
  };

  // Clear duplicate device info
  const clearDuplicateInfo = () => {
    setDuplicateDeviceInfo(null);
  };

  if (loading) return <Loader size="large" />;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-800">
            Device Management
          </h1>
          <p className="text-gray-600 mt-1">
            Manage devices authorized to access your medical data without
            triggering security alerts
          </p>
        </div>

        {/* Section Toggle Buttons */}
        <div className="flex space-x-3">
          <Button
            onClick={() => setActiveSection("register")}
            className={`${
              activeSection === "register"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            <i className="fas fa-plus mr-2"></i>
            Register This Device
          </Button>
          <Button
            onClick={() => setActiveSection("devices")}
            className={`${
              activeSection === "devices"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            <i className="fas fa-laptop mr-2"></i>
            Registered Devices
          </Button>
          <Button
            onClick={() => setActiveSection("qr")}
            className={`${
              activeSection === "qr"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            <i className="fas fa-qrcode mr-2"></i>
            Family QR Code
          </Button>
        </div>
      </div>

      {/* Content Sections */}
      {activeSection === "register" && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            Register Current Device
          </h2>

          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="text-yellow-600 text-xl">⚠️</div>
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-1">Important</p>
                  <p>
                    Only register devices you personally own and trust.
                    Registered devices won't trigger security alerts when
                    accessing your SmartToken.
                  </p>
                </div>
              </div>
            </div>

            {/* Enhanced Duplicate Device Warning */}
            {duplicateDeviceInfo && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <div className="text-red-600 text-xl">⚠️</div>
                  <div className="flex-1">
                    <div className="text-sm text-red-800">
                      <p className="font-medium mb-1">
                        Device Already Registered
                      </p>
                      <p className="mb-2">
                        This device is already registered with the name "
                        {duplicateDeviceInfo.deviceName}".
                      </p>
                      <p className="text-xs text-red-600">
                        Registered:{" "}
                        {formatDate(duplicateDeviceInfo.registeredAt)}
                        {duplicateDeviceInfo.lastUsed && (
                          <>
                            {" "}
                            • Last used:{" "}
                            {formatDate(duplicateDeviceInfo.lastUsed)}
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={clearDuplicateInfo}
                      className="mt-2 text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Device Name
              </label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter a name for this device"
                disabled={registeringDevice || !deviceServiceReady}
              />
              <p className="text-xs text-gray-500 mt-1">
                Example: "My iPhone", "Home Laptop", "Work Computer"
              </p>
            </div>

            {!deviceServiceReady && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800">
                  Device fingerprinting service is not available. Please refresh
                  the page and try again.
                </p>
              </div>
            )}

            <div className="flex space-x-3 pt-4">
              <Button
                onClick={() => setActiveSection("devices")}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRegisterCurrentDevice}
                disabled={
                  registeringDevice ||
                  !deviceServiceReady ||
                  !deviceName.trim() ||
                  duplicateDeviceInfo
                }
                className={`flex-1 ${
                  duplicateDeviceInfo
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600"
                } text-white`}
              >
                {registeringDevice ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Registering...
                  </div>
                ) : duplicateDeviceInfo ? (
                  "Device Already Registered"
                ) : (
                  "Register Device"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeSection === "devices" && (
        <div>
          {error && <Alert message={error} type="error" className="mb-6" />}

          {/* Registered Devices List */}
          {devices.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <div className="text-gray-400 text-6xl mb-4">📱</div>
              <h3 className="text-lg font-medium text-gray-800 mb-2">
                No Registered Devices
              </h3>
              <p className="text-gray-600 mb-4">
                Register your devices to prevent security alerts when accessing
                your SmartToken
              </p>
              <Button
                onClick={() => setActiveSection("register")}
                disabled={!deviceServiceReady}
                className="bg-blue-500 hover:bg-blue-600 text-white"
              >
                Register This Device
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {devices.map((device) => (
                <div
                  key={device.fingerprintId}
                  className="bg-white rounded-lg shadow-md p-6 border border-gray-200"
                >
                  {/* Device Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <i
                        className={`fas ${getDeviceIcon(
                          device.deviceType
                        )} text-2xl text-blue-600`}
                      ></i>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800">
                          {device.deviceName}
                        </h3>
                        <p className="text-sm text-gray-600 capitalize">
                          {device.deviceType}
                        </p>
                      </div>
                    </div>
                    {device.isActive && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    )}
                  </div>

                  {/* Device Details */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Platform:</span>
                      <span className="font-medium text-gray-800">
                        {device.platform || "Unknown"}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Registered:</span>
                      <span className="font-medium text-gray-800">
                        {formatDate(device.registeredAt)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Last Seen:</span>
                      <span className="font-medium text-gray-800">
                        {getTimeAgo(device.lastUsed || device.registeredAt)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Access Count:</span>
                      <span className="font-medium text-gray-800">
                        {device.accessCount || 0}
                      </span>
                    </div>
                  </div>

                  {/* Device Actions */}
                  <div className="flex space-x-2">
                    <button
                      onClick={() =>
                        handleRemoveDevice(
                          device.fingerprintId,
                          device.deviceName
                        )
                      }
                      className="flex-1 px-3 py-2 text-sm bg-red-100 text-red-700 hover:bg-red-200 rounded-md transition-colors"
                    >
                      Remove Device
                    </button>
                  </div>

                  {/* Device Notes */}
                  {device.notes && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-600">{device.notes}</p>
                    </div>
                  )}

                  {/* Android/Mobile Badge */}
                  {device.isAndroid && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <i className="fab fa-android mr-1"></i>
                        Android Device
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeSection === "qr" && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            Family Device Registration QR Code
          </h2>

          {!qrData ? (
            <div className="text-center py-8">
              <div className="text-gray-400 text-6xl mb-4">📱</div>
              <h3 className="text-lg font-medium text-gray-800 mb-2">
                Generate Family QR Code
              </h3>
              <p className="text-gray-600 mb-4">
                Generate a QR code for trusted family members to register their
                devices
              </p>
              <Button
                onClick={handleGenerateQRForFamily}
                disabled={generatingQR}
                className="bg-green-500 hover:bg-green-600 text-white"
              >
                {generatingQR ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Generating...
                  </div>
                ) : (
                  "Generate QR Code"
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <div className="text-blue-600 text-xl">ℹ️</div>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">How to Use This QR Code</p>
                    <p>
                      Share this QR code with trusted family members or
                      caregivers. They can scan it to register their devices,
                      preventing security alerts when they access your
                      SmartToken.
                    </p>
                  </div>
                </div>
              </div>

              {/* QR Code Display */}
              <div className="text-center">
                <div className="inline-block p-4 bg-white border-2 border-gray-300 rounded-lg">
                  <QRCodeSVG
                    value={qrData.url}
                    size={256}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="M"
                  />
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  QR Code for family device registration
                </p>
              </div>

              {/* QR Code Details */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-800 mb-2">
                  QR Code Details
                </h4>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Expires:</dt>
                    <dd className="font-medium text-gray-800">
                      {new Date(qrData.expiresAt).toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Registration URL:</dt>
                    <dd className="font-mono text-xs text-gray-600 break-all">
                      {qrData.url}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Instructions */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-medium text-yellow-800 mb-2">
                  Security Reminder
                </h4>
                <ul className="text-sm text-yellow-700 space-y-1">
                  <li>
                    • Only share this QR code with people you trust completely
                  </li>
                  <li>• The QR code expires in 24 hours for security</li>
                  <li>• You can generate a new QR code anytime</li>
                  <li>• Registered devices can be removed at any time</li>
                </ul>
              </div>

              <div className="flex space-x-3">
                <Button
                  onClick={() => setQrData(null)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800"
                >
                  Hide QR Code
                </Button>
                <Button
                  onClick={handleGenerateQRForFamily}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                >
                  Generate New QR Code
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info Banner - Show only on devices section */}
      {activeSection === "devices" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <div className="text-blue-600 text-xl">🔒</div>
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">How Device Registration Works</p>
              <p>
                When you register a device, it won't trigger security alerts
                when accessing your SmartToken. Unregistered devices will still
                have full access to your medical data in emergencies, but your
                emergency contacts will be automatically notified for security
                purposes.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceRegistration;
