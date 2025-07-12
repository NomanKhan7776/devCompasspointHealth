// src/components/Layout/Sidebar.jsx - ENHANCED WITH EMERGENCY CONTACTS FOR PATIENTS
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
  const isPatient = currentUser?.role === "patient"; // ✅ NEW: Patient role check

  const NavItem = ({ to, children, icon, title, badge }) => {
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
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        {!isCollapsed && (
          <div className="flex items-center">
            <h2 className="text-lg font-semibold text-gray-800">
              {isAdmin
                ? "Admin Panel"
                : isDoctor
                ? "Doctor Portal"
                : isPatient
                ? "Patient Portal"
                : "Dashboard"}
            </h2>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1 rounded-md hover:bg-gray-100 transition-colors duration-200"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            className={`w-5 h-5 text-gray-600 transition-transform duration-200 ${
              isCollapsed ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
            />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1">
        <ul className="space-y-1">
          {/* Home/Dashboard - Available to all users */}
          <li>
            <NavItem
              to="/"
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

          {/* ✅ PATIENT-SPECIFIC NAVIGATION */}
          {isPatient && (
            <>
              <li className="pt-4">
                <SectionHeader>My Medical Data</SectionHeader>
              </li>
              <li>
                <NavItem
                  to="/my-assignments"
                  title="Medical Files"
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
                  Medical Files
                </NavItem>
              </li>
              <li>
                <NavItem
                  to="/my-tokens"
                  title="SmartTokens"
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
                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                      />
                    </svg>
                  }
                >
                  My SmartTokens
                </NavItem>
              </li>

              {/* ✅ NEW: Emergency Contacts Section */}
              <li className="pt-4">
                <SectionHeader>Emergency & Safety</SectionHeader>
              </li>
              <li>
                <NavItem
                  to="/emergency-contacts"
                  title="Emergency Contacts"
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
                        d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                  }
                >
                  Emergency Contacts
                </NavItem>
              </li>
              <li>
                <NavItem
                  to="/security-alerts"
                  title="Security Alerts"
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
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.728-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z"
                      />
                    </svg>
                  }
                >
                  Security Alerts
                </NavItem>
              </li>
              <li>
                <NavItem
                  to="/device-management"
                  title="Device Management"
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
                        d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                  }
                >
                  My Devices
                </NavItem>
              </li>
            </>
          )}

          {/* ADMIN NAVIGATION (existing) */}
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
                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                      />
                    </svg>
                  }
                >
                  SmartToken Management
                </NavItem>
              </li>
              <li>
                <NavItem
                  to="/smarttoken-logs"
                  title="Access Logs"
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
                  Access Logs
                </NavItem>
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

          {/* DOCTOR NAVIGATION (existing + enhanced) */}
          {isDoctor && (
            <>
              <li className="pt-4">
                <SectionHeader>Patient Care</SectionHeader>
              </li>
              <li>
                <NavItem
                  to="/my-assignments"
                  title="Patient Files"
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
                  Patient Files
                </NavItem>
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
            </>
          )}
        </ul>
      </nav>

      {/* Footer */}
      <div className="pt-4 border-t border-gray-200">
        {!isCollapsed && (
          <div className="px-4 py-2">
            <p className="text-xs text-gray-500">
              CompassPoint Health PRMS v2.1.0
            </p>
            <p className="text-xs text-gray-400">
              {isAdmin
                ? "Administrator"
                : isDoctor
                ? "Healthcare Provider"
                : isPatient
                ? "Patient Portal"
                : "User"}{" "}
              Portal
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
