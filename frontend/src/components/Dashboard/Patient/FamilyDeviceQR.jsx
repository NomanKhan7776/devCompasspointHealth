// components/Dashboard/Patient/FamilyDeviceQR.jsx - QR Code Generation for Family Registration
import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { deviceAPI } from "../../../api";
import {QRCodeSVG as QRCode} from "qrcode.react"; 

const FamilyDeviceQR = () => {
  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [registeredDevices, setRegisteredDevices] = useState([]);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    loadRegisteredDevices();
  }, []);

  const loadRegisteredDevices = async () => {
    try {
      const response = await deviceAPI.getMyDevices();
      if (response.data.success) {
        setRegisteredDevices(
          response.data.devices.filter((d) => d.deviceType === "family")
        );
      }
    } catch (error) {
      console.error("Error loading devices:", error);
    }
  };

  const generateQRCode = async () => {
    try {
      setLoading(true);
      console.log("🔄 Generating QR code for family device registration...");

      const response = await deviceAPI.generateQRForFamilyRegistration();

      if (response.data.success) {
        setQrData({
          qrToken: response.data.qrToken,
          qrUrl: response.data.qrUrl,
          expiresAt: response.data.expiresAt,
          generatedAt: new Date().toISOString(),
        });

        console.log("✅ QR code generated successfully:", {
          qrToken: response.data.qrToken.substring(0, 8) + "...",
          expiresAt: response.data.expiresAt,
        });

        toast.success("QR code generated successfully!", {
          style: {
            backgroundColor: "#F0FDF4",
            color: "#166534",
            border: "1px solid #BBF7D0",
          },
        });
      } else {
        toast.error(response.data.message || "Failed to generate QR code");
      }
    } catch (error) {
      console.error("❌ Error generating QR code:", error);
      toast.error("Failed to generate QR code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(type);
      toast.success(`${type} copied to clipboard!`);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Failed to copy to clipboard");
    }
  };

  const shareQRCode = async () => {
    if (!qrData) return;

    const shareData = {
      title: "Device Registration",
      text: "Register your device to access my medical records",
      url: qrData.qrUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Fallback to copying URL
        await copyToClipboard(qrData.qrUrl, "URL");
      }
    } catch (error) {
      console.error("Share failed:", error);
      await copyToClipboard(qrData.qrUrl, "URL");
    }
  };

  const formatTimeRemaining = (expiresAt) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry - now;

    if (diff <= 0) return "Expired";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    } else {
      return `${minutes}m remaining`;
    }
  };

  const isQRExpired = () => {
    if (!qrData) return false;
    return new Date() > new Date(qrData.expiresAt);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Family Device Registration
        </h1>
        <p className="text-gray-600">
          Generate QR codes for family members to register their devices
        </p>
      </div>

      {/* Instructions Toggle */}
      <div className="mb-6">
        <button
          onClick={() => setShowInstructions(!showInstructions)}
          className="flex items-center text-blue-600 hover:text-blue-700 font-medium"
        >
          <i
            className={`fas fa-chevron-${
              showInstructions ? "down" : "right"
            } mr-2`}
          ></i>
          How it works
        </button>

        {showInstructions && (
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-800 mb-2">
              Family Device Registration Process:
            </h3>
            <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
              <li>Generate a secure QR code that expires in 24 hours</li>
              <li>Share the QR code or URL with your family member</li>
              <li>They scan the QR code or visit the URL on their device</li>
              <li>They enter a device name and complete registration</li>
              <li>
                Their device is now authorized to access your medical records
              </li>
            </ol>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* QR Code Generation */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            Generate QR Code
          </h2>

          {!qrData ? (
            <div className="text-center">
              <div className="text-gray-400 text-6xl mb-4">📱</div>
              <p className="text-gray-600 mb-6">
                Generate a QR code for family members to register their devices
              </p>

              <button
                onClick={generateQRCode}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Generating QR Code...
                  </div>
                ) : (
                  "Generate QR Code"
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* QR Code Display */}
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <QRCode
                  value={qrData.qrUrl}
                  size={200}
                  level="M"
                  includeMargin={true}
                />
              </div>

              {/* QR Code Status */}
              <div
                className={`p-3 rounded-lg ${
                  isQRExpired()
                    ? "bg-red-50 border border-red-200"
                    : "bg-green-50 border border-green-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm font-medium ${
                      isQRExpired() ? "text-red-800" : "text-green-800"
                    }`}
                  >
                    {isQRExpired() ? "❌ Expired" : "✅ Active"}
                  </span>
                  <span
                    className={`text-xs ${
                      isQRExpired() ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {isQRExpired()
                      ? "Generate a new QR code"
                      : formatTimeRemaining(qrData.expiresAt)}
                  </span>
                </div>
              </div>

              {/* QR Code Actions */}
              <div className="space-y-2">
                <button
                  onClick={shareQRCode}
                  disabled={isQRExpired()}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  <i className="fas fa-share mr-2"></i>
                  Share QR Code
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => copyToClipboard(qrData.qrUrl, "URL")}
                    disabled={isQRExpired()}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      copySuccess === "URL"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:bg-gray-50 disabled:text-gray-400"
                    }`}
                  >
                    {copySuccess === "URL" ? "✅ Copied!" : "📋 Copy URL"}
                  </button>

                  <button
                    onClick={() => copyToClipboard(qrData.qrToken, "Token")}
                    disabled={isQRExpired()}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      copySuccess === "Token"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:bg-gray-50 disabled:text-gray-400"
                    }`}
                  >
                    {copySuccess === "Token" ? "✅ Copied!" : "📋 Copy Token"}
                  </button>
                </div>

                <button
                  onClick={() => {
                    setQrData(null);
                    setCopySuccess(false);
                  }}
                  className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Generate New QR Code
                </button>
              </div>

              {/* URL Display */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Registration URL:</p>
                <p className="text-sm font-mono text-gray-800 break-all">
                  {qrData.qrUrl}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Family Devices List */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            Registered Family Devices
          </h2>

          {registeredDevices.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-400 text-4xl mb-3">👨‍👩‍👧‍👦</div>
              <p className="text-gray-600 text-sm">
                No family devices registered yet
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {registeredDevices.map((device) => (
                <div
                  key={device.fingerprintId}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-800">
                      {device.deviceName}
                    </h3>
                    {device.isActive && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-gray-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Type:</span>
                      <span className="font-medium">Family Device</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Registered:</span>
                      <span className="font-medium">
                        {new Date(device.registeredAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Used:</span>
                      <span className="font-medium">
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
      </div>

      {/* Security Notice */}
      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <div className="text-amber-600 text-xl">🔒</div>
          <div className="text-sm text-amber-800">
            <p className="font-medium mb-1">Security Notice</p>
            <p>
              Only share QR codes with trusted family members. Each QR code
              expires in 24 hours and can only be used once. All device access
              is logged for security purposes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FamilyDeviceQR;
