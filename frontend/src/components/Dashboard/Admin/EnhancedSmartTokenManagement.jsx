// components/Dashboard/Admin/EnhancedSmartTokenManagement.jsx - UPDATED WITH SMART PATIENT FILTERING
import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { smartTokenAPI, assignmentsAPI } from "../../../api";

const EnhancedSmartTokenManagement = () => {
  const [activeTab, setActiveTab] = useState("assigned");
  const [assignedTokens, setAssignedTokens] = useState([]);
  const [unclaimedTokens, setUnclaimedTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);

  // ✅ NEW: Assignment mode state
  const [assignmentMode, setAssignmentMode] = useState("patient_based"); // "patient_based" or "manual"
  const [patientAssignments, setPatientAssignments] = useState(null);
  const [loadingPatientData, setLoadingPatientData] = useState(false);

  // Assignment form state
  const [patientUsers, setPatientUsers] = useState([]);
  const [doctorUsers, setDoctorUsers] = useState([]);
  const [selectedPatientUser, setSelectedPatientUser] = useState("");
  const [selectedDoctorUser, setSelectedDoctorUser] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientDateOfBirth, setPatientDateOfBirth] = useState("");
  const [selectedContainer, setSelectedContainer] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("");

  // Container and folder data
  const [allContainers, setAllContainers] = useState([]);
  const [allFolders, setAllFolders] = useState([]);
  const [filteredContainers, setFilteredContainers] = useState([]);
  const [filteredFolders, setFilteredFolders] = useState([]);
  const [assignedFolders, setAssignedFolders] = useState({});
  const [containerSearch, setContainerSearch] = useState("");
  const [folderSearch, setFolderSearch] = useState("");
  const [folderLoading, setFolderLoading] = useState(false);
  const [loadingContainers, setLoadingContainers] = useState(false);

  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ✅ Natural sort function for proper numeric sequence
  const naturalSort = (a, b) => {
    const aMatch = a.match(/^(.+?)(\d+)$/);
    const bMatch = b.match(/^(.+?)(\d+)$/);

    if (aMatch && bMatch) {
      const [, aPrefixA, aNumberA] = aMatch;
      const [, aPrefixB, aNumberB] = bMatch;

      if (aPrefixA === aPrefixB) {
        return parseInt(aNumberA, 10) - parseInt(aNumberB, 10);
      }
    }

    return a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  };

  // ✅ ENHANCED: Reset assignment form function
  const resetAssignmentForm = () => {
    setSelectedContainer("");
    setSelectedFolder("");
    setSelectedPatientUser("");
    setSelectedDoctorUser("");
    setPatientName("");
    setPatientDateOfBirth("");
    setError("");
    setSuccess("");
    setContainerSearch("");
    setFolderSearch("");
    setAllContainers([]);
    setAllFolders([]);
    setFilteredContainers([]);
    setFilteredFolders([]);
    setAssignedFolders({});
    setPatientAssignments(null);
    setAssignmentMode("patient_based");
  };

  // ✅ NEW: Function to clear everything including token
  const resetEntireForm = () => {
    setSelectedToken(null);
    resetAssignmentForm();
  };

  useEffect(() => {
    loadTokens();
    loadPatientUsers();
  }, []);

  // ✅ NEW: Handle patient user selection and load their assignments
  useEffect(() => {
    if (selectedPatientUser && assignmentMode === "patient_based") {
      // Only call if we're in patient-based mode and have a selected patient
      handlePatientUserChange(selectedPatientUser);
    } else if (!selectedPatientUser && assignmentMode === "manual") {
      // Only reset when switching to manual mode or clearing patient selection
      setPatientAssignments(null);
      setFilteredContainers(allContainers);
      setSelectedContainer("");
      setSelectedFolder("");
      // DON'T clear patient name here - only clear when explicitly switching modes
    }
  }, [selectedPatientUser]); // REMOVED allContainers dependency

  // ADD this new useEffect to handle mode switching:
  useEffect(() => {
    if (assignmentMode === "manual") {
      // Clear patient-specific data when switching to manual mode
      setSelectedPatientUser("");
      setPatientName("");
      setPatientDateOfBirth("");
      setPatientAssignments(null);
      setFilteredContainers(allContainers);
      setSelectedContainer("");
      setSelectedFolder("");
      setError("");
    }
  }, [assignmentMode, allContainers]);

  // ✅ Handle container selection
  useEffect(() => {
    if (selectedContainer) {
      loadFoldersForContainer(selectedContainer);
    } else {
      setFilteredFolders([]);
      setSelectedFolder("");
    }
  }, [selectedContainer]);

  // ✅ Filter containers when search term changes
  useEffect(() => {
    if (containerSearch.trim() === "") {
      setFilteredContainers(
        assignmentMode === "patient_based" && patientAssignments
          ? getPatientContainers()
          : allContainers
      );
    } else {
      const baseContainers =
        assignmentMode === "patient_based" && patientAssignments
          ? getPatientContainers()
          : allContainers;

      const filtered = baseContainers.filter((container) =>
        container.toLowerCase().includes(containerSearch.toLowerCase())
      );
      setFilteredContainers(filtered);
    }
  }, [containerSearch, allContainers, assignmentMode, patientAssignments]);

  // ✅ Filter folders when search term changes
  useEffect(() => {
    if (folderSearch.trim() === "") {
      setFilteredFolders(allFolders);
    } else {
      const filtered = allFolders.filter((folder) =>
        folder.toLowerCase().includes(folderSearch.toLowerCase())
      );
      setFilteredFolders(filtered);
    }
  }, [folderSearch, allFolders]);

  // ✅ NEW: Get patient's assigned containers
  const getPatientContainers = () => {
    if (!patientAssignments) return [];
    return patientAssignments.containers.map((c) => c.containerName);
  };

  // ✅ NEW: Get patient's assigned folders for specific container
  const getPatientFoldersForContainer = (containerName) => {
    if (!patientAssignments) return [];
    return patientAssignments.folders
      .filter((f) => f.containerName === containerName)
      .map((f) => f.folderName);
  };

  const loadTokens = async () => {
    try {
      setLoading(true);
      console.log("🔍 Loading tokens with smartTokenAPI...");

      const [assignedResponse, unclaimedResponse] = await Promise.all([
        smartTokenAPI.getAllAssignedTokens(),
        smartTokenAPI.getUnclaimedTokens(),
      ]);

      console.log("✅ Responses received:", {
        assignedResponse,
        unclaimedResponse,
      });

      if (assignedResponse.data.success) {
        setAssignedTokens(assignedResponse.data.tokens);
        console.log(
          "✅ Assigned tokens loaded:",
          assignedResponse.data.tokens.length
        );
      }

      if (unclaimedResponse.data.success) {
        setUnclaimedTokens(unclaimedResponse.data.tokens);
        console.log(
          "✅ Unclaimed tokens loaded:",
          unclaimedResponse.data.tokens.length
        );
      }
    } catch (error) {
      console.error("❌ Error loading tokens:", error);
      toast.error("Failed to load tokens");
    } finally {
      setLoading(false);
    }
  };

  const loadPatientUsers = async () => {
    try {
      console.log("🔍 Loading patient users...");
      const response = await smartTokenAPI.getPatientsForAssignment();
      console.log("✅ Patients response:", response);

      if (response.data.success) {
        setPatientUsers(response.data.patients);
        console.log("✅ Patients loaded:", response.data.patients.length);
      }
    } catch (error) {
      console.error("❌ Error loading patients:", error);
    }
  };

  // ✅ NEW: Handle patient user selection and load their assignments
  const handlePatientUserChange = async (patientUserId) => {
    if (!patientUserId) {
      // Only clear when explicitly deselecting patient
      setPatientName("");
      setPatientDateOfBirth("");
      setPatientAssignments(null);
      setFilteredContainers(allContainers);
      setSelectedContainer("");
      setSelectedFolder("");
      setError("");
      return;
    }

    try {
      setLoadingPatientData(true);
      setError("");

      // Find selected patient info and AUTO-FILL the name
      const selectedPatient = patientUsers.find(
        (p) => p.userId === parseInt(patientUserId)
      );

      if (selectedPatient) {
        console.log("✅ Auto-filling patient name:", selectedPatient.name);
        setPatientName(selectedPatient.name); // AUTO-FILL NAME

        // Load doctors for this patient
        loadDoctorsForPatient(patientUserId);
      }

      // Load patient's current assignments
      const assignmentsResponse = await assignmentsAPI.getUserAssignments(
        patientUserId
      );

      if (assignmentsResponse.data.success) {
        const assignments = {
          containers: assignmentsResponse.data.containerAssignments || [],
          folders: assignmentsResponse.data.folderAssignments || [],
        };

        setPatientAssignments(assignments);

        // Filter containers to only show what patient has access to
        const patientContainerNames = assignments.containers.map(
          (c) => c.containerName
        );
        const filtered = allContainers.filter((container) =>
          patientContainerNames.includes(container)
        );

        setFilteredContainers(filtered);

        // Auto-select container if patient has only one
        if (filtered.length === 1) {
          setSelectedContainer(filtered[0]);
        } else {
          setSelectedContainer("");
          setSelectedFolder("");
        }

        if (filtered.length === 0) {
          setError(
            "⚠️ This patient has no container assignments. Please assign container access first or use manual selection."
          );
        } else {
          setError(""); // Clear any previous errors
        }

        console.log("✅ Patient assignments loaded:", {
          containers: assignments.containers.length,
          folders: assignments.folders.length,
          availableContainers: filtered.length,
        });
      }
    } catch (error) {
      console.error("❌ Error loading patient assignments:", error);
      setError("Failed to load patient assignments");
    } finally {
      setLoadingPatientData(false);
    }
  };

  const loadDoctorsForPatient = async (patientUserId) => {
    try {
      console.log("🔍 Loading doctors for patient:", patientUserId);
      const response = await smartTokenAPI.getDoctorsForPatient(patientUserId);
      console.log("✅ Doctors response:", response);

      if (response.data.success) {
        setDoctorUsers(response.data.doctors);
        console.log("✅ Doctors loaded:", response.data.doctors.length);
      }
    } catch (error) {
      console.error("❌ Error loading doctors:", error);
      setDoctorUsers([]);
    }
  };

  // ✅ NEW: Load all containers
  const loadAllContainers = async () => {
    try {
      setLoadingContainers(true);
      console.log("🔍 Loading containers...");
      const response = await assignmentsAPI.getAllContainers();
      const containers = response.data.containers || [];
      const sortedContainers = [...containers].sort(naturalSort);
      setAllContainers(sortedContainers);
      setFilteredContainers(sortedContainers);
      console.log("✅ Containers loaded:", sortedContainers.length);
    } catch (error) {
      console.error("Error loading containers:", error);
      toast.error("Failed to load containers");
    } finally {
      setLoadingContainers(false);
    }
  };

  // ✅ ENHANCED: Load folders for selected container (filtered by patient assignments)
  const loadFoldersForContainer = async (containerName) => {
    try {
      setFolderLoading(true);
      setAllFolders([]);
      setFilteredFolders([]);
      setFolderSearch("");
      setAssignedFolders({});

      console.log("🔍 Loading folders for container:", containerName);

      const [foldersResponse, assignedResponse] = await Promise.all([
        assignmentsAPI.getFolders(containerName),
        smartTokenAPI.getAssignedFolders(containerName),
      ]);

      let folders = foldersResponse.data.folders.sort(naturalSort);
      const assignedFoldersData = assignedResponse.data.assignedFolders || {};

      // ✅ If in patient-based mode, filter folders by patient's assignments
      if (assignmentMode === "patient_based" && patientAssignments) {
        const patientFolderNames = getPatientFoldersForContainer(containerName);
        folders = folders.filter((folder) =>
          patientFolderNames.includes(folder)
        );

        // Auto-select folder if patient has only one in this container
        if (folders.length === 1) {
          setSelectedFolder(folders[0]);
        }
      }

      setAllFolders(folders);
      setFilteredFolders(folders);
      setAssignedFolders(assignedFoldersData);

      console.log("✅ Folders loaded:", folders.length);
      console.log(
        "✅ Assigned folders:",
        Object.keys(assignedFoldersData).length
      );
    } catch (error) {
      console.error(`❌ Error loading folders for ${containerName}:`, error);
      setError(`Failed to load folders for ${containerName}`);
      toast.error(`Failed to load folders for ${containerName}`);
    } finally {
      setFolderLoading(false);
    }
  };

  const handleContainerSelect = async (containerName) => {
    setSelectedContainer(containerName);
    setSelectedFolder("");
    setAllFolders([]);
    setFilteredFolders([]);

    if (containerName) {
      await loadFoldersForContainer(containerName);
    }
  };

  // ✅ ENHANCED: Open assignment modal with container loading
  const openAssignModal = async (token) => {
    console.log("🔍 Opening modal for token:", token);

    // Reset form and set token
    resetAssignmentForm();
    setSelectedToken(token);
    setAssignModalOpen(true);

    // Load containers
    await loadAllContainers();

    console.log("🔍 Modal opened, token set to:", token?.smartTokenId);
  };

  // ✅ NEW: Toggle assignment mode
  const toggleAssignmentMode = () => {
    const newMode =
      assignmentMode === "patient_based" ? "manual" : "patient_based";
    setAssignmentMode(newMode);

    if (newMode === "manual") {
      setSelectedPatientUser("");
      setFilteredContainers(allContainers);
      setPatientAssignments(null);
    } else {
      setSelectedContainer("");
      setSelectedFolder("");
    }
    setError("");
  };

  const handleEnhancedAssignment = async () => {
    console.log("🔍 handleEnhancedAssignment called");

    // Enhanced validation
    if (
      !selectedToken ||
      !patientName.trim() ||
      !selectedContainer ||
      !selectedFolder
    ) {
      setError("Please fill in all required fields");
      return;
    }

    if (assignmentMode === "patient_based" && !selectedPatientUser) {
      setError("Please select a patient user in patient-based mode");
      return;
    }

    try {
      setAssigning(true);
      setError("");

      console.log("🔍 API call payload:", {
        tokenId: selectedToken.smartTokenId,
        containerName: selectedContainer,
        folderName: selectedFolder,
        patientName: patientName.trim(),
        patientDateOfBirth: patientDateOfBirth,
        patientUserId: selectedPatientUser || null,
        doctorUserId: selectedDoctorUser || null,
      });

      const response = await smartTokenAPI.assignTokenToPatient({
        tokenId: selectedToken.smartTokenId,
        containerName: selectedContainer,
        folderName: selectedFolder,
        patientName: patientName.trim(),
        patientDateOfBirth: patientDateOfBirth,
        patientUserId: selectedPatientUser || null,
        doctorUserId: selectedDoctorUser || null,
      });

      console.log("✅ Assignment response:", response);

      if (response.data.success) {
        toast.success("✅ SmartToken assigned successfully!");
        setAssignModalOpen(false);
        loadTokens();
        resetEntireForm();
      } else {
        setError(response.data.message || "Failed to assign token");
      }
    } catch (error) {
      console.error("❌ Assignment error:", error);
      setError(error.response?.data?.message || "Failed to assign token");
    } finally {
      setAssigning(false);
    }
  };

  const handleDeleteToken = async (tokenId) => {
    if (
      !confirm(
        "Are you sure you want to permanently delete this token? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      console.log("🔍 Deleting token:", tokenId);
      const response = await smartTokenAPI.deleteToken(tokenId);

      if (response.data.success) {
        toast.success("Token deleted successfully");
        loadTokens();
        console.log("✅ Token deleted successfully");
      } else {
        toast.error(response.data.message || "Failed to delete token");
      }
    } catch (error) {
      console.error("❌ Delete error:", error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error("Failed to delete token");
      }
    }
  };

  // ✅ Handle modal close
  const handleModalClose = () => {
    setAssignModalOpen(false);
    resetEntireForm();
  };

  const truncateId = (id) => {
    if (!id || id.length <= 16) return id;
    return `${id.substring(0, 8)}...${id.substring(id.length - 8)}`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Enhanced SmartToken Management
          </h1>
          <p className="text-gray-600">
            Manage SmartToken assignments with intelligent patient filtering
          </p>
        </div>
        <button
          onClick={loadTokens}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab("assigned")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "assigned"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Assigned Tokens ({assignedTokens.length})
          </button>
          <button
            onClick={() => setActiveTab("unclaimed")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "unclaimed"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Unclaimed Tokens ({unclaimedTokens.length})
          </button>
        </nav>
      </div>

      {/* Assigned Tokens Tab */}
      {activeTab === "assigned" && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {assignedTokens.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">🏷️</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No assigned tokens
              </h3>
              <p className="text-gray-600">
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
                      Token Info
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assigned Doctor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Devices
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {assignedTokens.map((token) => (
                    <tr key={token.smartTokenId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
                              <span className="text-white font-medium text-sm">
                                {token.patientName?.charAt(0) || "P"}
                              </span>
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
                            {token.patientUserName && (
                              <div className="text-sm text-blue-600">
                                Account: {token.patientUserName}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 font-mono">
                          {truncateId(token.smartTokenId)}
                        </div>
                        <div className="text-sm text-gray-500">
                          Assigned: {formatDate(token.assignedAt)}
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
                        {token.doctorName ? (
                          <div className="text-sm">
                            <div className="text-gray-900 font-medium">
                              Dr. {token.doctorName}
                            </div>
                            <div className="text-gray-500 text-xs">
                              {token.doctorUsername}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">
                            Not assigned
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {token.registeredDevices || 0} devices
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => openAssignModal(token)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Reassign
                          </button>
                          <button
                            onClick={() =>
                              handleDeleteToken(token.smartTokenId)
                            }
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
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

      {/* Unclaimed Tokens Tab */}
      {activeTab === "unclaimed" && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {unclaimedTokens.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">📦</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No unclaimed tokens
              </h3>
              <p className="text-gray-600">
                All tokens have been assigned to patients
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Token ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Secure Chip ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {unclaimedTokens.map((token) => (
                    <tr key={token.smartTokenId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-mono text-gray-900">
                          {truncateId(token.smartTokenId)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-mono text-gray-900">
                          {truncateId(token.secureChipId)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(token.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => openAssignModal(token)}
                            className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                          >
                            Assign
                          </button>
                          <button
                            onClick={() =>
                              handleDeleteToken(token.smartTokenId)
                            }
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
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

      {/* ✅ ENHANCED: Smart Assignment Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">
                  Smart Token Assignment:{" "}
                  {selectedToken?.smartTokenId?.substring(0, 12)}...
                </h3>
                <button
                  onClick={handleModalClose}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-4">
              {/* ✅ NEW: Assignment Mode Toggle */}
              <div className="mb-6">
                <div className="flex items-center space-x-4 mb-4">
                  <h4 className="text-md font-medium text-gray-900">
                    Assignment Mode:
                  </h4>
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setAssignmentMode("patient_based")}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        assignmentMode === "patient_based"
                          ? "bg-blue-600 text-white"
                          : "text-gray-700 hover:text-blue-600"
                      }`}
                    >
                      📋 Patient-Based (Recommended)
                    </button>
                    <button
                      onClick={() => setAssignmentMode("manual")}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        assignmentMode === "manual"
                          ? "bg-blue-600 text-white"
                          : "text-gray-700 hover:text-blue-600"
                      }`}
                    >
                      ⚙️ Manual Selection
                    </button>
                  </div>
                </div>

                <div className="text-sm text-gray-600">
                  {assignmentMode === "patient_based"
                    ? "🎯 Select patient first - containers/folders will be filtered to their assignments"
                    : "⚙️ Manual mode - all containers/folders available (use when patient has no assignments yet)"}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Patient Selection */}
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">
                    Patient Information
                  </h4>

                  {/* ✅ NEW: Patient User Selection */}
                  {assignmentMode === "patient_based" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Select Patient User *
                      </label>
                      <select
                        value={selectedPatientUser}
                        onChange={(e) => {
                          const patientUserId = e.target.value;
                          console.log("🔍 Patient selected:", patientUserId);
                          setSelectedPatientUser(patientUserId);

                          // Explicitly call the handler to ensure immediate update
                          if (patientUserId) {
                            handlePatientUserChange(patientUserId);
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={loadingPatientData}
                      >
                        <option value="">-- Select Patient --</option>
                        {patientUsers
                          .filter(
                            (patient) => (patient.assignedTokens || 0) === 0
                          ) // FILTER: Only show patients with 0 tokens
                          .map((patient) => (
                            <option key={patient.userId} value={patient.userId}>
                              {patient.name} ({patient.username}) - Available
                              for assignment
                            </option>
                          ))}
                      </select>
                      {patientUsers.filter(
                        (patient) => (patient.assignedTokens || 0) === 0
                      ).length === 0 && (
                        <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                          <div className="text-yellow-800 text-sm">
                            ⚠️ All patients already have SmartTokens assigned.
                            Use Manual Selection mode to reassign tokens.
                          </div>
                        </div>
                      )}
                      {loadingPatientData && (
                        <div className="mt-2 text-sm text-blue-600">
                          🔄 Loading patient assignments...
                        </div>
                      )}
                    </div>
                  )}

                  {/* Patient Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Patient Name *
                    </label>
                    <input
                      type="text"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      placeholder="Enter patient name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={
                        assignmentMode === "patient_based" &&
                        selectedPatientUser
                      }
                    />
                  </div>

                  {/* Date of Birth */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={patientDateOfBirth}
                      onChange={(e) => setPatientDateOfBirth(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Doctor Selection */}
                  {doctorUsers.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Assign Doctor (Optional)
                      </label>
                      <select
                        value={selectedDoctorUser}
                        onChange={(e) => setSelectedDoctorUser(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- No Doctor Assignment --</option>
                        {doctorUsers.map((doctor) => (
                          <option key={doctor.userId} value={doctor.userId}>
                            Dr. {doctor.name} ({doctor.username})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Right Column - Container/Folder Selection */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium text-gray-900">
                      Container & Folder
                    </h4>
                    {assignmentMode === "patient_based" &&
                      patientAssignments && (
                        <div className="text-sm text-green-600">
                          ✅ {filteredContainers.length} container(s) available
                        </div>
                      )}
                  </div>

                  {/* Container Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Container *
                    </label>
                    <input
                      type="text"
                      placeholder="Search containers..."
                      value={containerSearch}
                      onChange={(e) => setContainerSearch(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                      disabled={
                        loadingContainers ||
                        (assignmentMode === "patient_based" &&
                          loadingPatientData)
                      }
                    />
                    <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-md">
                      {loadingContainers ? (
                        <div className="p-3 text-center text-gray-500">
                          Loading containers...
                        </div>
                      ) : filteredContainers.length === 0 ? (
                        <div className="p-3 text-center text-gray-500">
                          {assignmentMode === "patient_based"
                            ? "No containers assigned to this patient"
                            : "No containers found"}
                        </div>
                      ) : (
                        filteredContainers.map((container) => (
                          <button
                            key={container}
                            onClick={() => handleContainerSelect(container)}
                            className={`w-full text-left px-3 py-2 hover:bg-blue-50 ${
                              selectedContainer === container
                                ? "bg-blue-100 text-blue-900"
                                : ""
                            }`}
                          >
                            {container}
                          </button>
                        ))
                      )}
                    </div>

                    {assignmentMode === "manual" &&
                      allContainers.length > 0 && (
                        <div className="mt-1 text-sm text-gray-500">
                          Showing all {allContainers.length} containers
                        </div>
                      )}
                  </div>

                  {/* Folder Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Folder *
                    </label>
                    {selectedContainer && (
                      <>
                        <input
                          type="text"
                          placeholder="Search folders..."
                          value={folderSearch}
                          onChange={(e) => setFolderSearch(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                          disabled={folderLoading}
                        />
                        <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-md">
                          {folderLoading ? (
                            <div className="p-3 text-center text-gray-500">
                              Loading folders...
                            </div>
                          ) : filteredFolders.length === 0 ? (
                            <div className="p-3 text-center text-gray-500">
                              {assignmentMode === "patient_based"
                                ? "No folders assigned to this patient in this container"
                                : "No folders found"}
                            </div>
                          ) : (
                            filteredFolders.map((folder) => (
                              <button
                                key={folder}
                                onClick={() => setSelectedFolder(folder)}
                                className={`w-full text-left px-3 py-2 hover:bg-blue-50 ${
                                  selectedFolder === folder
                                    ? "bg-blue-100 text-blue-900"
                                    : assignedFolders[folder]
                                    ? "bg-yellow-50 text-yellow-700"
                                    : ""
                                }`}
                              >
                                <div className="flex justify-between items-center">
                                  <span>{folder}</span>
                                  {assignedFolders[folder] && (
                                    <span className="text-xs text-yellow-600">
                                      Already assigned
                                    </span>
                                  )}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </>
                    )}

                    {!selectedContainer && (
                      <div className="w-full px-3 py-8 border border-gray-300 rounded-md text-center text-gray-500">
                        Select container first
                      </div>
                    )}
                  </div>

                  {/* ✅ NEW: Assignment Summary */}
                  {assignmentMode === "patient_based" && patientAssignments && (
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                      <h5 className="font-medium text-blue-900 mb-2">
                        Patient Assignment Summary
                      </h5>
                      <div className="text-sm text-blue-800">
                        <div>
                          📦 Containers: {patientAssignments.containers.length}
                        </div>
                        <div>
                          📁 Folders: {patientAssignments.folders.length}
                        </div>
                        <div className="mt-2 text-blue-600">
                          ✅ SmartToken will be assigned to patient's existing
                          container/folder access
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <div className="text-red-800 text-sm">{error}</div>
                </div>
              )}

              {/* Footer */}
              <div className="mt-6 flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  onClick={handleModalClose}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                  disabled={assigning}
                >
                  Cancel
                </button>
                <button
                  onClick={handleEnhancedAssignment}
                  disabled={
                    !selectedContainer ||
                    !selectedFolder ||
                    !patientName.trim() ||
                    assigning
                  }
                  className={`px-6 py-2 rounded-md font-medium transition-colors ${
                    !selectedContainer ||
                    !selectedFolder ||
                    !patientName.trim() ||
                    assigning
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {assigning ? "🔄 Assigning..." : "✅ Assign SmartToken"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedSmartTokenManagement;
