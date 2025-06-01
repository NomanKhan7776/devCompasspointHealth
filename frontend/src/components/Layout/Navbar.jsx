// src/components/Layout/Navbar.jsx - Updated for better responsive design
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
        <div className="max-w-full px-4">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              {/* Logo positioned at the start */}
              <Link to="/" className="flex items-center flex-shrink-0">
                <img
                  src="/image2.png"
                  alt="Compass Point Health Logo"
                  className="h-10 w-auto"
                />
              </Link>

              {/* Mobile menu button after logo */}
              <button
                className="inline-flex items-center justify-center p-2 ml-3 text-gray-600 lg:hidden hover:bg-gray-100 rounded-md transition-colors"
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

              {/* Application name with responsive design */}
              <div className="hidden md:flex items-center ml-8">
                <span className="text-xl font-bold text-teal-700">
                  Patient Records Management System
                </span>
              </div>

              {/* Shortened name for smaller screens */}
              <div className="flex md:hidden items-center ml-4">
                <span className="text-lg font-bold text-teal-700">PRMS</span>
              </div>
            </div>

            {currentUser && (
              <div className="flex items-center space-x-2 sm:space-x-4">
                {/* User info with responsive text */}
                <div className="text-right">
                  <div className="text-gray-700 font-medium truncate max-w-[120px] sm:max-w-none">
                    {currentUser.name}
                  </div>
                  <div className="hidden sm:block text-sm text-gray-500">
                    ({currentUser.role})
                  </div>
                </div>

                {/* Enhanced logout button */}
                <div className="relative group">
                  <button
                    onClick={() => setLogoutModalOpen(true)}
                    className="text-gray-700 hover:text-teal-600 transition-colors flex items-center px-3 py-2 rounded-md hover:bg-gray-100"
                    aria-label="Logout options"
                  >
                    <span className="hidden sm:inline">Logout</span>
                    <svg
                      className="sm:hidden h-5 w-5"
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
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Enhanced Logout Modal */}
      <Modal
        isOpen={logoutModalOpen}
        onClose={() => !loggingOut && setLogoutModalOpen(false)}
        title="Secure Logout Options"
        footer={
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <Button
              color="blue"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex-1"
            >
              {loggingOut ? "Logging out..." : "Logout This Session"}
            </Button>
            <Button
              color="red"
              onClick={handleLogoutAllSessions}
              disabled={loggingOut}
              className="flex-1"
            >
              {loggingOut ? "Logging out..." : "Logout All Sessions"}
            </Button>
            <Button
              color="gray"
              onClick={() => setLogoutModalOpen(false)}
              disabled={loggingOut}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg
                className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0"
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
              <div>
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

          <div className="space-y-3">
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center mb-2">
                <svg
                  className="h-5 w-5 text-green-600 mr-2 flex-shrink-0"
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
                <h4 className="text-sm font-medium text-gray-900">
                  Logout This Session
                </h4>
              </div>
              <p className="text-sm text-gray-600">
                Logout from this browser/device only. Other sessions will remain
                active.
              </p>
            </div>

            <div className="border border-red-200 rounded-lg p-4 bg-red-50">
              <div className="flex items-center mb-2">
                <svg
                  className="h-5 w-5 text-red-600 mr-2 flex-shrink-0"
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
                <h4 className="text-sm font-medium text-red-800">
                  Logout All Sessions
                </h4>
              </div>
              <p className="text-sm text-red-700">
                <strong>Security Action:</strong> Logout from all devices and
                browsers. Recommended if you suspect unauthorized access or are
                using a shared computer.
              </p>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg
                className="h-5 w-5 text-yellow-500 mt-0.5 mr-3 flex-shrink-0"
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
              <div>
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
