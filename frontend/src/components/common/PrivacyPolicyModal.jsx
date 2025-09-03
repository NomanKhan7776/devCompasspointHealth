// src/components/common/PrivacyPolicyModal.jsx - Uses existing Modal component
import React from "react";
import Modal from "./Modal";

const PrivacyPolicyModal = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Privacy Policy" size="xl">
      <div className="prose prose-sm max-w-none">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800 font-medium">
            Last Updated: {new Date().toLocaleDateString()}
          </p>
        </div>

        <section className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            1. Information We Collect
          </h3>
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              <strong>Personal Health Information (PHI):</strong> We collect and
              store protected health information including medical records,
              emergency contact details, device access logs, and health-related
              communications as necessary to provide our SmartToken medical data
              access services.
            </p>
            <p>
              <strong>Contact Information:</strong> Names, phone numbers, email
              addresses, and relationships of emergency contacts you designate
              to receive security alerts.
            </p>
            <p>
              <strong>Device and Access Data:</strong> Information about devices
              accessing your SmartToken, including device identifiers, location
              data, access timestamps, and security verification status.
            </p>
          </div>
        </section>

        <section className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            2. How We Use Your Information
          </h3>
          <div className="text-sm text-gray-700 space-y-2">
            <p>We use your information to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Provide secure access to your medical records via SmartToken
              </li>
              <li>
                Send emergency alerts to your designated contacts when
                unauthorized access is detected
              </li>
              <li>Maintain audit logs for security and compliance purposes</li>
              <li>
                Comply with HIPAA, healthcare regulations, and legal
                requirements
              </li>
              <li>Improve our services and security measures</li>
            </ul>
          </div>
        </section>

        <section className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            3. SMS Communications & A2P 10DLC Compliance
          </h3>
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              <strong>Consent:</strong> By providing phone numbers for emergency
              contacts, you expressly consent to receive SMS alerts and
              notifications related to SmartToken access and security.
            </p>
            <p>
              <strong>Message Frequency:</strong> Emergency alert messages are
              sent only when your SmartToken is accessed by unregistered
              devices. System notifications may be sent periodically for account
              security updates.
            </p>
            <p>
              <strong>Opt-Out:</strong> You can opt out of SMS communications at
              any time by:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Texting "STOP" to our SMS number</li>
              <li>Removing emergency contacts from your account</li>
              <li>Contacting our support team</li>
            </ul>
            <p>
              <strong>Carrier Charges:</strong> Standard message and data rates
              may apply. We are not responsible for carrier charges.
            </p>
          </div>
        </section>

        <section className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            4. HIPAA Compliance & Information Sharing
          </h3>
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              We are committed to HIPAA compliance and protect your health
              information accordingly:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                PHI is shared only with authorized healthcare providers,
                emergency contacts, and as required by law
              </li>
              <li>
                All data transmissions are encrypted using industry-standard
                protocols
              </li>
              <li>Access logs are maintained for all PHI interactions</li>
              <li>
                We do not sell or market your health information to third
                parties
              </li>
            </ul>
          </div>
        </section>

        <section className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            5. Data Security & Retention
          </h3>
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              <strong>Security Measures:</strong> We implement administrative,
              physical, and technical safeguards including encryption, access
              controls, audit logging, and secure data centers.
            </p>
            <p>
              <strong>Retention:</strong> Health information is retained as
              required by HIPAA and state regulations. Emergency contact data is
              retained while your account is active and for 7 years after
              account closure for legal compliance.
            </p>
            <p>
              <strong>Breach Notification:</strong> In the unlikely event of a
              data breach affecting your PHI, we will notify you and regulatory
              authorities as required by law.
            </p>
          </div>
        </section>

        <section className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            6. Your Rights Under HIPAA
          </h3>
          <div className="text-sm text-gray-700 space-y-2">
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Access and obtain copies of your health information</li>
              <li>Request amendments to your health information</li>
              <li>
                Request restrictions on how your information is used or
                disclosed
              </li>
              <li>Request alternative methods of communication</li>
              <li>File complaints regarding privacy practices</li>
              <li>Receive this notice of privacy practices</li>
            </ul>
          </div>
        </section>

        <section className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            7. Cookies & Analytics
          </h3>
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              We use essential cookies for authentication and security.
              Analytics data is anonymized and does not include PHI. You can
              disable non-essential cookies through your browser settings.
            </p>
          </div>
        </section>

        <section className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            8. Third-Party Services
          </h3>
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              We work with HIPAA-compliant third-party services for SMS delivery
              (Azure Communication Service), cloud hosting (AWS/Azure), and
              security monitoring.
            </p>
          </div>
        </section>

        <section className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            9. International Users
          </h3>
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              Our services are primarily designed for US healthcare providers
              and patients. If you are accessing our services from outside the
              US, your data may be transferred to and processed in the United
              States where our servers are located.
            </p>
          </div>
        </section>

        <section className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            10. Changes to This Policy
          </h3>
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              We may update this Privacy Policy to reflect changes in our
              practices or legal requirements. We will notify you of material
              changes via email or through our platform. Continued use of our
              services after changes constitutes acceptance of the updated
              policy.
            </p>
          </div>
        </section>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-6">
          <p className="text-sm text-green-800">
            <strong>Notice:</strong> We will never retaliate against you for
            filing a complaint about our privacy practices. Your health
            information and rights are protected under federal and state law.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default PrivacyPolicyModal;
