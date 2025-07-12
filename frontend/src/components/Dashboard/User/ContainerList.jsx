import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { assignmentsAPI } from "../../../api";
import Loader from "../../common/Loader";
import Alert from "../../common/Alert";

const ContainerList = () => {
  const { containerName } = useParams();
  const [container, setContainer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [allAssignments, setAllAssignments] = useState([]); // For debugging

  useEffect(() => {
    const fetchAssignments = async () => {
      try {
        setLoading(true);
        console.log(
          "🔍 ContainerList: Fetching assignments for containerName:",
          containerName
        );

        const res = await assignmentsAPI.getMyAssignments();
        console.log("✅ ContainerList: API Response:", res.data);

        const assignments = res.data.assignments || [];
        setAllAssignments(assignments); // Store for debugging

        console.log(
          "🔍 ContainerList: Available containers:",
          assignments.map((c) => c.containerName)
        );
        console.log("🔍 ContainerList: Looking for container:", containerName);

        // Try exact match first
        let foundContainer = assignments.find(
          (c) => c.containerName === containerName
        );

        // If not found, try case-insensitive match
        if (!foundContainer) {
          console.log(
            "⚠️ ContainerList: Exact match not found, trying case-insensitive..."
          );
          foundContainer = assignments.find(
            (c) => c.containerName.toLowerCase() === containerName.toLowerCase()
          );
        }

        // If still not found, try partial match
        if (!foundContainer) {
          console.log(
            "⚠️ ContainerList: Case-insensitive match not found, trying partial match..."
          );
          foundContainer = assignments.find(
            (c) =>
              c.containerName.includes(containerName) ||
              containerName.includes(c.containerName)
          );
        }

        if (foundContainer) {
          console.log("✅ ContainerList: Found container:", foundContainer);
          setContainer(foundContainer);
        } else {
          console.error("❌ ContainerList: Container not found");
          console.error(
            "Available containers:",
            assignments.map((c) => c.containerName)
          );
          console.error("Requested container:", containerName);
          setError(
            `Container "${containerName}" not found or not assigned to you`
          );
        }
      } catch (err) {
        console.error("❌ ContainerList: API Error:", err);
        setError("Failed to load container data");
      } finally {
        setLoading(false);
      }
    };

    if (containerName) {
      fetchAssignments();
    } else {
      setError("No container name provided in URL");
      setLoading(false);
    }
  }, [containerName]);

  if (loading) return <Loader size="large" />;

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center mb-6">
          <Link
            to="/my-assignments"
            className="text-blue-600 hover:text-blue-800 mr-2"
          >
            ← Back to My Assignments
          </Link>
        </div>

        <Alert message={error} type="error" />

        {/* Debug Information */}
        {allAssignments.length > 0 && (
          <div className="mt-4 p-4 bg-gray-100 rounded-lg">
            <h3 className="font-semibold text-gray-800 mb-2">
              Available Containers:
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              <strong>Requested:</strong> {containerName}
            </p>
            <div className="space-y-2">
              {allAssignments.map((assignment, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 bg-white rounded border"
                >
                  <span className="text-sm text-gray-700">
                    {assignment.containerName}
                  </span>
                  <Link
                    to={`/containers/${assignment.containerName}`}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    View Container
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!container) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center mb-6">
          <Link
            to="/my-assignments"
            className="text-blue-600 hover:text-blue-800 mr-2"
          >
            ← Back to My Assignments
          </Link>
        </div>
        <Alert message="Container not found" type="error" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center mb-6">
        <Link
          to="/my-assignments"
          className="text-blue-600 hover:text-blue-800 mr-2 flex items-center"
        >
          <svg
            className="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to My Assignments
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          {container.containerName}
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">
            Patient Folders
          </h2>
          <div className="text-sm text-gray-500">
            {container.folders.length} folder
            {container.folders.length !== 1 ? "s" : ""} assigned
          </div>
        </div>

        {container.folders.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="mx-auto h-12 w-12 text-gray-300 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            <p className="text-gray-600 mb-2">
              No folders assigned in this container
            </p>
            <p className="text-sm text-gray-500">
              Contact your administrator to get folder assignments
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {container.folders.map((folder) => (
              <Link
                key={folder.id}
                to={`/containers/${container.containerName}/folders/${folder.folderName}`}
                className="block border border-gray-200 rounded-lg p-4 hover:bg-blue-50 hover:border-blue-300 hover:shadow-md transition-all duration-200 group"
              >
                <div className="flex items-center mb-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-blue-500 mr-3 group-hover:text-blue-600 transition-colors"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <h3 className="text-md font-medium text-gray-800 group-hover:text-blue-600 transition-colors truncate">
                    {folder.folderName}
                  </h3>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-gray-600 group-hover:text-blue-600 transition-colors">
                    View patient data →
                  </p>
                  {folder.assignedAt && (
                    <p className="text-xs text-gray-500">
                      Assigned:{" "}
                      {new Date(folder.assignedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Container Info Panel */}
      <div className="mt-6 bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-medium text-gray-800 mb-2">
          Container Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-600">Container:</span>
            <p className="text-gray-800">{container.containerName}</p>
          </div>
          <div>
            <span className="font-medium text-gray-600">Total Folders:</span>
            <p className="text-gray-800">{container.folders.length}</p>
          </div>
          <div>
            <span className="font-medium text-gray-600">Assigned:</span>
            <p className="text-gray-800">
              {container.assignedAt
                ? new Date(container.assignedAt).toLocaleDateString()
                : "N/A"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContainerList;
