// QRDeviceRegistration.jsx - FingerprintJS Pro ONLY Implementation
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import fingerprintService from "../services/fingerprintService"; // FingerprintJS Pro only
import { deviceAPI } from "../api";

const QRDeviceRegistration = () => {
  const { qrToken } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [qrStatus, setQrStatus] = useState(null);
  const [deviceName, setDeviceName] = useState("");
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [duplicateDeviceInfo, setDuplicateDeviceInfo] = useState(null);

  // FingerprintJS Pro specific states
  const [fpjsReady, setFpjsReady] = useState(false);
  const [fpjsError, setFpjsError] = useState(null);
  const [initializingFpjs, setInitializingFpjs] = useState(true);
  const [fpjsHealthInfo, setFpjsHealthInfo] = useState(null);

  /**
   * Initialize FingerprintJS Pro - No fallback allowed for family registration
   */
  const initializeFingerprintService = async () => {
    try {
      setInitializingFpjs(true);
      setFpjsError(null);

      console.log(
        "🔄 Initializing FingerprintJS Pro for family QR registration..."
      );

      // Initialize FingerprintJS Pro service
      await fingerprintService.initialize();

      // Get service health info
      const healthCheck = await fingerprintService.healthCheck();
      setFpjsHealthInfo(healthCheck);

      if (healthCheck.status !== "healthy") {
        throw new Error(
          `FingerprintJS Pro health check failed: ${healthCheck.error}`
        );
      }

      // ✅ REMOVED: testConsistency call since the method doesn't exist
      // The health check already validates that the service is working properly

      console.log("✅ FingerprintJS Pro ready for family registration:", {
        testVisitorId: healthCheck.testVisitorId,
        confidence: healthCheck.confidence,
        service: healthCheck.service,
        adblockerResistant: healthCheck.adblockerResistant,
      });

      // Enhanced device auto-detection
      const detectedName = await autoDetectDeviceName();
      setDeviceName(detectedName);

      setFpjsReady(true);
      console.log(
        "✅ FingerprintJS Pro service ready for family device registration"
      );
    } catch (error) {
      console.error("❌ FingerprintJS Pro initialization failed:", error);
      setFpjsError(error.message);
      setFpjsReady(false);

      // Check if it's an adblocker issue
      const isAdblockerIssue =
        error.message.toLowerCase().includes("blocked") ||
        error.message.toLowerCase().includes("adblocker");

      if (isAdblockerIssue) {
        toast.error(
          "FingerprintJS Pro is being blocked by your adblocker. Please whitelist api.fpjs.io domain or disable adblocker for this site.",
          {
            duration: 15000,
            style: {
              backgroundColor: "#FEF2F2",
              color: "#DC2626",
              border: "1px solid #FECACA",
            },
          }
        );
      } else {
        toast.error(
          "FingerprintJS Pro service failed to initialize. Please refresh the page and try again.",
          {
            duration: 10000,
            style: {
              backgroundColor: "#FEF2F2",
              color: "#DC2626",
              border: "1px solid #FECACA",
            },
          }
        );
      }
    } finally {
      setInitializingFpjs(false);
    }
  };

  const autoDetectDeviceName = async () => {
    try {
      // Use FingerprintJS Pro service for device detection
      const detectedName = fingerprintService.getDeviceName();

      if (detectedName && detectedName !== "Unknown Device") {
        console.log(
          "✅ Device name auto-detected via FingerprintJS Pro:",
          detectedName
        );
        return detectedName;
      }

      // Enhanced fallback detection if FingerprintJS Pro doesn't provide device name
      const userAgent = navigator.userAgent;
      const isAndroid = /Android/i.test(userAgent);
      const isIPhone = /iPhone/i.test(userAgent);
      const isIPad = /iPad/i.test(userAgent);
      const isMac = /Mac/i.test(userAgent) && !isIPad;
      const isWindows = /Windows/i.test(userAgent);

      let fallbackName;

      if (isAndroid) {
        const modelMatch = userAgent.match(/Android.*?;\s*(.*?)\s*Build/);
        if (modelMatch && modelMatch[1]) {
          const model = modelMatch[1].trim();
          const cleanModel = model
            .replace(/^\w+\s/, "")
            .replace(/Build.*$/, "")
            .trim();
          fallbackName = cleanModel || "Android Device";
        } else {
          fallbackName = "Android Device";
        }
      } else if (isIPhone) {
        fallbackName = "iPhone";
      } else if (isIPad) {
        fallbackName = "iPad";
      } else if (isMac) {
        fallbackName = "Mac";
      } else if (isWindows) {
        fallbackName = "Windows PC";
      } else {
        fallbackName = "Family Device";
      }

      console.log("⚠️ Using enhanced fallback device name:", fallbackName);
      return fallbackName;
    } catch (error) {
      console.error("Error in device auto-detection:", error);
      return "Family Device";
    }
  };

  useEffect(() => {
    const initializeComponent = async () => {
      console.log(
        "🚀 Initializing Family QR Device Registration with FingerprintJS Pro..."
      );
      await initializeFingerprintService();
      await checkQRStatus();
    };

    initializeComponent();
  }, [qrToken]);

  const checkQRStatus = async () => {
    try {
      setLoading(true);
      console.log("🔄 Checking QR status for family registration:", qrToken);

      const response = await deviceAPI.checkQRStatus(qrToken);

      if (response.data.success) {
        setQrStatus(response.data.status);
        console.log("✅ Family QR status verified:", response.data.status);

        if (!response.data.status.isValid) {
          if (response.data.status.isExpired) {
            toast.error("QR code has expired. Please ask for a new one.");
          } else if (response.data.status.isUsed) {
            toast.error("QR code has already been used.");
          }
        }
      } else {
        console.error("❌ Invalid family QR code response");
        toast.error("Invalid QR code");
      }
    } catch (error) {
      console.error("❌ Family QR status check error:", error);
      toast.error("Failed to verify QR code");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Register family device using ONLY FingerprintJS Pro
   */
  const registerDevice = async () => {
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
      setRegistering(true);
      setDuplicateDeviceInfo(null);

      console.log(
        "🔄 Generating family device fingerprint with FingerprintJS Pro..."
      );

      // Generate device fingerprint using ONLY FingerprintJS Pro
      const fingerprint = await fingerprintService.generateFingerprint({
        userAction: "family_qr_device_registration",
        qrToken: qrToken,
        deviceName: deviceName.trim(),
        patientName: qrStatus?.patientName,
        component: "QRDeviceRegistration",
        deviceType: "family",
        registrationMethod: "qr_code",
      });

      // Validate the fingerprint response
      if (!fingerprint || !fingerprint.visitorId || !fingerprint.requestId) {
        throw new Error(
          "Invalid FingerprintJS Pro response - missing visitorId or requestId"
        );
      }

      console.log(
        "✅ Family device fingerprint generated with FingerprintJS Pro:",
        {
          visitorId: fingerprint.visitorId,
          requestId: fingerprint.requestId,
          confidence: fingerprint.confidence,
          method: fingerprint.metadata?.method,
          service: fingerprint.metadata?.service,
        }
      );

      // Verify confidence score
      if (fingerprint.confidence < 0.5) {
        console.warn(
          "⚠️ Low confidence score from FingerprintJS Pro:",
          fingerprint.confidence
        );
        toast.warn(
          "Device identification confidence is lower than expected, but registration will proceed."
        );
      }

      console.log(
        "🔄 Registering family device via QR with FingerprintJS Pro..."
      );

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
        deviceType: "family", // ✅ Add deviceType as expected by backend
      };

      console.log("📤 Sending QR family device registration payload:", {
        visitorId: backendPayload.deviceFingerprint.visitorId,
        requestId: backendPayload.deviceFingerprint.requestId,
        confidenceScore: backendPayload.deviceFingerprint.confidenceScore,
        service: backendPayload.deviceFingerprint.metadata?.service,
        deviceName: backendPayload.deviceName,
        deviceType: backendPayload.deviceType,
        qrToken: qrToken,
      });
      const response = await deviceAPI.registerDeviceViaQR(
        qrToken,
        backendPayload
      );

      if (response.data.success) {
        setRegistrationComplete(true);
        console.log(
          "✅ Family device registered successfully with FingerprintJS Pro:",
          response.data.device
        );

        const successMessage = response.data.device.wasReactivated
          ? `Family device reactivated successfully for ${response.data.device.patientName}!`
          : `Family device registered successfully for ${response.data.device.patientName}!`;

        toast.success(successMessage, {
          style: {
            backgroundColor: "#F0FDF4",
            color: "#166534",
            border: "1px solid #BBF7D0",
          },
          duration: 5000,
        });

        // Auto-redirect after success
        setTimeout(() => {
          navigate("/login", {
            state: {
              message: `Family device registered for ${response.data.device.patientName}`,
              deviceInfo: response.data.device,
            },
          });
        }, 3000);
      } else {
        console.error(
          "❌ Family device registration failed:",
          response.data.message
        );
        toast.error(
          response.data.message || "Failed to register family device"
        );
      }
    } catch (error) {
      console.error("❌ Family device registration error:", error);
      handleRegistrationError(error);
    } finally {
      setRegistering(false);
    }
  };

  const handleRegistrationError = (error) => {
    if (error.response?.status === 409) {
      const errorData = error.response.data;
      console.log("🔍 Duplicate family device detected:", errorData);

      if (
        errorData.error === "DEVICE_ALREADY_REGISTERED_ANDROID_QR" ||
        errorData.error === "DEVICE_ALREADY_REGISTERED"
      ) {
        setDuplicateDeviceInfo(errorData.existingDevice);

        const isAndroid = /Android/i.test(navigator.userAgent);
        const deviceType = isAndroid ? "Android device" : "device";

        toast.error(
          `This ${deviceType} is already registered as a family device for ${
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
      }
    } else if (error.response?.status === 400) {
      const errorData = error.response.data;

      if (errorData.error === "QR_EXPIRED") {
        toast.error(
          "QR code has expired. Please ask the patient for a new one."
        );
      } else if (errorData.error === "QR_ALREADY_USED") {
        toast.error("This QR code has already been used.");
      } else if (errorData.error === "QR_NOT_FOUND") {
        toast.error("Invalid QR code. Please check the QR code and try again.");
      } else {
        toast.error(errorData.message || "Registration failed");
      }
    } else if (error.response?.data?.message) {
      toast.error(error.response.data.message);
    } else if (error.message.includes("FingerprintJS Pro")) {
      toast.error("FingerprintJS Pro service error: " + error.message);
    } else {
      toast.error("Failed to register family device. Please try again.");
    }
  };

  const handleCancel = () => {
    const confirmed = window.confirm(
      "Are you sure you want to cancel family device registration?"
    );

    if (confirmed) {
      toast.info("Family device registration cancelled");

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

  const clearDuplicateInfo = () => {
    setDuplicateDeviceInfo(null);
  };

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

  // FingerprintJS Pro Status Component
  const FingerprintJSStatus = () => {
    if (initializingFpjs) {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-blue-800 mb-1">
                Initializing FingerprintJS Pro
              </h4>
              <p className="text-sm text-blue-700">
                Setting up advanced device fingerprinting for family
                registration...
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (fpjsError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <div className="text-red-600 text-xl">❌</div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-800 mb-1">
                FingerprintJS Pro Service Error
              </h4>
              <p className="text-sm text-red-700 mb-2">{fpjsError}</p>
              <p className="text-xs text-red-600 mb-3">
                Family device registration requires FingerprintJS Pro for
                reliable device identification.
              </p>
              <button
                onClick={initializeFingerprintService}
                className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded hover:bg-red-200"
              >
                Retry Initialization
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (fpjsReady && fpjsHealthInfo) {
      return (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center space-x-3">
            <span className="text-green-600">✅</span>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-green-800 mb-1">
                FingerprintJS Pro Ready
              </h4>
              <p className="text-sm text-green-700 mb-1">
                Advanced device fingerprinting active for family registration
              </p>
              <div className="text-xs text-green-600">
                Confidence: {Math.round((fpjsHealthInfo.confidence || 0) * 100)}
                % • Visitor ID: {fpjsHealthInfo.visitorId?.substring(0, 8)}...
              </div>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  // Enhanced loading state
  if (initializingFpjs || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-auto p-6">
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {initializingFpjs
                ? "Initializing FingerprintJS Pro..."
                : "Verifying Family QR Code..."}
            </h3>
            <p className="text-sm text-gray-500">
              {initializingFpjs
                ? "Setting up advanced device fingerprinting service for reliable family device identification..."
                : "Please wait while we verify your family registration QR code..."}
            </p>
            {fpjsHealthInfo && (
              <p className="text-xs text-blue-600 mt-2">
                Service: FingerprintJS Pro • Confidence:{" "}
                {Math.round((fpjsHealthInfo.confidence || 0) * 100)}%
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Invalid QR code state
  if (!qrStatus || !qrStatus.isValid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="text-red-600 text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Invalid Family Registration QR Code
          </h2>

          {qrStatus?.isExpired && (
            <div>
              <p className="text-gray-600 mb-4">
                This family registration QR code has expired.
              </p>
              <p className="text-sm text-gray-500">
                QR codes are valid for 24 hours. Please ask the patient to
                generate a new one from their device management page.
              </p>
            </div>
          )}

          {qrStatus?.isUsed && (
            <div>
              <p className="text-gray-600 mb-4">
                This family registration QR code has already been used.
              </p>
              <p className="text-sm text-gray-500">
                Each QR code can only be used once for security reasons. Please
                ask the patient for a new family registration QR code.
              </p>
            </div>
          )}

          {!qrStatus && (
            <div>
              <p className="text-gray-600 mb-4">
                This family registration QR code is not valid.
              </p>
              <p className="text-sm text-gray-500">
                Please make sure you scanned the correct QR code from the
                patient's family device registration page.
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

  // Registration complete state
  if (registrationComplete) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="text-green-600 text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Family Device Registration Complete!
          </h2>
          <p className="text-gray-600 mb-4">
            Your device has been successfully registered as a family device for
            accessing {qrStatus.patientName}'s medical records using
            FingerprintJS Pro.
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

  // Main family registration form
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <div className="text-center mb-6">
          <div className="text-blue-600 text-6xl mb-4">👨‍👩‍👧‍👦</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Register Family Device
          </h2>
          <p className="text-gray-600">
            Register this device as a family device to access{" "}
            {qrStatus.patientName}'s medical records
          </p>
        </div>

        {/* FingerprintJS Pro Status */}
        <FingerprintJSStatus />

        {/* Duplicate device warning */}
        {duplicateDeviceInfo && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <div className="text-red-600 text-xl">⚠️</div>
              <div className="flex-1">
                <div className="text-sm text-red-800">
                  <p className="font-medium mb-1">
                    Family Device Already Registered
                  </p>
                  <p className="mb-2">
                    This device is already registered as a family device for{" "}
                    {qrStatus.patientName} with the name "
                    {duplicateDeviceInfo.deviceName}".
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
              <p className="font-medium mb-1">Secure Family Access</p>
              <p>
                This device will be registered using FingerprintJS Pro advanced
                fingerprinting technology. All access will be logged for
                security and audit purposes.
              </p>
            </div>
          </div>
        </div>

        {/* Device Name Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Family Device Name
          </label>
          <input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="Enter a name for this family device"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={registering || !fpjsReady}
          />
          <p className="text-xs text-gray-500 mt-1">
            Example: "Mom's Phone", "Dad's Laptop", "Sister's iPad", "Son's
            Android"
          </p>
          {fpjsReady && deviceName && (
            <p className="text-xs text-green-600 mt-1">
              ✅ Device automatically detected with FingerprintJS Pro:{" "}
              {deviceName}
            </p>
          )}
        </div>

        {/* Security Warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <div className="text-amber-600 text-xl">⚠️</div>
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">Family Access Security</p>
              <p>
                Only register devices used by trusted family members. Once
                registered with FingerprintJS Pro, this device will have
                authorized access to {qrStatus.patientName}'s medical records.
              </p>
            </div>
          </div>
        </div>

        {/* Registration Button */}
        <button
          onClick={registerDevice}
          disabled={
            registering ||
            !fpjsReady ||
            !deviceName.trim() ||
            duplicateDeviceInfo
          }
          className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors mb-4 ${
            registering ||
            !fpjsReady ||
            !deviceName.trim() ||
            duplicateDeviceInfo
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {registering ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
              Registering with FingerprintJS Pro...
            </div>
          ) : !fpjsReady ? (
            "Initializing FingerprintJS Pro..."
          ) : duplicateDeviceInfo ? (
            "Family Device Already Registered"
          ) : (
            "Register This Family Device"
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
            Cancel Family Registration
          </button>
        </div>
      </div>
    </div>
  );
};

export default QRDeviceRegistration;
