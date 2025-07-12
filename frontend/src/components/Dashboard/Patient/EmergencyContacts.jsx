// src/components/Dashboard/Patient/EmergencyContacts.jsx - Emergency Contacts Management
import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { emergencyContactsAPI } from "../../../api";
import Loader from "../../common/Loader";
import Alert from "../../common/Alert";
import Modal from "../../common/Modal";
import Button from "../../common/Button";

const EmergencyContacts = () => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [testingContact, setTestingContact] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    contactName: "",
    phoneNumber: "",
    relationship: "",
    isPrimary: false,
  });

  const relationshipOptions = [
    "Spouse/Partner",
    "Parent",
    "Child",
    "Sibling",
    "Relative",
    "Friend",
    "Neighbor",
    "Caregiver",
    "Healthcare Provider",
    "Other",
  ];

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const response = await emergencyContactsAPI.getEmergencyContacts();
      if (response.data.success) {
        setContacts(response.data.contacts);
      } else {
        setError(response.data.message || "Failed to load emergency contacts");
      }
    } catch (error) {
      console.error("Error loading emergency contacts:", error);
      setError("Failed to load emergency contacts");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      !formData.contactName ||
      !formData.phoneNumber ||
      !formData.relationship
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Validate phone number
    const cleanPhone = formData.phoneNumber.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      toast.error("Please enter a valid phone number");
      return;
    }

    try {
      let response;
      if (editingContact) {
        response = await emergencyContactsAPI.updateEmergencyContact(
          editingContact.contactId,
          formData
        );
      } else {
        response = await emergencyContactsAPI.addEmergencyContact(formData);
      }

      if (response.data.success) {
        toast.success(
          editingContact
            ? "Emergency contact updated successfully"
            : "Emergency contact added successfully"
        );
        await loadContacts();
        handleCloseModal();
      } else {
        toast.error(
          response.data.message || "Failed to save emergency contact"
        );
      }
    } catch (error) {
      console.error("Error saving emergency contact:", error);
      toast.error("Failed to save emergency contact");
    }
  };

  const handleDelete = async (contactId) => {
    if (
      !window.confirm("Are you sure you want to delete this emergency contact?")
    ) {
      return;
    }

    try {
      const response = await emergencyContactsAPI.deleteEmergencyContact(
        contactId
      );
      if (response.data.success) {
        toast.success("Emergency contact deleted successfully");
        await loadContacts();
      } else {
        toast.error(
          response.data.message || "Failed to delete emergency contact"
        );
      }
    } catch (error) {
      console.error("Error deleting emergency contact:", error);
      toast.error("Failed to delete emergency contact");
    }
  };

  const handleTest = async (contact) => {
    if (!window.confirm(`Send a test alert to ${contact.contactName}?`)) {
      return;
    }

    try {
      setTestingContact(contact.contactId);
      const response = await emergencyContactsAPI.testEmergencyContact(
        contact.contactId
      );

      if (response.data.success) {
        toast.success(`Test alert sent to ${contact.contactName}`);
      } else {
        toast.error(response.data.message || "Failed to send test alert");
      }
    } catch (error) {
      console.error("Error sending test alert:", error);
      toast.error("Failed to send test alert");
    } finally {
      setTestingContact(null);
    }
  };

  const handleEdit = (contact) => {
    setEditingContact(contact);
    setFormData({
      contactName: contact.contactName,
      phoneNumber: contact.phoneNumber,
      relationship: contact.relationship,
      isPrimary: contact.isPrimary,
    });
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingContact(null);
    setFormData({
      contactName: "",
      phoneNumber: "",
      relationship: "",
      isPrimary: false,
    });
  };

  const formatPhoneNumber = (phone) => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(
        6
      )}`;
    }
    return phone;
  };

  if (loading) return <Loader size="large" />;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Emergency Contacts
          </h1>
          <p className="text-gray-600 mt-1">
            Manage contacts who will be notified if your SmartToken is accessed
            by an unregistered device
          </p>
        </div>
        <Button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white"
        >
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Emergency Contact
        </Button>
      </div>

      {/* Alert Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start space-x-3">
          <div className="text-blue-600 text-xl">ℹ️</div>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">How Emergency Alerts Work</p>
            <p>
              When someone accesses your SmartToken with an unregistered device,
              all your emergency contacts will automatically receive an SMS
              alert with device and location information. This helps ensure your
              medical data access is monitored for security.
            </p>
          </div>
        </div>
      </div>

      {error && <Alert message={error} type="error" className="mb-6" />}

      {/* Emergency Contacts List */}
      {contacts.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <div className="text-gray-400 text-6xl mb-4">📞</div>
          <h3 className="text-lg font-medium text-gray-800 mb-2">
            No Emergency Contacts
          </h3>
          <p className="text-gray-600 mb-4">
            Add emergency contacts to receive alerts when your SmartToken is
            accessed
          </p>
          <Button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            Add Your First Contact
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contacts.map((contact) => (
            <div
              key={contact.contactId}
              className="bg-white rounded-lg shadow-md p-6 border border-gray-200"
            >
              {/* Primary Badge */}
              {contact.isPrimary && (
                <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 mb-3">
                  ⭐ Primary Contact
                </div>
              )}

              {/* Contact Info */}
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  {contact.contactName}
                </h3>
                <p className="text-gray-600">{contact.relationship}</p>
                <p className="text-blue-600 font-medium">
                  {formatPhoneNumber(contact.phoneNumber)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex space-x-2">
                <button
                  onClick={() => handleTest(contact)}
                  disabled={testingContact === contact.contactId}
                  className="flex-1 px-3 py-2 text-sm bg-green-100 text-green-700 hover:bg-green-200 rounded-md transition-colors disabled:opacity-50"
                >
                  {testingContact === contact.contactId ? "Sending..." : "Test"}
                </button>
                <button
                  onClick={() => handleEdit(contact)}
                  className="flex-1 px-3 py-2 text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-md transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(contact.contactId)}
                  className="px-3 py-2 text-sm bg-red-100 text-red-700 hover:bg-red-200 rounded-md transition-colors"
                >
                  Delete
                </button>
              </div>

              {/* Created Date */}
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Added {new Date(contact.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={handleCloseModal}
        title={
          editingContact ? "Edit Emergency Contact" : "Add Emergency Contact"
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Contact Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Name *
            </label>
            <input
              type="text"
              value={formData.contactName}
              onChange={(e) =>
                setFormData({ ...formData, contactName: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter contact name"
              required
            />
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number *
            </label>
            <input
              type="tel"
              value={formData.phoneNumber}
              onChange={(e) =>
                setFormData({ ...formData, phoneNumber: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="(555) 123-4567"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Include country code if outside the US
            </p>
          </div>

          {/* Relationship */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Relationship *
            </label>
            <select
              value={formData.relationship}
              onChange={(e) =>
                setFormData({ ...formData, relationship: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">Select relationship</option>
              {relationshipOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          {/* Primary Contact */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isPrimary"
              checked={formData.isPrimary}
              onChange={(e) =>
                setFormData({ ...formData, isPrimary: e.target.checked })
              }
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isPrimary" className="ml-2 text-sm text-gray-700">
              Set as primary contact
            </label>
          </div>

          {/* Buttons */}
          <div className="flex space-x-3 pt-4">
            <Button
              type="button"
              onClick={handleCloseModal}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
            >
              {editingContact ? "Update Contact" : "Add Contact"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default EmergencyContacts;
