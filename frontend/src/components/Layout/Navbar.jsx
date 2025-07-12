// src/components/Layout/Navbar.jsx - Enhanced with Improved Modal UI
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import Modal from "../common/Modal";
import Button from "../common/Button";

const Navbar = ({ onMenuClick }) => {
  const { currentUser, logout, logoutAllSessions } = useAuth();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logout();
      setLogoutModalOpen(false);
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setLoggingOut(false);
    }
  };

  const handleLogoutAllSessions = async () => {
    try {
      setLoggingOut(true);
      await logoutAllSessions();
      setLogoutModalOpen(false);
    } catch (error) {
      console.error("Logout all sessions error:", error);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <>
      <nav className="bg-white shadow-md relative z-40">
        <div className="max-w-full px-3 sm:px-4">
          <div className="flex justify-between items-center h-16">
            {/* Left side - Logo and Menu */}
            <div className="flex items-center min-w-0 flex-1">
              {/* Mobile menu button */}
              <button
                className="inline-flex items-center justify-center p-2 text-gray-600 lg:hidden hover:bg-gray-100 rounded-md transition-colors mr-2 flex-shrink-0"
                onClick={onMenuClick}
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>

              {/* Logo */}
              <Link to="/" className="flex items-center flex-shrink-0 mr-2">
                <img
                  src="/image2.png"
                  alt="Compass Point Health Logo"
                  className="h-8 w-auto sm:h-10"
                />
              </Link>

              {/* Application name - responsive */}
              <div className="min-w-0 flex-1">
                {/* Full name for larger screens */}
                <span className="hidden lg:inline text-xl font-bold text-teal-700 truncate">
                  Patient Records Management System
                </span>
                {/* Medium screens */}
                <span className="hidden md:inline lg:hidden text-lg font-bold text-teal-700 truncate">
                  Patient Records System
                </span>
                {/* Small screens */}
                <span className="inline md:hidden text-base font-bold text-teal-700 truncate">
                  PRMS
                </span>
              </div>
            </div>

            {/* Right side - User info */}
            {currentUser && (
              <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
                {/* User info - hidden on very small screens */}
                <div className="hidden md:block text-right min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {currentUser.name}
                  </div>
                  <div className="text-xs text-gray-500 capitalize truncate">
                    {currentUser.role}
                  </div>
                </div>

                {/* User avatar and logout */}
                <button
                  onClick={() => setLogoutModalOpen(true)}
                  className="flex items-center p-1 sm:p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors group"
                  title="Logout Options"
                >
                  {/* User Avatar */}
                  <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium mr-1 sm:mr-2 flex-shrink-0">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  
                  {/* Mobile: Only logout icon, Desktop: Text + dropdown icon */}
                  <svg
                    className="h-5 w-5 sm:hidden"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  {/* Desktop text with icon */}
                  <span className="hidden sm:inline text-sm mr-1">Logout</span>
                  <svg
                    className="hidden sm:inline w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Enhanced Logout Modal - Clean and Professional */}
      <Modal
        isOpen={logoutModalOpen}
        onClose={() => !loggingOut && setLogoutModalOpen(false)}
        title="Secure Logout Options"
        size="md"
        footer={
          <div className="flex flex-col sm:flex-row-reverse sm:space-x-reverse sm:space-x-3 space-y-3 sm:space-y-0">
            {/* Primary Action - Regular Logout */}
            <Button
              color="blue"
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full sm:w-auto order-2 sm:order-1"
            >
              {loggingOut ? (
                <div className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Logging out...
                </div>
              ) : (
                "Logout This Session"
              )}
            </Button>

            {/* Secondary Action - Logout All */}
            <Button
              color="red"
              onClick={handleLogoutAllSessions}
              disabled={loggingOut}
              className="w-full sm:w-auto order-3 sm:order-2"
            >
              Logout All Sessions
            </Button>

            {/* Cancel */}
            <Button
              color="gray"
              onClick={() => setLogoutModalOpen(false)}
              disabled={loggingOut}
              className="w-full sm:w-auto order-1 sm:order-3"
            >
              Cancel
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Regular Logout Option */}
          <div className="border border-green-200 rounded-lg p-4 bg-green-50">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h4 className="text-sm font-semibold text-green-800">
                  Logout This Session
                </h4>
                <p className="text-sm text-green-700 mt-1">
                  Logout from this browser/device only. Other sessions will remain active.
                </p>
              </div>
            </div>
          </div>

          {/* Logout All Sessions Option */}
          <div className="border border-red-200 rounded-lg p-4 bg-red-50">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg
                  className="h-6 w-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h4 className="text-sm font-semibold text-red-800">
                  Logout All Sessions
                </h4>
                <p className="text-sm text-red-700 mt-1">
                  <span className="font-medium">Security Action:</span> Logout from all devices and browsers. 
                  Recommended if you suspect unauthorized access or are using a shared computer.
                </p>
              </div>
            </div>
          </div>

          {/* Important Notice */}
          <div className="border border-yellow-200 rounded-lg p-4 bg-yellow-50">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg
                  className="h-6 w-6 text-yellow-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h4 className="text-sm font-semibold text-yellow-800">
                  Important
                </h4>
                <p className="text-sm text-yellow-700 mt-1">
                  Any files you have open in separate windows will be automatically closed 
                  and become inaccessible after logout for security purposes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default Navbar;