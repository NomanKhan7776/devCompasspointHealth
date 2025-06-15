// SmartTokenManagement.jsx - Enhanced with Original UI Design Preserved
import React, { useState, useEffect, useRef } from "react";
import { smartTokenAPI, assignmentsAPI } from "../../../api";
import Button from "../../common/Button";
import Alert from "../../common/Alert";
import Loader from "../../common/Loader";
import Modal from "../../common/Modal";

const SmartTokenManagement = () => {
  const [unclaimedTokens, setUnclaimedTokens] = useState([]);
  const [assignedTokens, setAssignedTokens] = useState([]);
  const [activeTab, setActiveTab] = useState("unclaimed"); // "unclaimed", "assigned"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Assignment modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const [selectedContainer, setSelectedContainer] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientDateOfBirth, setPatientDateOfBirth] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Revoke modal state
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [tokenToRevoke, setTokenToRevoke] = useState(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Container state
  const [containers, setContainers] = useState([]);
  const [filteredContainers, setFilteredContainers] = useState([]);
  const [containerSearch, setContainerSearch] = useState("");

  // Folder state
  const [folders, setFolders] = useState([]);
  const [filteredFolders, setFilteredFolders] = useState([]);
  const [folderSearch, setFolderSearch] = useState("");
  const [folderLoading, setFolderLoading] = useState(false);

  // NEW: Assigned folders tracking
  const [assignedFolders, setAssignedFolders] = useState({});
  const [folderWarning, setFolderWarning] = useState("");

  // Custom dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const folderDropdownRef = useRef(null);

  // Helper function to sort container names naturally
  const naturalSort = (a, b) => {
    const aMatch = a.match(/(\D+)(\d+)/);
    const bMatch = b.match(/(\D+)(\d+)/);

    if (aMatch && bMatch && aMatch[1] === bMatch[1]) {
      return parseInt(aMatch[2]) - parseInt(bMatch[2]);
    }
    return a.localeCompare(b);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
      if (
        folderDropdownRef.current &&
        !folderDropdownRef.current.contains(event.target)
      ) {
        setFolderDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Load tokens
  const loadTokens = async () => {
    try {
      setLoading(true);
      setError("");

      // Load both unclaimed and assigned tokens
      const [unclaimedResponse, assignedResponse] = await Promise.all([
        smartTokenAPI.getUnclaimedTokens(),
        smartTokenAPI.getAllAssignedTokens(),
      ]);

      setUnclaimedTokens(unclaimedResponse.data.tokens || []);
      setAssignedTokens(assignedResponse.data.tokens || []);
    } catch (err) {
      console.error("❌ Error loading tokens:", err);
      setError(err.response?.data?.message || "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  };

  // Load containers
  const fetchContainers = async () => {
    try {
      const res = await assignmentsAPI.getAllContainers();
      const sortedContainers = [...res.data.containers].sort(naturalSort);
      setContainers(sortedContainers);
      setFilteredContainers(sortedContainers);
    } catch (err) {
      setError("Failed to load containers");
      console.error(err);
    }
  };

  // Load folders and assigned folders
  const fetchFolders = async (containerName) => {
    try {
      setFolderLoading(true);
      setFolders([]);
      setFilteredFolders([]);
      setFolderSearch("");
      setAssignedFolders({});

      // Load both folders and assigned folders
      const [foldersResponse, assignedResponse] = await Promise.all([
        assignmentsAPI.getFolders(containerName),
        smartTokenAPI.getAssignedFolders(containerName),
      ]);

      const allFolders = foldersResponse.data.folders.sort(naturalSort);
      const assignedFoldersData = assignedResponse.data.assignedFolders || {};

      setFolders(allFolders);
      setFilteredFolders(allFolders);
      setAssignedFolders(assignedFoldersData);
    } catch (err) {
      setError(`Failed to load folders for ${containerName}`);
      console.error(err);
    } finally {
      setFolderLoading(false);
    }
  };

  // Update filtered containers when search term changes
  useEffect(() => {
    if (containerSearch.trim() === "") {
      setFilteredContainers(containers);
    } else {
      const filtered = containers.filter((container) =>
        container.toLowerCase().includes(containerSearch.toLowerCase())
      );
      setFilteredContainers(filtered);
    }
  }, [containerSearch, containers]);

  // Update filtered folders when search term changes
  useEffect(() => {
    if (folderSearch.trim() === "") {
      setFilteredFolders(folders);
    } else {
      const filtered = folders.filter((folder) =>
        folder.toLowerCase().includes(folderSearch.toLowerCase())
      );
      setFilteredFolders(filtered);
    }
  }, [folderSearch, folders]);

  // Load initial data
  useEffect(() => {
    loadTokens();
  }, []);

  // Handle container change
  const handleContainerChange = (containerName) => {
    setSelectedContainer(containerName);
    setDropdownOpen(false);
    setSelectedFolder("");
    setFolderWarning("");

    if (containerName) {
      fetchFolders(containerName);
    } else {
      setFolders([]);
      setFilteredFolders([]);
      setAssignedFolders({});
    }
  };

  // Handle folder selection with assignment check
  const handleFolderSelection = (folderName) => {
    const isAssigned = assignedFolders[folderName];

    if (isAssigned) {
      setFolderWarning(
        `This patient folder is already assigned to token ${truncateId(
          isAssigned.tokenId
        )} (Patient: ${
          isAssigned.patientName
        }). If you want to assign this patient folder to a different token, the existing assignment will be automatically removed and transferred to the new token.`
      );
    } else {
      setFolderWarning("");
    }

    setSelectedFolder(folderName);
    setFolderDropdownOpen(false);
  };

  // Open assign modal
  const openAssignModal = async (token) => {
    setSelectedToken(token);
    setSelectedContainer("");
    setSelectedFolder("");
    setPatientName("");
    setPatientDateOfBirth("");
    setError("");
    setFolderWarning("");
    setContainerSearch("");
    setFolderSearch("");
    setAssignModalOpen(true);
    await fetchContainers();
  };

  // Enhanced handleAssignToken function with better reassignment handling
  const handleAssignToken = async () => {
    if (!selectedContainer || !selectedFolder || !patientName.trim()) {
      setError("Please fill in all required fields");
      return;
    }

    try {
      setAssigning(true);
      setError("");

      const response = await smartTokenAPI.assignTokenToPatient({
        tokenId: selectedToken.smartTokenId,
        containerName: selectedContainer,
        folderName: selectedFolder,
        patientName: patientName.trim(),
        patientDateOfBirth: patientDateOfBirth.trim(),
      });

      // Handle different types of assignment responses
      if (response.data.reassignment) {
        // Show reassignment success message with details
        setSuccess(
          `Patient folder successfully reassigned to ${patientName}. ${response.data.message}`
        );
      } else {
        // Show standard assignment success message
        setSuccess(`Token assigned to ${patientName} successfully`);
      }

      setAssignModalOpen(false);
      loadTokens();
    } catch (err) {
      console.error("Assignment Error:", err);

      // Enhanced error handling
      const errorMessage =
        err.response?.data?.message || "Failed to assign token";

      // Check for specific error types
      if (errorMessage.includes("revoked token")) {
        setError(
          "Cannot assign a revoked token. Please reactivate the token first."
        );
      } else if (errorMessage.includes("already assigned")) {
        setError(
          "This patient folder is already assigned to another token. The system will automatically handle the reassignment."
        );
      } else {
        setError(errorMessage);
      }
    } finally {
      setAssigning(false);
    }
  };

  // Open revoke modal
  const openRevokeModal = (token) => {
    setTokenToRevoke(token);
    setRevokeReason("");
    setError("");
    setRevokeModalOpen(true);
  };

  // Handle revoke token
  const handleRevokeToken = async () => {
    if (!revokeReason.trim()) {
      setError("Please provide a reason for revocation");
      return;
    }

    try {
      setRevoking(true);
      setError("");

      await smartTokenAPI.revokeToken(
        tokenToRevoke.smartTokenId,
        revokeReason.trim()
      );

      setSuccess(
        `SmartToken for ${
          tokenToRevoke.patientName || tokenToRevoke.smartTokenId
        } has been remotely disconnected`
      );
      setRevokeModalOpen(false);
      loadTokens();
    } catch (err) {
      console.error("Revoke Error:", err);
      setError(err.response?.data?.message || "Failed to revoke token");
    } finally {
      setRevoking(false);
    }
  };

  // Handle reactivate token
  const handleReactivateToken = async (token) => {
    try {
      setError("");

      await smartTokenAPI.reactivateToken(token.smartTokenId);

      setSuccess(
        `SmartToken for ${
          token.patientName || token.smartTokenId
        } has been reactivated`
      );
      loadTokens();
    } catch (err) {
      console.error("Reactivate Error:", err);
      setError(err.response?.data?.message || "Failed to reactivate token");
    }
  };

  // NEW: Open delete modal
  const openDeleteModal = (token) => {
    setTokenToDelete(token);
    setDeleteReason("");
    setDeleteConfirmation("");
    setError("");
    setDeleteModalOpen(true);
  };

  // NEW: Handle delete token
  const handleDeleteToken = async () => {
    if (!deleteReason.trim()) {
      setError("Please provide a reason for deletion");
      return;
    }

    if (deleteConfirmation !== "DELETE") {
      setError("Please type 'DELETE' to confirm permanent deletion");
      return;
    }

    try {
      setDeleting(true);
      setError("");

      await smartTokenAPI.deleteToken(tokenToDelete.smartTokenId);

      setSuccess(
        `SmartToken for ${
          tokenToDelete.patientName || tokenToDelete.smartTokenId
        } has been permanently deleted`
      );
      setDeleteModalOpen(false);
      loadTokens();
    } catch (err) {
      console.error("Delete Error:", err);
      setError(err.response?.data?.message || "Failed to delete token");
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return "Invalid Date";
    }
  };

  const truncateId = (id) => {
    if (!id || id.length < 16) return id;
    return `${id.substring(0, 8)}...${id.substring(id.length - 8)}`;
  };

  const handleRefresh = () => {
    loadTokens();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96">
        <Loader size="large" />
        <p className="mt-4 text-gray-600">Loading SmartTokens...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          SmartToken Management
        </h1>
        <Button color="blue" onClick={handleRefresh} disabled={loading}>
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
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh
        </Button>
      </div>

      {error && (
        <Alert message={error} type="error" onClose={() => setError("")} />
      )}
      {success && (
        <Alert
          message={success}
          type="success"
          onClose={() => setSuccess("")}
        />
      )}

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow-md mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab("unclaimed")}
            className={`px-6 py-3 text-sm font-medium ${
              activeTab === "unclaimed"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Unclaimed Tokens ({unclaimedTokens.length})
          </button>
          <button
            onClick={() => setActiveTab("assigned")}
            className={`px-6 py-3 text-sm font-medium ${
              activeTab === "assigned"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Assigned Tokens ({assignedTokens.length})
          </button>
        </div>

        <div className="p-6">
          {activeTab === "unclaimed" && (
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Unclaimed SmartTokens
              </h2>
              {unclaimedTokens.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 mb-4">
                    <svg
                      className="mx-auto h-12 w-12"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M15 7a2 2 0 012 2m0 0a2 2 0 012 2v2a2 2 0 01-2 2m-2-2a2 2 0 00-2-2m2 2v2a2 2 0 01-2 2m0 0H9m6 0a2 2 0 01-2-2v-2a2 2 0 00-2-2m2 2H9a2 2 0 00-2-2v2a2 2 0 002 2m0 0h6v2a2 2 0 002 2H9a2 2 0 01-2-2v-2z"
                      />
                    </svg>
                  </div>
                  <p className="text-gray-600">No unclaimed tokens available</p>
                  <p className="text-gray-500 text-sm">
                    New tokens will appear here once registered
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Device
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Secure Chip ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Registered
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {unclaimedTokens.map((token) => (
                        <tr key={token.smartTokenId}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10">
                                <div className="h-10 w-10 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
                                  <svg
                                    className="h-6 w-6 text-white"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M15 7a2 2 0 012 2m0 0a2 2 0 012 2v2a2 2 0 01-2 2m-2-2a2 2 0 00-2-2m2 2v2a2 2 0 01-2 2m0 0H9m6 0a2 2 0 01-2-2v-2a2 2 0 00-2-2m2 2H9a2 2 0 00-2-2v2a2 2 0 002 2m0 0h6v2a2 2 0 002 2H9a2 2 0 01-2-2v-2z"
                                    />
                                  </svg>
                                </div>
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900 font-mono">
                                  {truncateId(token.smartTokenId)}
                                </div>
                                <div className="text-sm text-gray-500">
                                  SmartToken Device
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 font-mono">
                              {truncateId(token.secureChipId)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(token.createdAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <Button
                              color="green"
                              className="text-xs py-1 px-3"
                              onClick={() => openAssignModal(token)}
                            >
                              Assign to Patient
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "assigned" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">
                  Assigned SmartTokens
                </h2>
                <div className="flex space-x-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {
                      assignedTokens.filter((t) => t.status === "assigned")
                        .length
                    }{" "}
                    active
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    {
                      assignedTokens.filter((t) => t.status === "revoked")
                        .length
                    }{" "}
                    revoked
                  </span>
                </div>
              </div>

              {assignedTokens.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 mb-4">
                    <svg
                      className="mx-auto h-12 w-12"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </div>
                  <p className="text-gray-600">No assigned tokens found</p>
                  <p className="text-gray-500 text-sm">
                    Tokens will appear here once assigned to patients
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Patient
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Device
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Location
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Assigned
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {assignedTokens.map((token) => (
                        <tr key={token.smartTokenId}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10">
                                <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                                  <svg
                                    className="h-6 w-6 text-gray-600"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                    />
                                  </svg>
                                </div>
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">
                                  {token.patientName || "Unknown Patient"}
                                </div>
                                {token.patientDateOfBirth && (
                                  <div className="text-sm text-gray-500">
                                    DOB: {token.patientDateOfBirth}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 font-mono">
                              {truncateId(token.smartTokenId)}
                            </div>
                            <div className="text-sm text-gray-500 font-mono">
                              {truncateId(token.secureChipId)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div>
                              <div className="font-medium">
                                {token.containerName}
                              </div>
                              <div className="text-xs text-gray-400">
                                {token.folderName}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {token.status === "assigned" ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Active
                              </span>
                            ) : (
                              <div>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 mb-1">
                                  Revoked
                                </span>
                                {token.revokeReason && (
                                  <div className="text-xs text-gray-500">
                                    {token.revokeReason}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(token.assignedAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              {token.status === "assigned" ? (
                                <Button
                                  color="red"
                                  className="text-xs py-1 px-3"
                                  onClick={() => openRevokeModal(token)}
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
                                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636"
                                    />
                                  </svg>
                                  Disconnect
                                </Button>
                              ) : (
                                <Button
                                  color="green"
                                  className="text-xs py-1 px-3"
                                  onClick={() => handleReactivateToken(token)}
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
                                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                    />
                                  </svg>
                                  Reactivate
                                </Button>
                              )}

                              {/* NEW: Delete Button */}
                              <Button
                                color="gray"
                                className="text-xs py-1 px-3"
                                onClick={() => openDeleteModal(token)}
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
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Assignment Modal */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title="Assign SmartToken to Patient"
        footer={
          <>
            <Button
              color="green"
              onClick={handleAssignToken}
              disabled={
                assigning ||
                !selectedContainer ||
                !selectedFolder ||
                !patientName.trim()
              }
              className="ml-3"
            >
              {assigning ? "Assigning..." : "Assign Token"}
            </Button>
            <Button
              color="gray"
              onClick={() => setAssignModalOpen(false)}
              className="ml-3"
            >
              Cancel
            </Button>
          </>
        }
      >
        {selectedToken && (
          <div className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                Token Information
              </h4>
              <p className="text-sm text-gray-700">
                ID: {truncateId(selectedToken.smartTokenId)}
              </p>
              <p className="text-sm text-gray-700">
                Secure Chip: {truncateId(selectedToken.secureChipId)}
              </p>
              <p className="text-sm text-gray-700">
                Registered: {formatDate(selectedToken.createdAt)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Patient Name *
              </label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter patient name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Patient Date of Birth
              </label>
              <input
                type="date"
                value={patientDateOfBirth}
                onChange={(e) => setPatientDateOfBirth(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search Containers
              </label>
              <input
                type="text"
                value={containerSearch}
                onChange={(e) => setContainerSearch(e.target.value)}
                placeholder="Search containers..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 mb-2"
              />

              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Container *
              </label>
              <div className="relative" ref={dropdownRef}>
                <div
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 cursor-pointer flex justify-between items-center"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                >
                  <span>{selectedContainer || "-- Select a Container --"}</span>
                  <svg
                    className="h-5 w-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>

                {dropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                    <div
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-200"
                      onClick={() => handleContainerChange("")}
                    >
                      -- Select a Container --
                    </div>
                    {filteredContainers.map((container) => (
                      <div
                        key={container}
                        className={`px-3 py-2 hover:bg-gray-100 cursor-pointer ${
                          selectedContainer === container
                            ? "bg-blue-50 text-blue-700"
                            : ""
                        }`}
                        onClick={() => handleContainerChange(container)}
                      >
                        {container}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {selectedContainer && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search Folders
                </label>
                <input
                  type="text"
                  value={folderSearch}
                  onChange={(e) => setFolderSearch(e.target.value)}
                  placeholder="Search folders..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 mb-2"
                />

                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Patient Folder *
                </label>

                {folderLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader size="small" />
                  </div>
                ) : (
                  <div className="relative" ref={folderDropdownRef}>
                    <div
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 cursor-pointer flex justify-between items-center"
                      onClick={() => setFolderDropdownOpen(!folderDropdownOpen)}
                    >
                      <span>
                        {selectedFolder || "-- Select a Patient Folder --"}
                      </span>
                      <svg
                        className="h-5 w-5 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>

                    {folderDropdownOpen && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                        <div
                          className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-200"
                          onClick={() => handleFolderSelection("")}
                        >
                          -- Select a Patient Folder --
                        </div>
                        {filteredFolders.length > 0 ? (
                          filteredFolders.map((folder) => {
                            const isAssigned = assignedFolders[folder];
                            return (
                              <div
                                key={folder}
                                className={`px-3 py-2 cursor-pointer ${
                                  selectedFolder === folder
                                    ? "bg-blue-50 text-blue-700"
                                    : isAssigned
                                    ? "bg-yellow-50 hover:bg-yellow-100"
                                    : "hover:bg-gray-100"
                                }`}
                                onClick={() => handleFolderSelection(folder)}
                              >
                                <div className="flex items-center justify-between">
                                  <span
                                    className={
                                      isAssigned ? "text-yellow-800" : ""
                                    }
                                  >
                                    {folder}
                                  </span>
                                  {isAssigned && (
                                    <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded-full">
                                      Assigned
                                    </span>
                                  )}
                                </div>
                                {isAssigned && (
                                  <div className="text-xs text-yellow-700 mt-1">
                                    Token: {truncateId(isAssigned.tokenId)} |
                                    Patient: {isAssigned.patientName}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="px-3 py-2 text-gray-500 text-sm italic">
                            {folders.length === 0
                              ? "No folders available in this container."
                              : "No folders match your search."}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* NEW: Folder Warning Message */}
                {folderWarning && (
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <div className="flex">
                      <svg
                        className="h-5 w-5 text-yellow-500 mr-2 mt-0.5"
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
                      <p className="text-sm text-yellow-800">{folderWarning}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Revoke Modal */}
      <Modal
        isOpen={revokeModalOpen}
        onClose={() => setRevokeModalOpen(false)}
        title="Remote Disconnect SmartToken"
        footer={
          <>
            <Button
              color="red"
              onClick={handleRevokeToken}
              disabled={revoking || !revokeReason.trim()}
              className="ml-3"
            >
              {revoking ? "Disconnecting..." : "Disconnect Token"}
            </Button>
            <Button
              color="gray"
              onClick={() => setRevokeModalOpen(false)}
              className="ml-3"
            >
              Cancel
            </Button>
          </>
        }
      >
        {tokenToRevoke && (
          <div className="space-y-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start">
                <svg
                  className="h-5 w-5 text-red-500 mt-1 mr-3"
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
                  <h4 className="text-sm font-medium text-red-800 mb-2">
                    Warning: Remote Disconnect
                  </h4>
                  <p className="text-sm text-red-700">
                    This action will immediately revoke access for this
                    SmartToken. The token will no longer provide emergency
                    access to patient data.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                Token Information
              </h4>
              <p className="text-sm text-gray-700">
                <strong>Patient:</strong>{" "}
                {tokenToRevoke.patientName || "Unknown"}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Token ID:</strong>{" "}
                {truncateId(tokenToRevoke.smartTokenId)}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Location:</strong> {tokenToRevoke.containerName}/
                {tokenToRevoke.folderName}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for Revocation *
              </label>
              <select
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Select a reason --</option>
                <option value="Token lost by patient">
                  Token lost by patient
                </option>
                <option value="Token damaged or malfunctioning">
                  Token damaged or malfunctioning
                </option>
                <option value="Patient reported token stolen">
                  Patient reported token stolen
                </option>
                <option value="Security breach suspected">
                  Security breach suspected
                </option>
                <option value="Patient no longer needs access">
                  Patient no longer needs access
                </option>
                <option value="Administrative revocation">
                  Administrative revocation
                </option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-yellow-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> The token can be reactivated later if
                    needed. This action is logged for security audit purposes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* NEW: Delete Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Permanently Delete SmartToken"
        footer={
          <>
            <Button
              color="red"
              onClick={handleDeleteToken}
              disabled={
                deleting ||
                !deleteReason.trim() ||
                deleteConfirmation !== "DELETE"
              }
              className="ml-3"
            >
              {deleting ? "Deleting..." : "Delete Permanently"}
            </Button>
            <Button
              color="gray"
              onClick={() => setDeleteModalOpen(false)}
              className="ml-3"
            >
              Cancel
            </Button>
          </>
        }
      >
        {tokenToDelete && (
          <div className="space-y-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start">
                <svg
                  className="h-5 w-5 text-red-500 mt-1 mr-3"
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
                  <h4 className="text-sm font-medium text-red-800 mb-2">
                    Warning: Permanent Deletion
                  </h4>
                  <p className="text-sm text-red-700">
                    This action will permanently delete this SmartToken from the
                    system. This action cannot be undone. The token will be
                    completely removed and can never be recovered.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start">
                <svg
                  className="h-5 w-5 text-yellow-500 mt-1 mr-3"
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
                  <h4 className="text-sm font-medium text-yellow-800 mb-2">
                    When to Use Delete
                  </h4>
                  <p className="text-sm text-yellow-700">
                    Use deletion only when the physical token is permanently
                    lost, stolen, or destroyed and you need to assign the
                    patient folder to a new token. For temporary issues, use
                    "Disconnect" instead.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                Token Information
              </h4>
              <p className="text-sm text-gray-700">
                <strong>Patient:</strong>{" "}
                {tokenToDelete.patientName || "Unknown"}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Token ID:</strong>{" "}
                {truncateId(tokenToDelete.smartTokenId)}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Secure Chip:</strong>{" "}
                {truncateId(tokenToDelete.secureChipId)}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Location:</strong> {tokenToDelete.containerName}/
                {tokenToDelete.folderName}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Status:</strong>{" "}
                <span
                  className={`px-2 py-1 rounded-full text-xs ${
                    tokenToDelete.status === "assigned"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {tokenToDelete.status === "assigned" ? "Active" : "Revoked"}
                </span>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for Deletion *
              </label>
              <select
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Select a reason --</option>
                <option value="Physical token permanently lost">
                  Physical token permanently lost
                </option>
                <option value="Token stolen and cannot be recovered">
                  Token stolen and cannot be recovered
                </option>
                <option value="Token physically damaged beyond repair">
                  Token physically damaged beyond repair
                </option>
                <option value="Need to assign patient folder to new token">
                  Need to assign patient folder to new token
                </option>
                <option value="Patient deceased - cleanup required">
                  Patient deceased - cleanup required
                </option>
                <option value="Administrative cleanup">
                  Administrative cleanup
                </option>
                <option value="Other permanent removal">
                  Other permanent removal
                </option>
              </select>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800 font-medium">
                Type "DELETE" below to confirm permanent deletion:
              </p>
              <input
                type="text"
                value={deleteConfirmation}
                placeholder="Type DELETE to confirm"
                className="mt-2 w-full px-3 py-2 border border-red-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500"
                onChange={(e) => setDeleteConfirmation(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SmartTokenManagement;
