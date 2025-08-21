// Updated Footer.jsx - Added Privacy Policy with minimal changes
import React, { useState } from "react";
import PrivacyPolicyModal from "../common/PrivacyPolicyModal";

const Footer = () => {
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const currentYear = new Date().getFullYear();

  return (
    <>
      <footer className="bg-gray-100 border-t border-gray-200 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center text-gray-600">
            <div className="mb-4 md:mb-0">
              <p className="text-sm">
                &copy; {currentYear} CompassPoint Health PRMS. All rights
                reserved.
              </p>
            </div>

            {/* Added Privacy Policy Link */}
            <div className="flex items-center space-x-4 text-sm">
              <button
                onClick={() => setShowPrivacyModal(true)}
                className="text-blue-600 hover:text-blue-800 underline transition-colors duration-200"
              >
                Privacy Policy
              </button>
              <span className="text-gray-400">•</span>
              <span className="text-xs text-gray-500">SMS Terms Apply</span>
            </div>

            {/* <div>
            <p className="text-sm">
              Developed by{" "}
              <span className="font-semibold text-blue-600">AN Techs</span>
            </p>
            
          </div> */}
          </div>
        </div>
      </footer>

      {/* Privacy Policy Modal */}
      <PrivacyPolicyModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />
    </>
  );
};

export default Footer;
