// src/components/Layout/Navbar.jsx - Fixed mobile UI issues
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
                aria-label="Toggle sidebar"
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

            {/* Right side - User info and logout */}
            {currentUser && (
              <div className="flex items-center space-x-1 sm:space-x-3 flex-shrink-0">
                {/* User info - mobile optimized */}
                <div className="text-right min-w-0">
                  {/* User name - responsive */}
                  <div className="text-gray-700 font-medium text-sm sm:text-base truncate max-w-[80px] sm:max-w-[120px] md:max-w-none">
                    {/* Show first name only on very small screens */}
                    <span className="inline sm:hidden">
                      {currentUser.name.split(" ")[0]}
                    </span>
                    {/* Show full name on larger screens */}
                    <span className="hidden sm:inline">{currentUser.name}</span>
                  </div>
                  {/* Role - only show on medium+ screens */}
                  <div className="hidden md:block text-xs text-gray-500 capitalize truncate">
                    ({currentUser.role})
                  </div>
                </div>

                {/* Logout button - mobile optimized */}
                <button
                  onClick={() => setLogoutModalOpen(true)}
                  className="text-gray-700 hover:text-teal-600 transition-colors flex items-center px-2 py-2 rounded-md hover:bg-gray-100 flex-shrink-0"
                  aria-label="Logout options"
                >
                  {/* Mobile icon only */}
                  <svg
                    className="inline sm:hidden h-5 w-5"
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
                  <span className="hidden sm:inline text-sm">Logout</span>
                  <svg
                    className="hidden sm:inline w-4 h-4 ml-1"
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

      {/* Enhanced Logout Modal - Mobile Optimized */}
      <Modal
        isOpen={logoutModalOpen}
        onClose={() => !loggingOut && setLogoutModalOpen(false)}
        title="Secure Logout Options"
        footer={
          <div className="flex flex-col space-y-3 w-full">
            {/* Primary logout button */}
            <Button
              color="blue"
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full"
            >
              {loggingOut ? (
                <span className="flex items-center justify-center">
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
                </span>
              ) : (
                "Logout This Session"
              )}
            </Button>

            {/* Secondary logout all button */}
            <Button
              color="red"
              onClick={handleLogoutAllSessions}
              disabled={loggingOut}
              className="w-full"
            >
              {loggingOut ? "Logging out..." : "Logout All Sessions"}
            </Button>

            {/* Cancel button */}
            <Button
              color="gray"
              onClick={() => setLogoutModalOpen(false)}
              disabled={loggingOut}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        }
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Security Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start">
              <svg
                className="h-5 w-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0"
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
              <div className="min-w-0">
                <h4 className="text-sm font-medium text-blue-800 mb-1">
                  Security Notice
                </h4>
                <p className="text-sm text-blue-700">
                  All open file viewers will be automatically closed for
                  security when you logout.
                </p>
              </div>
            </div>
          </div>

          {/* Logout Options */}
          <div className="space-y-3">
            {/* This Session Option */}
            <div className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-start">
                <svg
                  className="h-5 w-5 text-green-600 mr-2 mt-0.5 flex-shrink-0"
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
                <div className="min-w-0">
                  <h4 className="text-sm font-medium text-gray-900 mb-1">
                    Logout This Session
                  </h4>
                  <p className="text-sm text-gray-600">
                    Logout from this browser/device only. Other sessions will
                    remain active.
                  </p>
                </div>
              </div>
            </div>

            {/* All Sessions Option */}
            <div className="border border-red-200 rounded-lg p-3 bg-red-50">
              <div className="flex items-start">
                <svg
                  className="h-5 w-5 text-red-600 mr-2 mt-0.5 flex-shrink-0"
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
                <div className="min-w-0">
                  <h4 className="text-sm font-medium text-red-800 mb-1">
                    Logout All Sessions
                  </h4>
                  <p className="text-sm text-red-700">
                    <strong>Security Action:</strong> Logout from all devices
                    and browsers. Recommended if you suspect unauthorized access
                    or are using a shared computer.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Important Notice */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-start">
              <svg
                className="h-5 w-5 text-yellow-500 mt-0.5 mr-2 flex-shrink-0"
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
              <div className="min-w-0">
                <h4 className="text-sm font-medium text-yellow-800 mb-1">
                  Important
                </h4>
                <p className="text-sm text-yellow-700">
                  Any files you have open in separate windows will be
                  automatically closed and become inaccessible after logout for
                  security purposes.
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
