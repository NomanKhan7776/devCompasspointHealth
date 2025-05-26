// SmartTokenManagement.jsx
import React, { useState, useEffect, useRef } from "react";
import { smartTokenAPI, assignmentsAPI } from "../../../api"; // Using assignmentsAPI like user management does
import Button from "../../common/Button";
import Alert from "../../common/Alert";
import Loader from "../../common/Loader";
import Modal from "../../common/Modal";

const SmartTokenManagement = () => {
  const [unclaimedTokens, setUnclaimedTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Assignment modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const [selectedContainer, setSelectedContainer] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("");
  const [patientName, setPatientName] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Container state - EXACTLY like AssignResources.jsx
  const [containers, setContainers] = useState([]);
  const [filteredContainers, setFilteredContainers] = useState([]);
  const [containerSearch, setContainerSearch] = useState("");

  // Folder state - EXACTLY like AssignResources.jsx
  const [folders, setFolders] = useState([]);
  const [filteredFolders, setFilteredFolders] = useState([]);
  const [folderSearch, setFolderSearch] = useState("");
  const [folderLoading, setFolderLoading] = useState(false);

  // Custom dropdown state - EXACTLY like AssignResources.jsx
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const folderDropdownRef = useRef(null);

  // Helper function to sort container names naturally - COPIED from AssignResources.jsx
  const naturalSort = (a, b) => {
    // Extract numbers if they exist
    const aMatch = a.match(/(\D+)(\d+)/);
    const bMatch = b.match(/(\D+)(\d+)/);

    if (aMatch && bMatch && aMatch[1] === bMatch[1]) {
      // If the prefixes are the same, sort by number
      return parseInt(aMatch[2]) - parseInt(bMatch[2]);
    }
    // Fallback to standard alphabetical sorting
    return a.localeCompare(b);
  };

  // Close dropdown when clicking outside - COPIED from AssignResources.jsx
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

      const response = await smartTokenAPI.getUnclaimedTokens();
      setUnclaimedTokens(response.data.tokens || []);
    } catch (err) {
      console.error("❌ Error loading tokens:", err);
      setError(err.response?.data?.message || "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  };

  // Load containers - EXACTLY like AssignResources.jsx
  const fetchContainers = async () => {
    try {
      // Using the SAME API call as user management
      const res = await assignmentsAPI.getAllContainers();
      const sortedContainers = [...res.data.containers].sort(naturalSort);
      setContainers(sortedContainers);
      setFilteredContainers(sortedContainers);
    } catch (err) {
      setError("Failed to load containers");
      console.error(err);
    }
  };

  // Load folders - EXACTLY like AssignResources.jsx
  const fetchFolders = async (containerName) => {
    try {
      setFolderLoading(true);
      setFolders([]);
      setFilteredFolders([]);
      setFolderSearch(""); // Reset folder search when changing containers

      // Using the SAME API call as user management
      const res = await assignmentsAPI.getFolders(containerName);
      const allFolders = res.data.folders.sort(naturalSort);

      setFolders(allFolders);
      setFilteredFolders(allFolders);
    } catch (err) {
      setError(`Failed to load folders for ${containerName}`);
      console.error(err);
    } finally {
      setFolderLoading(false);
    }
  };

  // Update filtered containers when search term changes - COPIED from AssignResources.jsx
  useEffect(() => {
    if (containerSearch.trim() === "") {
      setFilteredContainers(containers);
    } else {
      const filtered = containers.filter((container) =>
        container.toLowerCase().includes(containerSearch.toLowerCase())
      );
      setFilteredContainers(filtered);
    }
  }, [containers, containerSearch]);

  // Update filtered folders when search term changes - COPIED from AssignResources.jsx
  useEffect(() => {
    if (folderSearch.trim() === "") {
      setFilteredFolders(folders);
    } else {
      const filtered = folders.filter((folder) =>
        folder.toLowerCase().includes(folderSearch.toLowerCase())
      );
      setFilteredFolders(filtered);
    }
  }, [folders, folderSearch]);

  // Load initial data
  useEffect(() => {
    loadTokens();
  }, []);

  // Handle container change - EXACTLY like AssignResources.jsx
  const handleContainerChange = (containerName) => {
    setSelectedContainer(containerName);
    setDropdownOpen(false);
    setSelectedFolder(""); // Reset folder selection

    if (containerName) {
      fetchFolders(containerName);
    } else {
      setFolders([]);
      setFilteredFolders([]);
    }
  };

  const openAssignModal = async (token) => {
    setSelectedToken(token);
    setSelectedContainer("");
    setSelectedFolder("");
    setPatientName("");
    setError("");

    // Reset search terms
    setContainerSearch("");
    setFolderSearch("");

    setAssignModalOpen(true);

    // Load containers when modal opens - using the SAME method as user management
    await fetchContainers();
  };

  const handleAssignToken = async () => {
    if (!selectedContainer || !selectedFolder || !patientName.trim()) {
      setError("Please fill in all required fields");
      return;
    }

    try {
      setAssigning(true);
      setError("");

      await smartTokenAPI.assignTokenToPatient({
        tokenId: selectedToken.smartTokenId,
        containerName: selectedContainer,
        folderName: selectedFolder,
        patientName: patientName.trim(),
      });

      setSuccess(`Token assigned to ${patientName} successfully`);
      setAssignModalOpen(false);
      loadTokens();
    } catch (err) {
      console.error("Assignment Error:", err);
      setError(err.response?.data?.message || "Failed to assign token");
    } finally {
      setAssigning(false);
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

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">
            Unclaimed SmartTokens
          </h2>
          <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
            {unclaimedTokens.length} tokens pending assignment
          </span>
        </div>

        {unclaimedTokens.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 text-6xl mb-4">
              <svg
                className="mx-auto h-16 w-16"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-gray-600 text-lg">No unclaimed tokens found</p>
            <p className="text-gray-500 text-sm mt-1">
              New tokens will appear here when scanned for the first time
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
                    Product Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Registered On
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
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <svg
                              className="h-6 w-6 text-blue-600"
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Code {token.productCode || 7}
                      </span>
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

      {/* Assignment Modal - Using EXACT same pattern as AssignResources.jsx */}
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

            {/* Container selection with search - EXACT copy from AssignResources.jsx */}
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
                Select Container
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
                  Select Patient Folder
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
                          onClick={() => {
                            setSelectedFolder("");
                            setFolderDropdownOpen(false);
                          }}
                        >
                          -- Select a Patient Folder --
                        </div>
                        {filteredFolders.length > 0 ? (
                          filteredFolders.map((folder) => (
                            <div
                              key={folder}
                              className={`px-3 py-2 hover:bg-gray-100 cursor-pointer ${
                                selectedFolder === folder
                                  ? "bg-blue-50 text-blue-700"
                                  : ""
                              }`}
                              onClick={() => {
                                setSelectedFolder(folder);
                                setFolderDropdownOpen(false);
                              }}
                            >
                              {folder}
                            </div>
                          ))
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
              </div>
            )}

            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-blue-400"
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
                  <p className="text-sm text-blue-800">
                    Once assigned, this SmartToken will provide emergency access
                    to the selected patient's medical files.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SmartTokenManagement;
