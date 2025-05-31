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
        console.log("Server error response:", err.response.data);
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

  // View a blob - Cross-browser compatible, no download
  const handleFileClick = async (blobName) => {
    try {
      // Use the new view endpoint that streams content directly
      const viewUrl = `${
        import.meta.env.VITE_REACT_API_URL
      }/api/blobs/${containerName}/${folderName}/${encodeURIComponent(
        blobName
      )}/view`;

      // Get the token for authentication
      const token = localStorage.getItem("token");

      // For cross-browser compatibility, especially Safari on iOS
      // Create a form and submit it to open the file in a new tab
      const form = document.createElement("form");
      form.method = "POST";
      form.action = viewUrl;
      form.target = "_blank";
      form.style.display = "none";

      // Add auth token as a hidden field
      const tokenInput = document.createElement("input");
      tokenInput.type = "hidden";
      tokenInput.name = "token";
      tokenInput.value = token;
      form.appendChild(tokenInput);

      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
    } catch (err) {
      setError("Failed to open file");
      console.error("File open error:", err);
    }
  };

  // Alternative method for viewing files using window.open with auth headers
  const handleFileClickAlternative = async (blobName) => {
    try {
      const token = localStorage.getItem("token");
      const viewUrl = `${
        import.meta.env.VITE_REACT_API_URL
      }/api/blobs/${containerName}/${folderName}/${encodeURIComponent(
        blobName
      )}/view?token=${encodeURIComponent(token)}`;

      // Open in new window/tab - works across all browsers including Safari iOS
      const newWindow = window.open(viewUrl, "_blank", "noopener,noreferrer");

      if (!newWindow) {
        // Fallback if popup was blocked
        setError("Please allow popups for this site to view files");
      }
    } catch (err) {
      setError("Failed to open file");
      console.error("File open error:", err);
    }
  };

  if (loading) return <Loader size="large" />;

  return (
    <div>
      <div className="flex items-center mb-6">
        <button
          onClick={handleBack}
          className="text-blue-600 hover:text-blue-800 mr-2"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-800">{folderName}</h1>
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
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-sm text-gray-500">
                Maximum file size: 10MB. Files will be saved with their original
                names and opened for viewing only (no downloads allowed).
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                color="blue"
                disabled={!file || uploadLoading}
              >
                {uploadLoading ? (
                  <span className="flex items-center">
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

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          Patient Files
          <span className="text-sm font-normal text-gray-600 ml-2">
            (Click file names to view - No downloads allowed)
          </span>
        </h2>

        {blobs.length === 0 ? (
          <p className="text-gray-600">No files found in this folder.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    File Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Modified
                  </th>
                  {canDelete && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {blobs.map((blob) => (
                  <tr key={blob.name} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleFileClickAlternative(blob.name)}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-left transition-colors duration-200"
                        title="Click to view file (view only, no download)"
                      >
                        <div className="flex items-center">
                          <svg
                            className="w-4 h-4 mr-2 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                          {blob.name}
                        </div>
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                        {blob.contentType || "Unknown"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatFileSize(blob.contentLength)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(blob.lastModified).toLocaleString()}
                    </td>
                    {canDelete && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <Button
                          color="red"
                          className="text-xs py-1 px-2"
                          onClick={() => confirmDelete(blob)}
                        >
                          Delete
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
        <p className="text-sm text-gray-500">
          Are you sure you want to delete the file{" "}
          <span className="font-bold">{blobToDelete?.name}</span>? This action
          cannot be undone and the file will be permanently removed from
          storage.
        </p>
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
