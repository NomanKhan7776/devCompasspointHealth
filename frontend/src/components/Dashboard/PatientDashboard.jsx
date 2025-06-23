// src/components/dashboard/PatientDashboard.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useAssignments } from "../../hooks/useAssignments";
import Alert from "../common/Alert";
import Loader from "../common/Loader";
import Button from "../common/Button";

const PatientDashboard = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { assignmentsData, fetchAssignments, loading, error } =
    useAssignments();
  const [firstAssignment, setFirstAssignment] = useState(null);

  // Load assignments when component mounts
  useEffect(() => {
    const loadData = async () => {
      await fetchAssignments(true);
    };
    loadData();
  }, [fetchAssignments]);

  // Find the first assignment when data is loaded
  useEffect(() => {
    if (assignmentsData && assignmentsData.length > 0) {
      const container = assignmentsData[0];
      if (container.folders && container.folders.length > 0) {
        setFirstAssignment({
          containerName: container.containerName,
          folderName: container.folders[0].folderName,
        });
      }
    }
  }, [assignmentsData]);

  // Navigate to the assigned folder
  const goToAssignedFolder = () => {
    if (firstAssignment) {
      navigate(
        `/containers/${firstAssignment.containerName}/folders/${firstAssignment.folderName}`
      );
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader size="large" />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message={error} />;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl shadow-lg mb-8">
        <div className="px-6 py-8 text-white">
          <h1 className="text-3xl font-bold mb-3">
            Welcome, {currentUser?.name}
          </h1>
          <p className="text-lg opacity-90">
            You are logged in as a patient user. You can upload your medical
            files to the folder assigned by your doctor.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden p-6">
        <div className="text-center py-8">
          {!firstAssignment ? (
            <>
              <i className="fas fa-folder-open text-gray-300 text-6xl mb-4"></i>
              <h3 className="text-xl font-semibold text-gray-600 mb-2">
                No Folder Assignment Found
              </h3>
              <p className="text-gray-500 mb-6">
                You don't have any folder assignments yet. Please contact your
                healthcare provider.
              </p>
            </>
          ) : (
            <>
              <i className="fas fa-folder text-blue-500 text-6xl mb-4"></i>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                Your Assigned Folder
              </h3>
              <p className="text-gray-600 mb-2">
                Container:{" "}
                <span className="font-medium">
                  {firstAssignment.containerName}
                </span>
              </p>
              <p className="text-gray-600 mb-6">
                Folder:{" "}
                <span className="font-medium">
                  {firstAssignment.folderName}
                </span>
              </p>

              <Button onClick={goToAssignedFolder}>
                <i className="fas fa-upload mr-2"></i>
                Go to My Files
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden mt-8">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">
            Help & Instructions
          </h2>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-800 mb-2">
                <i className="fas fa-info-circle text-blue-500 mr-2"></i>
                How to Upload Files
              </h3>
              <p className="text-gray-600">
                Click on "Go to My Files" above to navigate to your assigned
                folder. There you can upload medical documents, images, and
                reports. Your doctor will be able to access these files.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-800 mb-2">
                <i className="fas fa-shield-alt text-blue-500 mr-2"></i>
                Privacy & Security
              </h3>
              <p className="text-gray-600">
                Your files are stored securely and can only be accessed by you
                and authorized healthcare professionals. We recommend using
                secure and private internet connections when uploading sensitive
                information.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-800 mb-2">
                <i className="fas fa-question-circle text-blue-500 mr-2"></i>
                Need Help?
              </h3>
              <p className="text-gray-600">
                If you have any questions or encounter any issues, please
                contact your healthcare provider directly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientDashboard;
