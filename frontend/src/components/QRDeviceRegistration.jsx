// components/QRDeviceRegistration.jsx - FIXED Android issues with auto-detection
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { deviceAPI } from "../api";

const QRDeviceRegistration = () => {
  const { qrToken } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [qrStatus, setQrStatus] = useState(null);
  const [deviceName, setDeviceName] = useState("");
  const [fingerprintService, setFingerprintService] = useState(null);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [duplicateDeviceInfo, setDuplicateDeviceInfo] = useState(null);

  // ✅ FIX: Add service loading state for auto-detection
  const [serviceLoading, setServiceLoading] = useState(true);
  const [serviceReady, setServiceReady] = useState(false);

  // ✅ FIX: Enhanced device fingerprinting service loading with proper async handling
  const loadFingerprintingService = async () => {
    try {
      setServiceLoading(true);
      console.log("🔄 Loading device fingerprinting service...");

      // Wait for service to be available with timeout
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max wait

      while (!window.DeviceFingerprintingService && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }

      if (!window.DeviceFingerprintingService) {
        console.error(
          "❌ Device fingerprinting service not available after 5 seconds"
        );
        toast.error("Device fingerprinting service not available");
        return;
      }

      console.log("✅ Device fingerprinting service loaded");
      const service = new window.DeviceFingerprintingService();
      setFingerprintService(service);

      // ✅ FIX: Auto-detect device name with proper async handling
      console.log("🔄 Auto-detecting device name...");
      const detectedName = service.getDeviceName();

      if (detectedName && detectedName !== "Unknown Device") {
        setDeviceName(detectedName);
        console.log("✅ Device name auto-detected:", detectedName);
      } else {
        // ✅ FIX: Enhanced fallback device name detection
        const isAndroid = /Android/i.test(navigator.userAgent);
        const isIPhone = /iPhone/i.test(navigator.userAgent);
        const isIPad = /iPad/i.test(navigator.userAgent);

        let fallbackName;
        if (isAndroid) {
          // Try to extract Android device model from user agent
          const modelMatch = navigator.userAgent.match(
            /Android.*?;\s*(.*?)\s*Build/
          );
          fallbackName = modelMatch ? modelMatch[1] : "Android Device";
        } else if (isIPhone) {
          fallbackName = "iPhone";
        } else if (isIPad) {
          fallbackName = "iPad";
        } else {
          fallbackName = "My Device";
        }

        setDeviceName(fallbackName);
        console.log("⚠️ Using fallback device name:", fallbackName);
      }

      setServiceReady(true);
      console.log("✅ Service ready for device registration");
    } catch (error) {
      console.error("❌ Error loading fingerprinting service:", error);
      toast.error("Failed to load device detection service");
    } finally {
      setServiceLoading(false);
    }
  };

  useEffect(() => {
    // ✅ FIX: Load service first, then check QR status
    const initializeComponent = async () => {
      console.log("🚀 Initializing QR Device Registration...");
      await loadFingerprintingService();
      await checkQRStatus();
    };

    initializeComponent();
  }, [qrToken]);

  // Check if QR code is valid using deviceAPI
  const checkQRStatus = async () => {
    try {
      setLoading(true);
      console.log("🔄 Checking QR status for token:", qrToken);

      const response = await deviceAPI.checkQRStatus(qrToken);

      if (response.data.success) {
        setQrStatus(response.data.status);
        console.log("✅ QR status verified:", response.data.status);

        if (!response.data.status.isValid) {
          if (response.data.status.isExpired) {
            toast.error("QR code has expired");
          } else if (response.data.status.isUsed) {
            toast.error("QR code has already been used");
          }
        }
      } else {
        console.error("❌ Invalid QR code response");
        toast.error("Invalid QR code");
      }
    } catch (error) {
      console.error("❌ QR status check error:", error);
      toast.error("Failed to verify QR code");
    } finally {
      setLoading(false);
    }
  };

  // ✅ FIX: Enhanced device registration with proper Android duplicate detection
  const registerDevice = async () => {
    if (!fingerprintService || !serviceReady) {
      toast.error("Device fingerprinting service not ready. Please wait...");
      return;
    }

    if (!deviceName.trim()) {
      toast.error("Please enter a device name");
      return;
    }

    try {
      setRegistering(true);
      setDuplicateDeviceInfo(null);

      console.log("🔄 Generating device fingerprint...");

      // Generate device fingerprint with timeout
      const fingerprintPromise = fingerprintService.generateFingerprint();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Fingerprint generation timeout")),
          15000
        )
      );

      const fingerprint = await Promise.race([
        fingerprintPromise,
        timeoutPromise,
      ]);

      if (!fingerprint || !fingerprint.hash) {
        throw new Error("Failed to generate valid device fingerprint");
      }

      console.log("✅ Device fingerprint generated:", {
        hash: fingerprint.hash,
        method: fingerprint.details?.collectMethod,
        isAndroid: fingerprint.details?.isAndroid,
      });

      console.log("🔄 Registering device via QR...");
      const response = await deviceAPI.registerDeviceViaQR(qrToken, {
        deviceFingerprint: fingerprint,
        deviceName: deviceName.trim(),
      });

      if (response.data.success) {
        setRegistrationComplete(true);
        console.log("✅ Device registered successfully:", response.data.device);

        if (response.data.device.wasReactivated) {
          toast.success("Device reactivated successfully!");
        } else {
          toast.success("Device registered successfully!");
        }

        // Auto-redirect after success
        setTimeout(() => {
          navigate("/login", {
            state: {
              message: `Device registered for ${
                response.data.device.patientName || qrStatus?.patientName
              }`,
            },
          });
        }, 3000);
      } else {
        console.error("❌ Registration failed:", response.data.message);
        toast.error(response.data.message || "Failed to register device");
      }
    } catch (error) {
      console.error("❌ Device registration error:", error);

      // ✅ FIX: Enhanced error handling for Android duplicate detection
      if (error.response?.status === 409) {
        const errorData = error.response.data;
        console.log("🔍 Duplicate device detected:", errorData);

        // ✅ Handle Android-specific duplicate errors
        if (
          errorData.error === "DEVICE_ALREADY_REGISTERED_ANDROID_QR" ||
          errorData.error === "DEVICE_ALREADY_REGISTERED"
        ) {
          setDuplicateDeviceInfo(errorData.existingDevice);

          const isAndroid = /Android/i.test(navigator.userAgent);
          const deviceType = isAndroid ? "Android device" : "device";

          toast.error(
            `This ${deviceType} is already registered for ${
              qrStatus?.patientName || "the patient"
            }!`,
            {
              duration: 8000,
              style: {
                backgroundColor: "#FEF2F2",
                color: "#DC2626",
                border: "1px solid #FECACA",
                fontSize: "14px",
              },
            }
          );
        } else if (errorData.error === "SIMILAR_DEVICE_EXISTS") {
          setDuplicateDeviceInfo(errorData.existingDevice);
          toast.error(
            "A similar device is already registered. This might be the same device with updated settings.",
            { duration: 8000 }
          );
        }
      } else if (error.response?.status === 400) {
        const errorData = error.response.data;

        if (errorData.error === "QR_EXPIRED") {
          toast.error("QR code has expired. Please ask for a new one.");
        } else if (errorData.error === "QR_ALREADY_USED") {
          toast.error("This QR code has already been used.");
        } else {
          toast.error(errorData.message || "Registration failed");
        }
      } else if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else if (error.message === "Fingerprint generation timeout") {
        toast.error(
          "Device detection timed out. Please refresh and try again."
        );
      } else {
        toast.error("Failed to register device");
      }
    } finally {
      setRegistering(false);
    }
  };

  // Working cancel function
  const handleCancel = () => {
    const confirmed = confirm(
      "Are you sure you want to cancel device registration?"
    );

    if (confirmed) {
      toast.info("Registration cancelled");

      try {
        window.close();

        setTimeout(() => {
          if (!window.closed) {
            try {
              navigate("/");
            } catch (navError) {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                window.location.href = "/";
              }
            }
          }
        }, 200);
      } catch (error) {
        console.error("Cancel error:", error);
        try {
          navigate("/");
        } catch (navError) {
          window.location.href = "/";
        }
      }
    }
  };

  // Clear duplicate device info
  const clearDuplicateInfo = () => {
    setDuplicateDeviceInfo(null);
  };

  // Format date for display
  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return dateString;
    }
  };

  // ✅ FIX: Enhanced loading state that shows service preparation
  if (serviceLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-auto p-6">
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {serviceLoading
                ? "Preparing Device Detection..."
                : "Verifying QR Code..."}
            </h3>
            <p className="text-sm text-gray-500">
              {serviceLoading
                ? "Setting up fingerprinting service for auto-detection..."
                : "Please wait while we verify your QR code..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!qrStatus || !qrStatus.isValid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="text-red-600 text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Invalid QR Code
          </h2>

          {qrStatus?.isExpired && (
            <div>
              <p className="text-gray-600 mb-4">This QR code has expired.</p>
              <p className="text-sm text-gray-500">
                QR codes are valid for 24 hours. Please ask the patient to
                generate a new one.
              </p>
            </div>
          )}

          {qrStatus?.isUsed && (
            <div>
              <p className="text-gray-600 mb-4">
                This QR code has already been used.
              </p>
              <p className="text-sm text-gray-500">
                Each QR code can only be used once for security reasons. Please
                ask for a new QR code if you need to register another device.
              </p>
            </div>
          )}

          {!qrStatus && (
            <div>
              <p className="text-gray-600 mb-4">This QR code is not valid.</p>
              <p className="text-sm text-gray-500">
                Please make sure you scanned the correct QR code from the
                patient's device registration page.
              </p>
            </div>
          )}

          <div className="text-center mt-6">
            <button
              onClick={handleCancel}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
            >
              Close / Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show registration complete message
  if (registrationComplete) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="text-green-600 text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Registration Complete!
          </h2>
          <p className="text-gray-600 mb-4">
            Your device has been successfully registered for accessing{" "}
            {qrStatus.patientName}'s medical records.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            You will be redirected to the login page shortly, or you can close
            this window.
          </p>

          <div className="space-y-3">
            <button
              onClick={() => navigate("/login")}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700"
            >
              Go to Login
            </button>
            <button
              onClick={handleCancel}
              className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700"
            >
              Close Window
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main registration form
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <div className="text-center mb-6">
          <div className="text-blue-600 text-6xl mb-4">👨‍👩‍👧‍👦</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Register Family Device
          </h2>
          <p className="text-gray-600">
            Register this device to access {qrStatus.patientName}'s medical
            records
          </p>
        </div>

        {/* ✅ FIX: Service readiness indicator */}
        {!serviceReady && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-amber-600 border-t-transparent mt-0.5"></div>
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">
                  Finalizing device detection...
                </p>
                <p>Please wait while we complete the setup process.</p>
              </div>
            </div>
          </div>
        )}

        {/* ✅ FIX: Enhanced duplicate device warning for Android */}
        {duplicateDeviceInfo && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <div className="text-red-600 text-xl">⚠️</div>
              <div className="flex-1">
                <div className="text-sm text-red-800">
                  <p className="font-medium mb-1">Device Already Registered</p>
                  <p className="mb-2">
                    This{" "}
                    {/Android/i.test(navigator.userAgent) ? "Android " : ""}
                    device is already registered for {qrStatus.patientName} with
                    the name "{duplicateDeviceInfo.deviceName}".
                  </p>
                  <p className="text-xs text-red-600">
                    Device Type: {duplicateDeviceInfo.deviceType}
                    {duplicateDeviceInfo.registeredAt && (
                      <>
                        {" "}
                        • Registered:{" "}
                        {formatDate(duplicateDeviceInfo.registeredAt)}
                      </>
                    )}
                  </p>
                </div>
                <button
                  onClick={clearDuplicateInfo}
                  className="mt-2 text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Security Information */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <div className="text-blue-600 text-xl">🔒</div>
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Secure Access</p>
              <p>
                This device will be registered using advanced fingerprinting.
                Your access will still be logged for safety purposes.
              </p>
            </div>
          </div>
        </div>

        {/* Device Name Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Device Name
          </label>
          <input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="Enter a name for this device"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={registering || !serviceReady}
          />
          <p className="text-xs text-gray-500 mt-1">
            Example: "Mom's Phone", "Dad's Laptop", "Sister's iPad"
          </p>
          {/* ✅ FIX: Show auto-detection status */}
          {serviceReady && deviceName && (
            <p className="text-xs text-green-600 mt-1">
              ✅ Device automatically detected: {deviceName}
            </p>
          )}
        </div>

        {/* Security Warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <div className="text-amber-600 text-xl">⚠️</div>
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">Security Reminder</p>
              <p>
                Only register devices you personally use and trust. Once
                registered, this device will have authorized access to{" "}
                {qrStatus.patientName}'s medical records.
              </p>
            </div>
          </div>
        </div>

        {/* Registration Button */}
        <button
          onClick={registerDevice}
          disabled={
            registering ||
            !serviceReady ||
            !deviceName.trim() ||
            duplicateDeviceInfo
          }
          className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors mb-4 ${
            registering ||
            !serviceReady ||
            !deviceName.trim() ||
            duplicateDeviceInfo
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {registering ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
              Registering Device...
            </div>
          ) : !serviceReady ? (
            "Preparing Device Detection..."
          ) : duplicateDeviceInfo ? (
            "Device Already Registered"
          ) : (
            "Register This Device"
          )}
        </button>

        {/* QR Expiry Info */}
        <div className="text-center mb-4">
          <p className="text-xs text-gray-500">
            QR Code expires: {formatDate(qrStatus.expiresAt)}
          </p>
        </div>

        {/* Cancel Button */}
        <div className="text-center">
          <button
            onClick={handleCancel}
            className="text-gray-600 hover:text-gray-800 text-sm font-medium"
          >
            Cancel Registration
          </button>
        </div>
      </div>
    </div>
  );
};

export default QRDeviceRegistration;
