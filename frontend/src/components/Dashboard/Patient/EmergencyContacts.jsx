// src/components/Dashboard/Patient/EmergencyContacts.jsx - Fixed Button Issues
import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { emergencyContactsAPI } from "../../../api";
import Loader from "../../common/Loader";
import Alert from "../../common/Alert";
import Modal from "../../common/Modal";
import Button from "../../common/Button";
import PrivacyPolicyModal from "../../common/PrivacyPolicyModal";

const EmergencyContacts = () => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [testingContact, setTestingContact] = useState(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    contactName: "",
    phoneNumber: "",
    relationship: "",
    isPrimary: false,
    // SMS Consent required for A2P 10DLC compliance
    smsConsent: false,
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
    if (e) e.preventDefault();

    if (
      !formData.contactName ||
      !formData.phoneNumber ||
      !formData.relationship
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    // A2P 10DLC Compliance: Validate SMS consent for new contacts
    if (!editingContact && !formData.smsConsent) {
      toast.error("SMS consent is required to add emergency contacts");
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
            : "Emergency contact added successfully. They will now receive emergency SMS alerts."
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
      !window.confirm(
        "Are you sure you want to delete this emergency contact? They will no longer receive SMS alerts."
      )
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
    if (
      !window.confirm(
        `Send a test emergency SMS alert to ${contact.contactName}?`
      )
    ) {
      return;
    }

    try {
      setTestingContact(contact.contactId);
      const response = await emergencyContactsAPI.testEmergencyContact(
        contact.contactId
      );

      if (response.data.success) {
        toast.success(
          `Test emergency SMS alert sent to ${contact.contactName}`
        );
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
      smsConsent: true, // Assume consent was given when originally added
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
      smsConsent: false,
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
            🚨 Emergency SMS Alert Contacts
          </h1>
          <p className="text-gray-600 mt-1">
            Manage contacts who will receive emergency SMS alerts when your
            SmartToken medical device is accessed
          </p>
        </div>
        <Button
          onClick={() => {
            setShowAddModal(true);
          }}
          color="red"
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

      {/* Emergency SMS Alert Information */}
      <div className="bg-red-50 border-l-4 border-red-400 p-6 mb-6">
        <div className="flex items-start space-x-3">
          <div className="text-red-600 text-2xl">🚨</div>
          <div className="text-sm text-red-800">
            <h3 className="font-semibold mb-2">Emergency SMS Alert System</h3>
            <div className="space-y-2">
              <p>
                <strong>Purpose:</strong> Emergency medical alerts for
                SmartToken device access during medical emergencies
              </p>
              <p>
                <strong>When SMS sent:</strong> Only when your SmartToken is
                accessed by unregistered devices or during emergency situations
              </p>
              <p>
                <strong>Message content:</strong> Location information, device
                details, and emergency medical context
              </p>
              <p>
                <strong>Frequency:</strong> Emergency situations only (typically
                0-5 messages per month)
              </p>
              <p>
                <strong>Opt-out:</strong> Contacts can reply STOP to any message
                to unsubscribe
              </p>
              <p>
                <strong>Rates:</strong> Standard message and data rates may
                apply to recipients
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy Policy Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start space-x-3">
          <div className="text-blue-600 text-xl">🔒</div>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">SMS Privacy Protection</p>
            <p>
              We protect your emergency contacts' privacy and do not share
              mobile numbers with third parties for marketing purposes.
              <button
                onClick={() => setShowPrivacyModal(true)}
                className="text-blue-600 hover:text-blue-800 underline ml-1"
              >
                View our SMS Privacy Policy
              </button>
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
            No Emergency SMS Alert Contacts
          </h3>
          <p className="text-gray-600 mb-4">
            Add emergency contacts to receive SMS alerts when your SmartToken
            medical device is accessed during emergencies
          </p>
          <Button
            onClick={() => {
              setShowAddModal(true);
            }}
            color="red"
          >
            Add Your First Emergency Contact
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
                  ⭐ Primary Emergency Contact
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
                <p className="text-xs text-green-600 mt-1">
                  ✅ Receives emergency SMS alerts
                </p>
              </div>

              {/* Actions */}
              <div className="flex space-x-2">
                <button
                  onClick={() => handleTest(contact)}
                  disabled={testingContact === contact.contactId}
                  className="flex-1 px-3 py-2 text-sm bg-green-100 text-green-700 hover:bg-green-200 rounded-md transition-colors disabled:opacity-50"
                >
                  {testingContact === contact.contactId
                    ? "Sending..."
                    : "Test SMS"}
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

      {/* A2P 10DLC Compliant Add/Edit Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={handleCloseModal}
        title={
          editingContact
            ? "Edit Emergency Contact"
            : "Add Emergency SMS Alert Contact"
        }
      >
        <div className="space-y-6">
          {/* Emergency SMS Notice */}
          {!editingContact && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="text-yellow-600 text-xl">⚠️</div>
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-1">
                    Emergency SMS Alert Registration
                  </p>
                  <p>
                    By adding this contact, they will receive emergency SMS
                    alerts from <strong>CompassPoint Health PRMS</strong> when
                    your SmartToken medical device is accessed.
                  </p>
                </div>
              </div>
            </div>
          )}

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
              Phone Number (SMS Capable) *
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
              Must be able to receive SMS text messages. Include country code if
              outside the US.
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
              Set as primary emergency contact (receives alerts first)
            </label>
          </div>

          {/* A2P 10DLC REQUIRED: SMS Consent Section */}
          {!editingContact && (
            <div className="border-2 border-red-200 rounded-lg p-4 bg-red-50">
              <h4 className="text-lg font-semibold text-red-900 mb-3">
                📱 Emergency SMS Alert Consent Required
              </h4>

              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    id="smsConsent"
                    checked={formData.smsConsent}
                    onChange={(e) =>
                      setFormData({ ...formData, smsConsent: e.target.checked })
                    }
                    className="mt-1 h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                    required
                  />
                  <label htmlFor="smsConsent" className="text-sm text-gray-800">
                    <strong>
                      I consent to this phone number receiving emergency SMS
                      text messages from CompassPoint Health PRMS
                    </strong>{" "}
                    when my SmartToken medical device is accessed during
                    emergency situations.
                  </label>
                </div>

                {/* Detailed SMS Information */}
                <div className="bg-white rounded-lg p-4 text-sm text-gray-700">
                  <h5 className="font-semibold text-gray-800 mb-2">
                    Emergency SMS Alert Details:
                  </h5>
                  <ul className="space-y-1 ml-4 list-disc">
                    <li>
                      <strong>Message Type:</strong> Emergency medical alerts
                      and security notifications only
                    </li>
                    <li>
                      <strong>Frequency:</strong> Only when SmartToken is
                      accessed during medical emergencies (typically 0-5
                      messages per month)
                    </li>
                    <li>
                      <strong>Content:</strong> Patient location information,
                      device access details, and emergency medical context
                    </li>
                    <li>
                      <strong>Rates:</strong> Standard message and data rates
                      may apply to the recipient
                    </li>
                    <li>
                      <strong>Opt-Out:</strong> Recipient can reply STOP to any
                      message to unsubscribe immediately
                    </li>
                    <li>
                      <strong>Help:</strong> Recipient can reply HELP for
                      assistance
                    </li>
                    <li>
                      <strong>Purpose:</strong> Support emergency medical
                      response and public safety
                    </li>
                  </ul>
                </div>

                {/* Sample Message Preview */}
                <div className="bg-gray-100 rounded-lg p-4">
                  <h5 className="font-semibold text-gray-800 mb-2">
                    📱 Sample Emergency SMS Alert:
                  </h5>
                  <div className="bg-white rounded p-3 text-sm font-mono border">
                    "🚨 EMERGENCY: John Smith's SmartToken accessed at GPS
                    location 123 Main St, Anytown. Emergency access during
                    medical emergency. Contact medical staff if unauthorized.
                    Reply STOP to opt out."
                  </div>
                </div>

                {/* Confirmation Statement */}
                <div className="text-sm text-gray-700">
                  <p>
                    <strong>I understand and confirm:</strong>
                  </p>
                  <ul className="ml-4 space-y-1 list-disc">
                    <li>
                      This phone number will receive emergency SMS alerts with
                      patient location information
                    </li>
                    <li>
                      Alerts are sent only when my SmartToken medical device is
                      accessed during emergencies
                    </li>
                    <li>
                      The recipient can opt out anytime by replying STOP to any
                      message
                    </li>
                    <li>
                      This is for emergency medical purposes only, not marketing
                    </li>
                    <li>
                      I am the owner of this phone number or have permission to
                      register it for emergency alerts
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Privacy Policy Link */}
          <div className="text-center text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
            <p>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(true)}
                className="text-blue-600 hover:text-blue-800 underline"
              >
                View SMS Privacy Policy
              </button>{" "}
              - We do not share mobile information with third parties for
              marketing purposes.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex space-x-3 pt-4">
            <Button
              type="button"
              onClick={handleCloseModal}
              color="gray"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={(e) => {
                handleSubmit(e);
              }}
              color="red"
              className="flex-1"
            >
              {editingContact
                ? "Update Contact"
                : "Add Emergency Contact & Enable SMS Alerts"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Privacy Policy Modal */}
      <PrivacyPolicyModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />
    </div>
  );
};

export default EmergencyContacts;
