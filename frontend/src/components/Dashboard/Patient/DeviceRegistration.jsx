// DeviceRegistration.jsx - Using your working custom service
import React, { useState, useEffect } from "react";
import fingerprintService from "../../../services/fingerprintService"; // Your working service
import { toast } from "react-toastify";
import { deviceAPI } from "../../../api";

const DeviceRegistration = () => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deviceName, setDeviceName] = useState("");
  const [registeringDevice, setRegisteringDevice] = useState(false);
  const [activeSection, setActiveSection] = useState("devices");
  const [serviceStatus, setServiceStatus] = useState("checking");

  useEffect(() => {
    loadDevices();
    checkServiceStatus();
  }, []);

  const loadDevices = async () => {
    try {
      setLoading(true);
      const response = await deviceAPI.getMyDevices();
      if (response.data.success) {
        setDevices(response.data.devices);
      } else {
        console.error("Failed to load devices:", response.data.message);
      }
    } catch (error) {
      console.error("Error loading devices:", error);
    } finally {
      setLoading(false);
    }
  };

  const checkServiceStatus = async () => {
    try {
      const health = await fingerprintService.healthCheck();
      setServiceStatus(health.status);

      // Auto-detect device name
      const deviceType = fingerprintService.getDeviceType();
      const browser = fingerprintService.getBrowserName();
      const os = fingerprintService.getOSName();

      setDeviceName(
        `My ${
          deviceType === "mobile" ? "Phone" : "Computer"
        } (${browser} on ${os})`
      );
    } catch (error) {
      console.error("Service status check failed:", error);
      setServiceStatus("error");
    }
  };

  const handleRegisterCurrentDevice = async () => {
    if (!deviceName.trim()) {
      toast.error("Please enter a device name");
      return;
    }

    try {
      setRegisteringDevice(true);

      // 🎉 Use your working custom service
      console.log("🔄 Generating fingerprint with custom service...");

      const fingerprint = await fingerprintService.generateFingerprint({
        userAction: "device_registration",
        deviceName: deviceName.trim(),
        component: "DeviceRegistration",
      });

      console.log("✅ Fingerprint generated:", {
        hash: fingerprint.hash,
        service: fingerprint.metadata?.service,
        confidence: fingerprint.metadata?.confidenceScore,
      });

      // Register device with your backend
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
        setActiveSection("devices");
        await loadDevices();
      } else {
        toast.error(response.data.message || "Failed to register device");
      }
    } catch (error) {
      console.error("Error registering device:", error);

      if (error.response?.status === 409) {
        const errorData = error.response.data;
        if (errorData.existingDevice) {
          const existingDevice = errorData.existingDevice;
          const lastUsedDate = existingDevice.lastUsed
            ? new Date(existingDevice.lastUsed).toLocaleDateString()
            : "Unknown";

          toast.error(
            `This device is already registered as "${existingDevice.deviceName}". Last used: ${lastUsedDate}`,
            { duration: 8000 }
          );
        } else {
          toast.error("This device is already registered", { duration: 6000 });
        }
      } else {
        toast.error("Failed to register device. Please try again.", {
          duration: 6000,
        });
      }
    } finally {
      setRegisteringDevice(false);
    }
  };

  // Service Status Component
  const ServiceStatusIndicator = () => {
    if (serviceStatus === "checking") {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
            <span className="text-sm text-blue-800">
              Checking fingerprint service...
            </span>
          </div>
        </div>
      );
    }

    if (serviceStatus === "fallback") {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <div className="flex items-start space-x-3">
            <div className="text-yellow-600 text-xl">⚠️</div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-yellow-800 mb-1">
                Using Fallback Mode
              </h4>
              <p className="text-sm text-yellow-700 mb-2">
                FingerprintJS Pro service unavailable, using browser-based
                fingerprinting.
              </p>
              <p className="text-xs text-yellow-600">
                Device registration will still work with good reliability.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (serviceStatus === "healthy") {
      return (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
          <div className="flex items-center space-x-2">
            <span className="text-green-600">✅</span>
            <span className="text-sm text-green-800">
              FingerprintJS Pro service ready
            </span>
          </div>
        </div>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-800">
            Device Management
          </h1>
          <p className="text-gray-600 mt-1">
            Manage devices authorized to access your medical data
          </p>
        </div>

        {/* Section Toggle Buttons */}
        <div className="flex space-x-3">
          <button
            onClick={() => setActiveSection("register")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeSection === "register"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            <i className="fas fa-plus mr-2"></i>
            Register This Device
          </button>
          <button
            onClick={() => setActiveSection("devices")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeSection === "devices"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            <i className="fas fa-laptop mr-2"></i>
            Registered Devices
          </button>
        </div>
      </div>

      {/* Device Registration Form */}
      {activeSection === "register" && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            Register Current Device
          </h2>

          {/* Service Status Indicator */}
          <ServiceStatusIndicator />

          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="text-yellow-600 text-xl">⚠️</div>
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-1">Important</p>
                  <p>
                    Only register devices you personally own and trust.
                    Registered devices won't trigger security alerts.
                  </p>
                </div>
              </div>
            </div>

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
                disabled={registeringDevice}
              />
              <p className="text-xs text-gray-500 mt-1">
                Example: "My iPhone", "Home Laptop", "Work Computer"
              </p>
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                onClick={() => setActiveSection("devices")}
                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRegisterCurrentDevice}
                disabled={registeringDevice || !deviceName.trim()}
                className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                {registeringDevice ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Registering...
                  </div>
                ) : (
                  "Register Device"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Devices List */}
      {activeSection === "devices" && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            Registered Devices
          </h2>

          {devices.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-400 text-6xl mb-4">📱</div>
              <h3 className="text-lg font-medium text-gray-800 mb-2">
                No Registered Devices
              </h3>
              <p className="text-gray-600 mb-4">
                Register your devices to prevent security alerts
              </p>
              <button
                onClick={() => setActiveSection("register")}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
              >
                Register This Device
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {devices.map((device) => (
                <div
                  key={device.fingerprintId}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <i className="fas fa-laptop text-2xl text-blue-600"></i>
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

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Registered:</span>
                      <span className="font-medium text-gray-800">
                        {new Date(device.registeredAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Last Used:</span>
                      <span className="font-medium text-gray-800">
                        {device.lastUsed
                          ? new Date(device.lastUsed).toLocaleDateString()
                          : "Never"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DeviceRegistration;
