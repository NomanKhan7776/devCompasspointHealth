// DeviceRegistration.jsx - FingerprintJS Pro ONLY Implementation
import React, { useState, useEffect } from "react";
import fingerprintService from "../../../services/fingerprintService"; // FingerprintJS Pro only service
import { toast } from "react-toastify";
import { deviceAPI } from "../../../api";

const DeviceRegistration = () => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deviceName, setDeviceName] = useState("");
  const [registeringDevice, setRegisteringDevice] = useState(false);
  const [activeSection, setActiveSection] = useState("devices");
  const [deletingDevice, setDeletingDevice] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState(null);

  // FingerprintJS Pro specific states
  const [fpjsReady, setFpjsReady] = useState(false);
  const [fpjsError, setFpjsError] = useState(null);
  const [initializingFpjs, setInitializingFpjs] = useState(true);

  useEffect(() => {
    initializeFingerprintJS();
    loadDevices();
  }, []);

  /**
   * Initialize FingerprintJS Pro - No fallback allowed
   */
  const initializeFingerprintJS = async () => {
    try {
      setInitializingFpjs(true);
      setFpjsError(null);

      console.log(
        "🔄 Initializing FingerprintJS Pro for device registration..."
      );

      // Initialize FingerprintJS Pro service
      await fingerprintService.initialize();

      // // Verify it's working by running a health check
      // const healthCheck = await fingerprintService.healthCheck();

      // if (healthCheck.status !== "healthy") {
      //   throw new Error(
      //     `FingerprintJS Pro health check failed: ${healthCheck.error}`
      //   );
      // }

      // console.log("✅ FingerprintJS Pro ready:", {
      //   visitorId: healthCheck.visitorId,
      //   confidence: healthCheck.confidence,
      // });

      // Auto-detect device name
      // const deviceType = fingerprintService.getDeviceType();
      // const browser = fingerprintService.getBrowserName();
      // const os = fingerprintService.getOSName();

      // setDeviceName(
      //   `My ${
      //     deviceType === "mobile" ? "Phone" : "Computer"
      //   } (${browser} on ${os})`
      // );
      // Set default device name
      setDeviceName("My Device");

      setFpjsReady(true);
    } catch (error) {
      console.error("❌ FingerprintJS Pro initialization failed:", error);
      setFpjsError(error.message);
      setFpjsReady(false);

      // Show error to user - no fallback allowed
      toast.error(
        "FingerprintJS Pro service is required but failed to load. Please refresh the page and try again.",
        {
          duration: 10000,
          style: {
            backgroundColor: "#FEF2F2",
            color: "#DC2626",
            border: "1px solid #FECACA",
          },
        }
      );
    } finally {
      setInitializingFpjs(false);
    }
  };

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

  /**
   * Register device using ONLY FingerprintJS Pro
   */
  const handleRegisterCurrentDevice = async () => {
    // Validate FingerprintJS Pro is ready
    if (!fpjsReady) {
      toast.error(
        "FingerprintJS Pro service is not ready. Please wait or refresh the page."
      );
      return;
    }

    if (!deviceName.trim()) {
      toast.error("Please enter a device name");
      return;
    }

    try {
      setRegisteringDevice(true);

      console.log(
        "🔄 Generating ADBLOCKER-RESISTANT FingerprintJS Pro fingerprint..."
      );

      // Generate fingerprint using ADBLOCKER-RESISTANT FingerprintJS Pro
      const fingerprint = await fingerprintService.generateFingerprint({
        userAction: "device_registration",
        deviceName: deviceName.trim(),
        component: "DeviceRegistration",
        registrationMethod: "manual",
        adblockerResistant: true,
      });

      // Validate the fingerprint response
      if (!fingerprint.visitorId || !fingerprint.requestId) {
        throw new Error(
          "Invalid FingerprintJS Pro response - missing visitorId or requestId"
        );
      }

      // console.log(
      //   "✅ ADBLOCKER-RESISTANT FingerprintJS Pro fingerprint generated:",
      //   {
      //     visitorId: fingerprint.visitorId,
      //     requestId: fingerprint.requestId,
      //     confidence: fingerprint.confidence,
      //     service: fingerprint.metadata?.service,
      //     adblockerResistant: fingerprint.metadata?.adblockerResistant,
      //   }
      // );

      // Verify confidence score
      // if (fingerprint.confidence < 0.5) {
      //   console.warn(
      //     "⚠️ Low confidence score from FingerprintJS Pro:",
      //     fingerprint.confidence
      //   );
      // }

      // ✅ FIX: Transform fingerprint to match backend expectations
      const backendPayload = {
        deviceFingerprint: {
          // Top-level properties that backend expects
          visitorId: fingerprint.visitorId,
          requestId: fingerprint.requestId,
          confidenceScore: fingerprint.confidence, // ✅ Backend expects "confidenceScore", not "confidence"

          // Keep all original data
          hash: fingerprint.hash,
          confidence: fingerprint.confidence, // Keep original for compatibility
          details: fingerprint.details,
          metadata: {
            ...fingerprint.metadata,
            confidenceScore: fingerprint.confidence, // Also keep in metadata
          },
        },
        deviceName: deviceName.trim(),
        deviceType: "patient", // ✅ Add deviceType as expected by backend
      };

      // console.log("📤 Sending device registration payload:", {
      //   visitorId: backendPayload.deviceFingerprint.visitorId,
      //   requestId: backendPayload.deviceFingerprint.requestId,
      //   confidenceScore: backendPayload.deviceFingerprint.confidenceScore,
      //   service: backendPayload.deviceFingerprint.metadata?.service,
      //   deviceName: backendPayload.deviceName,
      //   deviceType: backendPayload.deviceType,
      // });

      // Register device with backend using corrected payload
      const response = await deviceAPI.registerDevice(backendPayload);

      if (response.data.success) {
        toast.success(
          "Device registered successfully with FingerprintJS Pro (Adblocker-Resistant)",
          {
            style: {
              backgroundColor: "#F0FDF4",
              color: "#166534",
              border: "1px solid #BBF7D0",
            },
          }
        );

        setDeviceName("");
        setActiveSection("devices");
        await loadDevices();
      } else {
        throw new Error(response.data.message || "Registration failed");
      }
    } catch (error) {
      console.error("❌ Device registration error:", error);

      // Enhanced error logging for debugging
      if (error.response) {
        console.error("📄 Backend response:", {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
        });
      }

      handleRegistrationError(error);
    } finally {
      setRegisteringDevice(false);
    }
  };

  const handleRegistrationError = (error) => {
    console.error("🔍 Detailed error analysis:", error);

    if (error.response?.status === 400) {
      // Handle 400 Bad Request errors with detailed information
      const errorData = error.response.data;
      console.error("❌ 400 Bad Request Details:", {
        message: errorData.message,
        error: errorData.error,
        details: errorData.details,
        expected: errorData.expected,
        received: errorData.received,
      });

      if (errorData.error === "INVALID_SERVICE") {
        toast.error(
          `Invalid fingerprint service: Expected '${errorData.expected}', got '${errorData.received}'. Please refresh and try again.`,
          { duration: 10000 }
        );
      } else if (errorData.error === "MISSING_VISITOR_ID") {
        toast.error(
          "FingerprintJS Pro visitor ID is missing. Please refresh the page and try again.",
          { duration: 8000 }
        );
      } else if (errorData.error === "INVALID_VISITOR_ID_FORMAT") {
        toast.error(
          "Invalid FingerprintJS Pro visitor ID format. Please refresh and try again.",
          { duration: 8000 }
        );
      } else if (errorData.error === "MISSING_DEVICE_NAME") {
        toast.error("Device name is required", { duration: 5000 });
      } else {
        toast.error(
          `Registration failed: ${
            errorData.message || "Invalid request format"
          }`,
          { duration: 8000 }
        );
      }
    } else if (error.response?.status === 409) {
      // Handle device already registered
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
    } else if (error.response?.status === 401) {
      toast.error("Authentication failed. Please log in again.", {
        duration: 6000,
      });
      // Optionally redirect to login
    } else if (error.response?.status === 403) {
      toast.error("You don't have permission to register devices.", {
        duration: 6000,
      });
    } else if (
      error.message.toLowerCase().includes("blocked") ||
      error.message.toLowerCase().includes("adblocker")
    ) {
      toast.error("FingerprintJS Pro blocked by adblocker: " + error.message, {
        duration: 10000,
      });
    } else if (
      error.code === "NETWORK_ERROR" ||
      error.message.includes("Network Error")
    ) {
      toast.error(
        "Network error. Please check your connection and try again.",
        {
          duration: 6000,
        }
      );
    } else {
      // Generic error
      toast.error(
        `Failed to register device: ${
          error.message || "Unknown error"
        }. Please try again.`,
        { duration: 6000 }
      );
    }
  };

  const handleDeleteDevice = (device) => {
    setDeviceToDelete(device);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deviceToDelete) return;

    try {
      setDeletingDevice(deviceToDelete.fingerprintId);

      const response = await deviceAPI.removeDevice(
        deviceToDelete.fingerprintId,
        {
          permanent: true,
        }
      );

      if (response.data.success) {
        toast.success("Device permanently deleted successfully", {
          style: {
            backgroundColor: "#F0FDF4",
            color: "#166534",
            border: "1px solid #BBF7D0",
          },
        });

        await loadDevices();
      } else {
        throw new Error(response.data.message || "Delete failed");
      }
    } catch (error) {
      console.error("❌ Device deletion error:", error);

      if (error.response?.status === 404) {
        toast.error("Device not found or already deleted");
      } else if (error.response?.status === 403) {
        toast.error("You don't have permission to delete this device");
      } else {
        toast.error(
          `Failed to delete device: ${error.message || "Unknown error"}`
        );
      }
    } finally {
      setDeletingDevice(null);
      setShowDeleteModal(false);
      setDeviceToDelete(null);
    }
  };
  // FingerprintJS Pro Status Component
  const FingerprintJSStatus = () => {
    if (initializingFpjs) {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-blue-800 mb-1">
                Initializing FingerprintJS Pro
              </h4>
              <p className="text-sm text-blue-700">
                Loading advanced device fingerprinting service...
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (fpjsError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex items-start space-x-3">
            <div className="text-red-600 text-xl">❌</div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-800 mb-1">
                FingerprintJS Pro Service Error
              </h4>
              <p className="text-sm text-red-700 mb-2">{fpjsError}</p>
              <button
                onClick={initializeFingerprintJS}
                className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded hover:bg-red-200"
              >
                Retry Initialization
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (fpjsReady) {
      return (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <div className="flex items-center space-x-3">
            <span className="text-green-600">✅</span>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-green-800 mb-1">
                FingerprintJS Pro Ready
              </h4>
              <p className="text-sm text-green-700">
                Advanced device fingerprinting active - provides consistent
                device identification
              </p>
            </div>
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
            Manage devices authorized to access your medical data using
            FingerprintJS Pro
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

          {/* FingerprintJS Pro Status */}
          <FingerprintJSStatus />

          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="text-blue-600 text-xl">🔒</div>
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">
                    Powered by FingerprintJS Pro
                  </p>
                  <p>
                    Your device will be identified using advanced browser
                    fingerprinting technology that provides consistent
                    identification across sessions while protecting your
                    privacy.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="text-yellow-600 text-xl">⚠️</div>
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-1">Important</p>
                  <p>
                    Only register devices you personally own and trust.
                    Registered devices won't trigger security alerts when
                    accessing your medical data.
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
                disabled={registeringDevice || !fpjsReady}
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
                disabled={registeringDevice || !fpjsReady || !deviceName.trim()}
                className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                {registeringDevice ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Generating FingerprintJS Pro ID...
                  </div>
                ) : !fpjsReady ? (
                  "Waiting for FingerprintJS Pro..."
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
                Register your devices using FingerprintJS Pro to prevent
                security alerts
              </p>
              <button
                onClick={() => setActiveSection("register")}
                disabled={!fpjsReady}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                {fpjsReady
                  ? "Register This Device"
                  : "FingerprintJS Pro Loading..."}
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
                    <div className="flex items-center space-x-2">
                      {device.isActive && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      )}
                      <button
                        onClick={() => handleDeleteDevice(device)}
                        disabled={deletingDevice === device.fingerprintId}
                        className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete Device"
                      >
                        {deletingDevice === device.fingerprintId ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-red-600 border-t-transparent"></div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <span>🗑️</span>
                            <span>Delete</span>
                          </div>
                        )}
                      </button>
                    </div>
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
                    <div className="flex justify-between">
                      <span className="text-gray-600">Service:</span>
                      <span className="font-medium text-blue-600">
                        FingerprintJS Pro
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center space-x-3 mb-4">
              <div className="text-red-600 text-2xl">⚠️</div>
              <h3 className="text-lg font-semibold text-gray-800">
                Delete Device
              </h3>
            </div>

            <p className="text-gray-600 mb-6">
              Are you sure you want to permanently delete "
              {deviceToDelete?.deviceName}"? This action cannot be undone and
              will remove all associated logs and data.
            </p>

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeviceToDelete(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deletingDevice}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg font-medium transition-colors"
              >
                {deletingDevice ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Deleting...
                  </div>
                ) : (
                  "Delete Permanently"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceRegistration;
