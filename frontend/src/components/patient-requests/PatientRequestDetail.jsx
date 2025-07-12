// src/components/patient-requests/PatientRequestDetail.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePatientRequests } from "../../hooks/usePatientRequests";
import { useAuth } from "../../hooks/useAuth";
import Loader from "../common/Loader";
import Alert from "../common/Alert";
import Button from "../common/Button";
import Modal from "../common/Modal";

const PatientRequestDetail = () => {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { getRequest, approveRequest, rejectRequest } = usePatientRequests();

  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [processingAction, setProcessingAction] = useState(false);

  // State for modal
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [notes, setNotes] = useState("");
  const [patientCredentials, setPatientCredentials] = useState(null);

  // Fetch request details
  useEffect(() => {
    const fetchRequestDetails = async () => {
      try {
        setLoading(true);
        const result = await getRequest(requestId);

        if (result.error) {
          setError(result.error);
        } else {
          setRequest(result.request);
        }
      } catch (err) {
        setError("Failed to load request details");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchRequestDetails();
  }, [requestId, getRequest]);

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Handle approve request
  const handleApprove = async () => {
    try {
      setProcessingAction(true);
      const result = await approveRequest(requestId, notes);

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(
          "Patient request approved successfully. Patient account created."
        );
        setPatientCredentials({
          username: result.username,
          patientId: result.patientId,
        });
        // Update request status
        setRequest((prev) => ({
          ...prev,
          requestStatus: "approved",
          approvedDate: new Date().toISOString(),
          rejectionReason: notes,
        }));
      }
    } catch (err) {
      setError("Failed to approve request");
      console.error(err);
    } finally {
      setProcessingAction(false);
      setShowApproveModal(false);
    }
  };

  // Handle reject request
  const handleReject = async () => {
    try {
      setProcessingAction(true);
      const result = await rejectRequest(requestId, notes);

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess("Patient request rejected successfully.");
        // Update request status
        setRequest((prev) => ({
          ...prev,
          requestStatus: "rejected",
          approvedDate: new Date().toISOString(),
          rejectionReason: notes,
        }));
      }
    } catch (err) {
      setError("Failed to reject request");
      console.error(err);
    } finally {
      setProcessingAction(false);
      setShowRejectModal(false);
    }
  };

  // Get status badge color
  const getStatusBadge = (status) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "approved":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center">
        <Loader size="large" />
      </div>
    );
  }

  if (error && !request) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert type="error" message={error} />
        <Button
          onClick={() => navigate("/patient-requests")}
          className="mt-4"
          variant="outline"
        >
          <i className="fas fa-arrow-left mr-2"></i>
          Back to Requests
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {error && (
        <Alert type="error" message={error} onClose={() => setError("")} />
      )}
      {success && (
        <Alert
          type="success"
          message={success}
          onClose={() => setSuccess("")}
        />
      )}

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-800">
                Patient Request Details
              </h1>
              <p className="text-gray-600 mt-1">
                Request ID: {request?.requestId}
              </p>
            </div>
            <div className="mt-4 md:mt-0">
              <span
                className={`px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full ${getStatusBadge(
                  request?.requestStatus || "pending"
                )}`}
              >
                {request?.requestStatus?.charAt(0).toUpperCase() +
                  request?.requestStatus?.slice(1)}
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Patient Information */}
            <div className="bg-gray-50 p-4 rounded-md">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Patient Information
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-500">
                    Name
                  </label>
                  <p className="mt-1 text-sm text-gray-900">
                    {request?.patientName}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">
                    Email
                  </label>
                  <p className="mt-1 text-sm text-gray-900">
                    {request?.patientEmail}
                  </p>
                </div>
                {request?.patientPhone && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500">
                      Phone
                    </label>
                    <p className="mt-1 text-sm text-gray-900">
                      {request?.patientPhone}
                    </p>
                  </div>
                )}
                {request?.patientUsername && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500">
                      Created Username
                    </label>
                    <p className="mt-1 text-sm font-medium text-blue-600">
                      {request?.patientUsername}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Request Details */}
            <div className="bg-gray-50 p-4 rounded-md">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Request Details
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-500">
                    Requested By
                  </label>
                  <p className="mt-1 text-sm text-gray-900">
                    {request?.doctorName}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">
                    Container
                  </label>
                  <p className="mt-1 text-sm text-gray-900">
                    {request?.containerName}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">
                    Folder
                  </label>
                  <p className="mt-1 text-sm text-gray-900">
                    {request?.folderName}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">
                    Request Date
                  </label>
                  <p className="mt-1 text-sm text-gray-900">
                    {formatDate(request?.requestDate)}
                  </p>
                </div>
              </div>
            </div>

            {/* Status Information */}
            {request?.requestStatus !== "pending" && (
              <div className="col-span-1 md:col-span-2 bg-gray-50 p-4 rounded-md">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">
                  Processing Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-500">
                      Processed By
                    </label>
                    <p className="mt-1 text-sm text-gray-900">
                      {request?.approvedByName || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500">
                      Processed Date
                    </label>
                    <p className="mt-1 text-sm text-gray-900">
                      {formatDate(request?.approvedDate)}
                    </p>
                  </div>
                  {request?.rejectionReason && (
                    <div className="col-span-1 md:col-span-2">
                      <label className="block text-sm font-medium text-gray-500">
                        Reason
                      </label>
                      <p className="mt-1 text-sm text-gray-900">
                        {request?.rejectionReason}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Patient Credentials Notice (when just created) */}
            {patientCredentials && (
              <div className="col-span-1 md:col-span-2 bg-green-50 border border-green-200 p-4 rounded-md">
                <h2 className="text-lg font-semibold text-green-800 mb-2">
                  <i className="fas fa-check-circle mr-2"></i>
                  Patient Account Created Successfully
                </h2>
                <p className="text-sm text-green-700 mb-2">
                  A patient account has been created and login credentials have
                  been sent to {request?.patientEmail}.
                </p>
                <div className="text-sm text-green-700">
                  <p>
                    <strong>Username:</strong> {patientCredentials.username}
                  </p>
                  <p>
                    <strong>Password:</strong> Sent directly to patient's email
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/patient-requests")}
              className="mb-3 sm:mb-0"
            >
              <i className="fas fa-arrow-left mr-2"></i>
              Back to Requests
            </Button>

            {isAdmin() && request?.requestStatus === "pending" && (
              <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setShowRejectModal(true)}
                  disabled={processingAction}
                >
                  <i className="fas fa-times-circle mr-2"></i>
                  Reject Request
                </Button>
                <Button
                  type="button"
                  onClick={() => setShowApproveModal(true)}
                  disabled={processingAction}
                >
                  <i className="fas fa-check-circle mr-2"></i>
                  Approve &amp; Create Account
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Approve Modal */}
      <Modal
        isOpen={showApproveModal}
        onClose={() => setShowApproveModal(false)}
        title="Approve Patient Request"
      >
        <div className="p-4">
          <p className="mb-4 text-gray-700">
            You are about to approve this patient request. This will:
          </p>
          <ul className="list-disc pl-5 mb-4 text-sm text-gray-600 space-y-1">
            <li>Create a new patient user account</li>
            <li>Assign the selected container and folder to the patient</li>
            <li>Send login credentials to {request?.patientEmail}</li>
          </ul>

          <div className="mb-4">
            <label
              htmlFor="notes"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Admin Notes (Optional)
            </label>
            <textarea
              id="notes"
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this approval..."
            ></textarea>
          </div>

          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowApproveModal(false)}
              disabled={processingAction}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleApprove}
              isLoading={processingAction}
              disabled={processingAction}
            >
              Approve Request
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Reject Patient Request"
      >
        <div className="p-4">
          <p className="mb-4 text-gray-700">
            Are you sure you want to reject this patient request?
          </p>

          <div className="mb-4">
            <label
              htmlFor="notes"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Reason for Rejection (Optional)
            </label>
            <textarea
              id="notes"
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Explain why you're rejecting this request..."
            ></textarea>
          </div>

          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowRejectModal(false)}
              disabled={processingAction}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleReject}
              isLoading={processingAction}
              disabled={processingAction}
            >
              Reject Request
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PatientRequestDetail;
