import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { blobsAPI } from "../../../api";
import { useAuth } from "../../../hooks/useAuth.js";
import Button from "../../common/Button";
import Alert from "../../common/Alert";
import Loader from "../../common/Loader";
import Modal from "../../common/Modal";

const BlobViewer = () => {
  const { containerName, folderName } = useParams();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [blobs, setBlobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [file, setFile] = useState(null);

  // Modal states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [blobToDelete, setBlobToDelete] = useState(null);

  // Determine user permissions
  const isAdmin = currentUser?.role === "admin";
  const canUpload =
    isAdmin || currentUser?.role === "doctor" || currentUser?.role === "nurse";
  const canDelete = isAdmin;

  // Handle back navigation based on user role
  const handleBack = () => {
    if (isAdmin) {
      navigate(`/admin/containers/${containerName}`);
    } else {
      navigate(`/containers/${containerName}`);
    }
  };

  // Fetch blobs from the specified container and folder
  const fetchBlobs = async () => {
    try {
      setLoading(true);
      const res = await blobsAPI.getBlobs(containerName, folderName);
      setBlobs(res.data.blobs);
    } catch (err) {
      setError("Failed to load patient data");
      console.error("Error fetching blobs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlobs();
  }, [containerName, folderName]);

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);

    // Clear any previous errors when a new file is selected
    if (selectedFile) {
      setError("");
    }
  };

  // Upload file to the current folder with original filename
  const handleUpload = async (e) => {
    e.preventDefault();

    if (!file) {
      setError("Please select a file to upload");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    // Add the original filename to preserve it
    formData.append("filename", file.name);

    try {
      setUploadLoading(true);
      setError("");

      const response = await blobsAPI.uploadBlob(
        containerName,
        folderName,
        formData
      );

      setSuccessMessage("File uploaded successfully");
      setFile(null);

      // Reset the file input
      document.getElementById("file-upload").value = "";

      // Refresh the blob list
      fetchBlobs();
    } catch (err) {
      console.error("Upload error details:", err);

      // Get the most specific error message possible
      let errorMessage = "Failed to upload file. Please try again.";

      if (err.response) {
        // The server responded with an error
        errorMessage =
          err.response.data?.message || "Server rejected the file upload";
      } else if (err.request) {
        // The request was made but no response received
        errorMessage = "No response from server. Please check your connection.";
      } else {
        // Something else caused an error
        errorMessage = err.message || "Unknown upload error";
      }

      setError(errorMessage);
    } finally {
      setUploadLoading(false);
    }
  };

  // Open delete confirmation modal
  const confirmDelete = (blob) => {
    setBlobToDelete(blob);
    setDeleteModalOpen(true);
  };

  // Delete the selected blob
  const handleDelete = async () => {
    try {
      await blobsAPI.deleteBlob(containerName, folderName, blobToDelete.name);
      setSuccessMessage("File deleted successfully");
      setDeleteModalOpen(false);
      setBlobToDelete(null);
      fetchBlobs();
    } catch (err) {
      setError("Failed to delete file");
      console.error("Delete error:", err);
    }
  };

  // Detect if we're on Safari iOS
  const isSafariIOS = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    return (
      /iphone|ipad|ipod/.test(userAgent) &&
      /safari/.test(userAgent) &&
      !/chrome|crios|fxios|edgios/.test(userAgent)
    );
  };

  // SAFARI iOS COMPATIBLE file viewer
  const handleFileClick = async (blobName) => {
    try {
      setError("");

      // Use the Safari-compatible file opening
      const result = await blobsAPI.viewBlob(
        containerName,
        folderName,
        blobName
      );

      if (result.success) {
        if (result.method === "safari_ios_navigate") {
          setSuccessMessage(
            "Opening file... You may need to use the back button to return."
          );
        } else {
          setSuccessMessage("File opened in new tab");
        }
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch (error) {
      console.error("File view error:", error);

      let errorMessage = "Failed to open file";

      if (
        error.message.includes("session") ||
        error.message.includes("expired")
      ) {
        errorMessage = "Your session has expired. Please log in again.";
      } else if (error.message.includes("permission")) {
        errorMessage = "You don't have permission to view this file";
      } else if (error.message.includes("Popup blocked")) {
        if (isSafariIOS()) {
          errorMessage =
            "Unable to open file. This may be due to Safari's security restrictions.";
        } else {
          errorMessage =
            "Popup blocked by browser. Please allow popups for this site and try again.";
        }
      } else {
        errorMessage =
          error.message || "Failed to open file. Please try again.";
      }

      setError(errorMessage);
      setTimeout(() => setError(""), 7000);
    }
  };

  if (loading) return <Loader size="large" />;

  return (
    <div className="px-2 sm:px-0">
      <div className="flex items-center mb-4 sm:mb-6">
        <button
          onClick={handleBack}
          className="text-blue-600 hover:text-blue-800 mr-2 text-sm sm:text-base"
        >
          ← Back
        </button>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
          {folderName}
        </h1>
      </div>

      {error && (
        <Alert message={error} type="error" onClose={() => setError("")} />
      )}

      {successMessage && (
        <Alert
          message={successMessage}
          type="success"
          onClose={() => setSuccessMessage("")}
        />
      )}

      {canUpload && (
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            Upload New File
          </h2>

          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select File
              </label>
              <input
                id="file-upload"
                type="file"
                onChange={handleFileChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              <p className="mt-1 text-xs sm:text-sm text-gray-500">
                Maximum file size: 10MB. Files will be saved with their original
                names.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                color="blue"
                disabled={!file || uploadLoading}
                className="w-full sm:w-auto"
              >
                {uploadLoading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Uploading...
                  </span>
                ) : (
                  "Upload"
                )}
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-800">
            Patient Files
          </h2>
          <div className="flex items-center text-xs sm:text-sm text-gray-600 bg-blue-50 px-2 sm:px-3 py-1 sm:py-2 rounded-lg">
            <svg
              className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            <span className="font-medium">
              {isSafariIOS() ? "Tap to Open" : "Click to Open"}
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {/* Safari iOS specific notice */}
          {isSafariIOS() && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start">
                <svg
                  className="w-5 h-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <p className="text-sm font-medium text-yellow-800">
                    Safari iOS Note
                  </p>
                  <p className="text-sm text-yellow-700">
                    Files will open in the same tab. Use the back button to
                    return to this page.
                  </p>
                </div>
              </div>
            </div>
          )}

          {blobs.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <svg
                className="mx-auto h-8 w-8 sm:h-12 sm:w-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No files found
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                No files found in this folder.
              </p>
            </div>
          ) : (
            /* MOBILE-FRIENDLY FILE CARDS - NO HORIZONTAL SCROLLING */
            <div className="space-y-3">
              {blobs.map((blob) => (
                <div
                  key={blob.name}
                  className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:bg-gray-50 transition-colors"
                >
                  {/* Mobile Layout - Everything Visible */}
                  <div className="space-y-3">
                    {/* File Header - Name and Type */}
                    <div className="flex items-start justify-between">
                      <button
                        onClick={() => handleFileClick(blob.name)}
                        className="text-left flex-1 min-w-0 mr-2"
                        title={
                          isSafariIOS()
                            ? "Tap to open file"
                            : "Click to open file in new tab"
                        }
                      >
                        <div className="flex items-center">
                          <svg
                            className="w-4 h-4 mr-2 text-blue-500 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-blue-600 hover:text-blue-800 truncate">
                              {blob.name}
                            </p>
                            <p className="text-xs text-blue-500">
                              {isSafariIOS() ? "Tap to open" : "Click to open"}
                            </p>
                          </div>
                        </div>
                      </button>

                      {/* File Type Badge */}
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 flex-shrink-0">
                        {blob.contentType
                          ? blob.contentType.split("/")[0].toUpperCase()
                          : "FILE"}
                      </span>
                    </div>

                    {/* File Details Row */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center">
                        <svg
                          className="w-3 h-3 mr-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        {new Date(blob.lastModified).toLocaleDateString()}
                      </span>
                      <span className="flex items-center">
                        <svg
                          className="w-3 h-3 mr-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                          />
                        </svg>
                        {formatFileSize(blob.contentLength)}
                      </span>
                      <span className="flex items-center">
                        <svg
                          className="w-3 h-3 mr-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a1.994 1.994 0 01-1.414.586H7a4 4 0 01-4-4v-9a4 4 0 014-4z"
                          />
                        </svg>
                        {blob.contentType || "Unknown"}
                      </span>
                    </div>

                    {/* Action Buttons Row - Only show if user can delete */}
                    {canDelete && (
                      <div className="flex justify-end pt-2 border-t border-gray-100">
                        <Button
                          color="red"
                          className="text-xs py-1 px-3"
                          onClick={() => confirmDelete(blob)}
                        >
                          <svg
                            className="w-3 h-3 mr-1"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirm File Deletion"
        footer={
          <>
            <Button
              color="red"
              className="w-full sm:w-auto sm:ml-3"
              onClick={handleDelete}
            >
              Delete
            </Button>
            <Button
              color="gray"
              className="mt-3 w-full sm:mt-0 sm:w-auto"
              onClick={() => setDeleteModalOpen(false)}
            >
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Are you sure you want to delete the file{" "}
            <span className="font-bold">{blobToDelete?.name}</span>? This action
            cannot be undone and the file will be permanently removed from
            storage.
          </p>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <svg
                className="h-5 w-5 text-red-400 mr-3 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-red-800">
                  Warning: Permanent Deletion
                </h4>
                <p className="text-sm text-red-700 mt-1">
                  This file will be permanently deleted from secure storage and
                  cannot be recovered.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// Helper function to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export default BlobViewer;
