// src/components/Layout/Sidebar.jsx - Updated with patient request feature
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import { usePatientRequests } from "../../hooks/usePatientRequests";

const Sidebar = ({ closeSidebar, isCollapsed, toggleSidebar }) => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const patientRequestsContext = usePatientRequests();

  const pendingRequestCount = patientRequestsContext?.getPendingCount?.() || 0;

  const isAdmin = currentUser?.role === "admin";
  const isDoctor = currentUser?.role === "doctor";

  const NavItem = ({ to, children, icon, title, badge }) => {
    // ✅ FIXED: More precise active state matching
    const isActive =
      location.pathname === to ||
      (location.pathname.startsWith(`${to}/`) &&
        !location.pathname.includes("/create"));
    return (
      <Link
        to={to}
        className={`flex items-center px-4 py-2 rounded-md transition-colors duration-200 group relative ${
          isActive
            ? "bg-blue-500 text-white"
            : "text-gray-700 hover:bg-blue-100 hover:text-blue-600"
        }`}
        onClick={closeSidebar}
        title={isCollapsed ? title : undefined}
      >
        {icon && (
          <span className={`${isCollapsed ? "mx-auto" : "mr-3"} flex-shrink-0`}>
            {icon}
          </span>
        )}
        {!isCollapsed && (
          <div className="flex justify-between items-center w-full">
            <span className="whitespace-nowrap overflow-hidden">
              {children}
            </span>
            {badge && (
              <span className="ml-2 px-2 py-0.5 text-xs font-bold rounded-full bg-yellow-500 text-white">
                {badge}
              </span>
            )}
          </div>
        )}

        {/* Tooltip for collapsed state */}
        {isCollapsed && (
          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 whitespace-nowrap">
            {title} {badge && `(${badge})`}
          </div>
        )}
      </Link>
    );
  };

  const SectionHeader = ({ children }) => {
    if (isCollapsed) {
      return (
        <div className="px-4 py-2">
          <div className="h-px bg-gray-300"></div>
        </div>
      );
    }
    return (
      <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {children}
      </div>
    );
  };

  return (
    <div
      className={`h-full flex flex-col overflow-y-auto pt-5 pb-4 px-3 bg-white transition-all duration-300 ${
        isCollapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Header with toggle button */}
      <div
        className={`flex items-center justify-between mb-6 px-1 ${
          isCollapsed ? "justify-center" : ""
        }`}
      >
        {!isCollapsed && (
          <>
            {/* Mobile close button */}
            <h2 className="text-xl font-bold text-gray-800 lg:hidden">
              Dashboard
            </h2>
            <button
              onClick={closeSidebar}
              className="p-1 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 lg:hidden"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </>
        )}

        {/* Desktop header and toggle */}
        <div
          className={`hidden lg:flex items-center ${
            isCollapsed ? "justify-center w-full" : "justify-between w-full"
          }`}
        >
          {!isCollapsed && (
            <h2 className="text-xl font-bold text-gray-800">Dashboard</h2>
          )}

          {/* Toggle button */}
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 5l7 7-7 7M5 5l7 7-7 7"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 19l-7-7 7-7M19 19l-7-7 7-7"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Navigation Menu */}
      <ul className="space-y-2 flex-grow">
        <li>
          <NavItem
            to="/dashboard"
            title="Home"
            icon={
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
            }
          >
            Home
          </NavItem>
        </li>

        {isAdmin && (
          <>
            <li className="pt-4">
              <SectionHeader>User Management</SectionHeader>
            </li>
            <li>
              <NavItem
                to="/users"
                title="Users"
                icon={
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                    />
                  </svg>
                }
              >
                Users
              </NavItem>
            </li>
            <li>
              <NavItem
                to="/assignments"
                title="Assignments"
                icon={
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                    />
                  </svg>
                }
              >
                Assignments
              </NavItem>
            </li>

            {/* Patient Requests section for Admin */}
            <li className="pt-4">
              <SectionHeader>Patient Management</SectionHeader>
            </li>
            <li>
              <NavItem
                to="/patient-requests"
                title="Patient Requests"
                badge={pendingRequestCount > 0 ? pendingRequestCount : null}
                icon={
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                    />
                  </svg>
                }
              >
                Patient Requests
              </NavItem>
            </li>

            <li className="pt-4">
              <SectionHeader>System Management</SectionHeader>
            </li>
            <li>
              <NavItem
                to="/admin/containers"
                title="Storage Management"
                icon={
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
                    />
                  </svg>
                }
              >
                Storage Management
              </NavItem>
            </li>
            <li>
              <NavItem
                to="/admin/smart-tokens"
                title="SmartToken Management"
                icon={
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 7a2 2 0 012 2m0 0a2 2 0 012 2v2a2 2 0 01-2 2m-2-2a2 2 0 00-2-2m2 2v2a2 2 0 01-2 2m0 0H9m6 0a2 2 0 01-2-2v-2a2 2 0 00-2-2m2 2H9a2 2 0 00-2-2v2a2 2 0 002 2m0 0h6v2a2 2 0 002 2H9a2 2 0 01-2-2v-2z"
                    />
                  </svg>
                }
              >
                SmartToken Management
              </NavItem>
            </li>

            <li className="pt-4">
              <SectionHeader>Monitoring</SectionHeader>
            </li>
            <li>
              <NavItem
                to="/audit-logs"
                title="Audit Logs"
                icon={
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                }
              >
                Audit Logs
              </NavItem>
            </li>
          </>
        )}

        {!isAdmin && (
          <>
            <li className="pt-4">
              <SectionHeader>My Access</SectionHeader>
            </li>
            <li>
              <NavItem
                to="/my-assignments"
                title="My Assignments"
                icon={
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                }
              >
                My Assignments
              </NavItem>
            </li>

            {/* Patient Requests for Doctors */}
            {isDoctor && (
              <>
                <li>
                  <NavItem
                    to="/patient-requests"
                    title="Patient Requests"
                    icon={
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                        />
                      </svg>
                    }
                  >
                    Patient Requests
                  </NavItem>
                </li>
                <li>
                  <NavItem
                    to="/patient-requests/create"
                    title="New Patient Request"
                    icon={
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    }
                  >
                    New Patient Request
                  </NavItem>
                </li>
              </>
            )}
          </>
        )}
      </ul>

      {/* User Info at Bottom */}
      <div
        className={`mt-auto pt-4 border-t border-gray-200 ${
          isCollapsed ? "px-1" : "px-4"
        }`}
      >
        <div
          className={`flex items-center ${isCollapsed ? "justify-center" : ""}`}
        >
          <div className="flex-shrink-0">
            <div
              className={`${
                isCollapsed ? "h-10 w-10" : "h-8 w-8"
              } rounded-full bg-blue-500 flex items-center justify-center`}
            >
              <span className="text-white text-sm font-medium">
                {currentUser?.name.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
          {!isCollapsed && (
            <div className="ml-3 min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-700 truncate">
                {currentUser?.name}
              </p>
              <p className="text-xs text-gray-500 capitalize">
                {currentUser?.role}
              </p>
            </div>
          )}
          {isCollapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 whitespace-nowrap">
              {currentUser?.name} ({currentUser?.role})
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
