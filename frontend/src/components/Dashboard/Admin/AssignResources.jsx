import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usersAPI, assignmentsAPI } from "../../../api";
import Button from "../../common/Button";
import Alert from "../../common/Alert";
import Loader from "../../common/Loader";
import Modal from "../../common/Modal";

const AssignResources = () => {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [containers, setContainers] = useState([]);
  const [selectedContainer, setSelectedContainer] = useState("");
  const [folders, setFolders] = useState([]);
  const [selectedFolders, setSelectedFolders] = useState([]);
  const [assignedFolders, setAssignedFolders] = useState([]);
  const [mode, setMode] = useState("new"); // "new" or "update"

  // Search state
  const [containerSearch, setContainerSearch] = useState("");
  const [folderSearch, setFolderSearch] = useState("");

  // Filtered lists
  const [filteredContainers, setFilteredContainers] = useState([]);
  const [filteredFolders, setFilteredFolders] = useState([]);

  // Custom dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // For unassignment functionality
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [itemToUnassign, setItemToUnassign] = useState(null);
  const [unassignType, setUnassignType] = useState(null); // 'container' or 'folder'

  const [loading, setLoading] = useState(true);
  const [folderLoading, setFolderLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [unassigning, setUnassigning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Helper function to sort container names naturally (numeric where possible)
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch user details
        const userRes = await usersAPI.getUserById(userId);
        setUser(userRes.data.user);

        // Fetch all containers
        const containersRes = await assignmentsAPI.getAllContainers();
        const sortedContainers = [...containersRes.data.containers].sort(
          naturalSort
        );
        setContainers(sortedContainers);
        setFilteredContainers(sortedContainers);
      } catch (err) {
        setError("Failed to load data");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId]);

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

  const fetchFolders = async (containerName, isUpdate = false) => {
    try {
      setFolderLoading(true);
      setSelectedFolders([]);
      setFolderSearch(""); // Reset folder search when changing containers

      // Get all available folders for this container
      const res = await assignmentsAPI.getFolders(containerName);
      const allFolders = res.data.folders.sort(naturalSort);

      if (isUpdate) {
        // Find the current assigned folders for this container
        const assignedFoldersList = user.folderAssignments
          .filter((f) => f.containerName === containerName)
          .map((f) => f.folderName);

        setAssignedFolders(assignedFoldersList);

        // Show only unassigned folders as options
        const availableFolders = allFolders.filter(
          (folder) => !assignedFoldersList.includes(folder)
        );

        setFolders(availableFolders);
        setFilteredFolders(availableFolders);
      } else {
        setFolders(allFolders);
        setFilteredFolders(allFolders);
      }
    } catch (err) {
      setError(`Failed to load folders for ${containerName}`);
      console.error(err);
    } finally {
      setFolderLoading(false);
    }
  };

  const handleContainerChange = (containerName) => {
    setSelectedContainer(containerName);
    setDropdownOpen(false);

    if (containerName) {
      // Check if this container is already assigned to the user
      const isAlreadyAssigned = user.containerAssignments.some(
        (c) => c.containerName === containerName
      );

      if (isAlreadyAssigned) {
        setMode("update");
        fetchFolders(containerName, true);
      } else {
        setMode("new");
        fetchFolders(containerName, false);
      }
    } else {
      setFolders([]);
      setFilteredFolders([]);
      setSelectedFolders([]);
      setAssignedFolders([]);
    }
  };

  const handleFolderChange = (e) => {
    const options = e.target.options;
    const values = [];

    for (let i = 0; i < options.length; i++) {
      if (options[i].selected) {
        values.push(options[i].value);
      }
    }

    setSelectedFolders(values);
  };

  const handleAssign = async () => {
    if (!selectedContainer) {
      setError("Please select a container");
      return;
    }

    try {
      setAssigning(true);
      setError("");

      if (mode === "new") {
        // First assign the container
        await assignmentsAPI.assignContainer(selectedContainer, userId);
      }

      // Then assign folders if selected
      if (selectedFolders.length > 0) {
        await assignmentsAPI.assignFolders(
          selectedContainer,
          userId,
          selectedFolders
        );
      }

      const message =
        mode === "new"
          ? "Resources assigned successfully"
          : "Additional folders assigned successfully";

      setSuccess(message);

      // Refresh user data
      const userRes = await usersAPI.getUserById(userId);
      setUser(userRes.data.user);

      // Reset form
      setSelectedContainer("");
      setFolders([]);
      setFilteredFolders([]);
      setSelectedFolders([]);
      setAssignedFolders([]);
      setContainerSearch("");
      setFolderSearch("");
      setMode("new");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to assign resources");
    } finally {
      setAssigning(false);
    }
  };

  // Function to handle unassignment
  const confirmUnassign = (id, type) => {
    setItemToUnassign(id);
    setUnassignType(type);
    setConfirmModalOpen(true);
  };

  // Function to execute unassignment
  const handleUnassign = async () => {
    try {
      setUnassigning(true);
      setError("");

      await assignmentsAPI.revokeAssignment(itemToUnassign, unassignType);

      setSuccess(
        `${
          unassignType === "container" ? "Container" : "Folder"
        } unassigned successfully`
      );

      // Refresh user data
      const userRes = await usersAPI.getUserById(userId);
      setUser(userRes.data.user);

      // Close modal
      setConfirmModalOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to unassign resource");
    } finally {
      setUnassigning(false);
    }
  };

  if (loading) return <Loader size="large" />;
  if (!user) return <Alert message="User not found" type="error" />;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Assign Resources to {user.name}
        </h1>
        <Button color="gray" onClick={() => navigate("/users")}>
          Back to Users
        </Button>
      </div>

      {error && <Alert message={error} type="error" />}
      {success && <Alert message={success} type="success" />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* User Information */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            User Details
          </h2>

          <div className="space-y-3">
            <div>
              <span className="text-gray-600 font-medium">Name:</span>
              <span className="ml-2">{user.name}</span>
            </div>
            <div>
              <span className="text-gray-600 font-medium">Username:</span>
              <span className="ml-2">{user.username}</span>
            </div>
            <div>
              <span className="text-gray-600 font-medium">Role:</span>
              <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                {user.role}
              </span>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-md font-semibold text-gray-800 mb-2">
              Current Assignments
            </h3>

            {user.containerAssignments &&
            user.containerAssignments.length > 0 ? (
              <div className="space-y-3">
                {user.containerAssignments.map((assignment) => (
                  <div key={assignment.id} className="bg-gray-50 p-3 rounded">
                    <div className="flex justify-between items-center">
                      <p className="font-medium">{assignment.containerName}</p>
                      <Button
                        color="red"
                        className="text-xs py-1 px-2"
                        onClick={() =>
                          confirmUnassign(assignment.id, "container")
                        }
                      >
                        Unassign
                      </Button>
                    </div>
                    <div className="mt-2 text-sm">
                      <p className="text-gray-600">
                        {user.folderAssignments?.filter(
                          (f) => f.containerName === assignment.containerName
                        ).length || 0}{" "}
                        folders assigned
                      </p>
                    </div>

                    {/* Show folder assignments for this container */}
                    {user.folderAssignments?.filter(
                      (f) => f.containerName === assignment.containerName
                    ).length > 0 && (
                      <div className="mt-2 pl-4 border-l-2 border-gray-300">
                        <p className="text-xs text-gray-500 mb-1">
                          Assigned folders:
                        </p>
                        <div className="space-y-1">
                          {user.folderAssignments
                            .filter(
                              (f) =>
                                f.containerName === assignment.containerName
                            )
                            .sort((a, b) =>
                              naturalSort(a.folderName, b.folderName)
                            )
                            .map((folder) => (
                              <div
                                key={folder.id}
                                className="flex justify-between items-center bg-white p-2 rounded shadow-sm"
                              >
                                <span className="text-xs">
                                  {folder.folderName}
                                </span>
                                <Button
                                  color="red"
                                  className="text-xs py-0 px-1"
                                  onClick={() =>
                                    confirmUnassign(folder.id, "folder")
                                  }
                                >
                                  Unassign
                                </Button>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-600">No containers assigned yet</p>
            )}
          </div>
        </div>

        {/* Assignment Form */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            {mode === "update"
              ? "Add Folders to Container"
              : "Assign New Resources"}
          </h2>

          <div className="space-y-6">
            {/* Container selection with search */}
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

              {/* Custom dropdown that always opens downward */}
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

                {/* Dropdown menu that always appears below */}
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
                        {container}{" "}
                        {user.containerAssignments?.some(
                          (c) => c.containerName === container
                        )
                          ? "(Already Assigned)"
                          : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {selectedContainer && (
              <div>
                {/* Folder search field */}
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
                  {mode === "update"
                    ? "Select Additional Folders"
                    : "Select Folders"}{" "}
                  (hold Ctrl/Cmd to select multiple)
                </label>

                {folderLoading ? (
                  <Loader size="small" />
                ) : (
                  <>
                    {mode === "update" && assignedFolders.length > 0 && (
                      <div className="mb-3 p-3 bg-gray-50 rounded-md">
                        <p className="text-sm font-medium text-gray-700 mb-2">
                          Currently Assigned Folders:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {assignedFolders.sort(naturalSort).map((folder) => (
                            <span
                              key={folder}
                              className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full"
                            >
                              {folder}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {filteredFolders.length > 0 ? (
                      <select
                        multiple
                        value={selectedFolders}
                        onChange={handleFolderChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 h-60"
                      >
                        {filteredFolders.map((folder) => (
                          <option key={folder} value={folder}>
                            {folder}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm text-gray-500 italic">
                        {folders.length === 0
                          ? mode === "update"
                            ? "All available folders have already been assigned to this user."
                            : "No folders available in this container."
                          : "No folders match your search."}
                      </p>
                    )}
                  </>
                )}

                <p className="mt-1 text-sm text-gray-500">
                  {selectedFolders.length} folders selected
                </p>
              </div>
            )}

            <div className="pt-4">
              <Button
                color="blue"
                onClick={handleAssign}
                disabled={
                  !selectedContainer ||
                  (filteredFolders.length > 0 &&
                    selectedFolders.length === 0) ||
                  assigning
                }
                className="w-full"
              >
                {assigning
                  ? "Assigning..."
                  : mode === "update"
                  ? "Assign Additional Folders"
                  : "Assign Resources"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title={`Confirm Unassignment`}
        footer={
          <>
            <Button
              type="button"
              color="red"
              onClick={handleUnassign}
              disabled={unassigning}
              className="ml-3"
            >
              {unassigning ? "Unassigning..." : "Unassign"}
            </Button>
            <Button
              type="button"
              color="gray"
              onClick={() => setConfirmModalOpen(false)}
              className="ml-3"
            >
              Cancel
            </Button>
          </>
        }
      >
        <p>
          Are you sure you want to unassign this {unassignType}?
          {unassignType === "container" &&
            " This will also unassign all associated folders."}
          This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
};

export default AssignResources;
