// Enhanced CreatePatientRequest.jsx with folder availability checking

import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAssignments } from "../../hooks/useAssignments";
import { usePatientRequests } from "../../hooks/usePatientRequests";
import { patientRequestsAPI } from "../../api"; // For new API call
import Loader from "../common/Loader";
import Alert from "../common/Alert";
import Button from "../common/Button";

const CreatePatientRequest = () => {
  const navigate = useNavigate();
  const {
    assignmentsData,
    fetchAssignments,
    loading: loadingAssignments,
  } = useAssignments();
  const { createRequest, loading: submitting } = usePatientRequests();

  // Form state
  const [formData, setFormData] = useState({
    patientName: "",
    patientEmail: "",
    patientPhone: "",
    containerName: "",
    folderName: "",
  });

  // UI state
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [availableFolders, setAvailableFolders] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderStats, setFolderStats] = useState(null);

  // Track initial load to prevent infinite calls
  const initialLoadDone = useRef(false);
  const fetchAssignmentsRef = useRef(fetchAssignments);

  // Update ref when fetchAssignments changes
  useEffect(() => {
    fetchAssignmentsRef.current = fetchAssignments;
  }, [fetchAssignments]);

  // Load assignments when component mounts - but only once
  useEffect(() => {
    const loadData = async () => {
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        await fetchAssignmentsRef.current(true);
      }
    };
    loadData();

    return () => {
      initialLoadDone.current = false;
    };
  }, []);

  // ✅ NEW: Fetch available folders for selected container
  const fetchAvailableFolders = async (containerName) => {
    if (!containerName) {
      setAvailableFolders([]);
      setFolderStats(null);
      return;
    }

    try {
      setLoadingFolders(true);

      // Get all folders the doctor has access to
      const container = assignmentsData.find(
        (c) => c.containerName === containerName
      );

      if (!container) {
        setAvailableFolders([]);
        setFolderStats(null);
        return;
      }

      const allFolders = container.folders || [];

      // ✅ NEW: Check which folders are already taken
      // You'll need to create this API endpoint
      try {
        const response = await patientRequestsAPI.getAvailableFolders(
          containerName
        );
        const takenFolders = response.data.takenFolders || [];

        // Filter out taken folders
        const availableFoldersList = allFolders.filter(
          (folder) =>
            !takenFolders.some(
              (taken) => taken.folderName === folder.folderName
            )
        );

        setAvailableFolders(availableFoldersList);
        setFolderStats({
          total: allFolders.length,
          available: availableFoldersList.length,
          taken: takenFolders.length,
          takenFolders: takenFolders,
        });
      } catch (apiError) {
        // Fallback: show all folders if API fails
        console.error("Failed to check folder availability:", apiError);
        setAvailableFolders(allFolders);
        setFolderStats({
          total: allFolders.length,
          available: allFolders.length,
          taken: 0,
          takenFolders: [],
        });
      }
    } catch (error) {
      console.error("Error fetching folders:", error);
      setAvailableFolders([]);
      setFolderStats(null);
    } finally {
      setLoadingFolders(false);
    }
  };

  // Update available folders when containerName changes
  useEffect(() => {
    if (formData.containerName && assignmentsData.length > 0) {
      fetchAvailableFolders(formData.containerName);
    } else {
      setAvailableFolders([]);
      setFolderStats(null);
    }
  }, [formData.containerName, assignmentsData]);

  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });

    // Clear folder selection when container changes
    if (name === "containerName") {
      setFormData((prev) => ({
        ...prev,
        folderName: "",
      }));
    }
  };

  // Enhanced form submission with better error handling
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate form
    if (
      !formData.patientName ||
      !formData.patientEmail ||
      !formData.patientPhone ||
      !formData.containerName ||
      !formData.folderName
    ) {
      setError("Please fill all required fields");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.patientEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    // Phone validation (basic)
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    if (!phoneRegex.test(formData.patientPhone)) {
      setError("Please enter a valid phone number");
      return;
    }

    try {
      setError("");
      setSuccess("");

      const result = await createRequest(formData);

      if (result.error) {
        // ✅ Enhanced error handling for specific conflicts
        if (
          result.error.includes("already in use") ||
          result.error.includes("already has an active request")
        ) {
          setError(result.error);
          // Refresh folder availability
          await fetchAvailableFolders(formData.containerName);
        } else {
          setError(result.error);
        }
      } else {
        setSuccess("Patient request created successfully!");

        // Reset form
        setFormData({
          patientName: "",
          patientEmail: "",
          patientPhone: "",
          containerName: "",
          folderName: "",
        });
        setAvailableFolders([]);
        setFolderStats(null);

        // Redirect to requests list after short delay
        setTimeout(() => {
          navigate("/patient-requests");
        }, 2000);
      }
    } catch (err) {
      setError("Failed to create patient request");
      console.error("Create request error:", err);
    }
  };

  // Handle manual refresh of assignments
  const handleRefreshAssignments = async () => {
    await fetchAssignments(true);
    if (formData.containerName) {
      await fetchAvailableFolders(formData.containerName);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Request Patient Access
          </h1>
          <p className="text-gray-600 mt-1">
            Create a request for a patient to access a specific folder
          </p>
        </div>

        {/* Back Button */}
        <div className="mb-6">
          <Button
            color="gray"
            onClick={() => navigate("/patient-requests")}
            className="inline-flex items-center"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Requests
          </Button>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg shadow p-6">
          {/* Error and Success Messages */}
          {error && <Alert message={error} type="error" className="mb-4" />}
          {success && (
            <Alert message={success} type="success" className="mb-4" />
          )}

          {/* Loading State */}
          {loadingAssignments ? (
            <div className="text-center py-8">
              <Loader size="medium" />
              <p className="text-gray-600 mt-2">Loading your assignments...</p>
            </div>
          ) : assignmentsData.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-400 mb-4">
                <svg
                  className="w-16 h-16 mx-auto"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15.586 13H14a1 1 0 01-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Assignments Found
              </h3>
              <p className="text-gray-500 mb-4">
                You don't have any container/folder assignments yet. Contact
                your administrator to get assignments.
              </p>
              <Button
                color="blue"
                onClick={handleRefreshAssignments}
                disabled={loadingAssignments}
              >
                Refresh Assignments
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Patient Information */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Patient Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="patientName"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Patient Name *
                    </label>
                    <input
                      type="text"
                      id="patientName"
                      name="patientName"
                      value={formData.patientName}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter patient's full name"
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="patientPhone"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Phone Number *
                    </label>
                    <input
                      type="tel"
                      id="patientPhone"
                      name="patientPhone"
                      value={formData.patientPhone}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter phone number"
                      required
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label
                    htmlFor="patientEmail"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Email Address *
                  </label>
                  <input
                    type="email"
                    id="patientEmail"
                    name="patientEmail"
                    value={formData.patientEmail}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter patient's email address"
                    required
                  />
                </div>
              </div>

              {/* Access Assignment */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Access Assignment
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="containerName"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Container *
                    </label>
                    <select
                      id="containerName"
                      name="containerName"
                      value={formData.containerName}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select a container</option>
                      {assignmentsData.map((container) => (
                        <option
                          key={container.containerName}
                          value={container.containerName}
                        >
                          {container.containerName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="folderName"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Available Folder *{" "}
                      {loadingFolders && (
                        <span className="text-blue-500">(Loading...)</span>
                      )}
                    </label>
                    <select
                      id="folderName"
                      name="folderName"
                      value={formData.folderName}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                      disabled={
                        !formData.containerName ||
                        loadingFolders ||
                        availableFolders.length === 0
                      }
                    >
                      <option value="">
                        {!formData.containerName
                          ? "Select container first"
                          : loadingFolders
                          ? "Loading folders..."
                          : availableFolders.length === 0
                          ? "No available folders"
                          : "Select an available folder"}
                      </option>
                      {availableFolders.map((folder) => (
                        <option
                          key={folder.folderName}
                          value={folder.folderName}
                        >
                          {folder.folderName}
                        </option>
                      ))}
                    </select>

                    {/* ✅ NEW: Folder availability stats */}
                    {folderStats && (
                      <div className="mt-2 text-sm text-gray-600">
                        <div className="flex items-center space-x-4">
                          <span className="text-green-600">
                            ✓ {folderStats.available} available
                          </span>
                          <span className="text-red-600">
                            ✗ {folderStats.taken} already assigned
                          </span>
                          <span className="text-gray-500">
                            Total: {folderStats.total}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ✅ NEW: Folder Conflict Warning */}
              {folderStats && folderStats.taken > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <div className="flex items-start">
                    <svg
                      className="w-5 h-5 text-yellow-400 mt-0.5 mr-2 flex-shrink-0"
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
                      <p className="text-sm font-medium text-yellow-800 mb-1">
                        Folder Availability Notice
                      </p>
                      <p className="text-sm text-yellow-700">
                        {folderStats.taken} folder
                        {folderStats.taken > 1 ? "s are" : " is"} already
                        assigned to other patients. Only available folders are
                        shown in the dropdown above.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  color="gray"
                  onClick={() => navigate("/patient-requests")}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  color="blue"
                  disabled={submitting || loadingFolders}
                  loading={submitting}
                >
                  {submitting ? "Creating Request..." : "Create Request"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreatePatientRequest;
