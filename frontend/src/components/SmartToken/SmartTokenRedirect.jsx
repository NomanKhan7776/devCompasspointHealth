// src/components/SmartToken/SmartTokenRedirect.jsx
import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

const SmartTokenRedirect = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const signature = searchParams.get("s");

    if (!id || !signature) {
      setError("Invalid SmartToken URL - missing ID or signature");
      return;
    }

    // Validate the format
    if (!signature.match(/^[A-F0-9-]+$/i)) {
      setError("Invalid signature format");
      return;
    }

    // Build backend URL
    const backendUrl = `${
      import.meta.env.VITE_REACT_API_URL
    }/patients/verify/${id}?s=${signature}`;

    // Redirect immediately to backend - no countdown
    window.location.href = backendUrl;
  }, [id, searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-4">
              Invalid SmartToken
            </h1>
            <p className="text-red-600 mb-4">{error}</p>
            <div className="bg-red-50 rounded-lg p-4">
              <p className="text-sm text-red-800">
                Please ensure you are scanning a valid SmartToken device.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-blue-600 animate-spin"
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
          </div>

          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            SmartToken Detected
          </h1>
          <p className="text-gray-600 mb-6">
            Verifying emergency access token...
          </p>

          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-center mb-2">
              <svg
                className="w-5 h-5 text-blue-600 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm font-medium text-blue-800">
                Token ID: {id ? `${id.substring(0, 8)}...` : "Processing"}
              </p>
            </div>
            <p className="text-sm text-blue-800">
              Redirecting to patient data...
            </p>
          </div>

          <div className="text-xs text-gray-500">
            <p>CompassPoint Health PRMS</p>
            <p>Emergency Medical Access System</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmartTokenRedirect;
