// src/components/Layout/Sidebar.jsx
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";

const Sidebar = ({ closeSidebar }) => {
  const { currentUser } = useAuth();
  const location = useLocation();

  const isAdmin = currentUser?.role === "admin";

  const NavItem = ({ to, children, icon }) => {
    const isActive =
      location.pathname === to || location.pathname.startsWith(`${to}/`);
    return (
      <Link
        to={to}
        className={`flex items-center px-4 py-2 rounded-md transition-colors duration-200 ${
          isActive
            ? "bg-blue-500 text-white"
            : "text-gray-700 hover:bg-blue-100 hover:text-blue-600"
        }`}
        onClick={closeSidebar}
      >
        {icon && <span className="mr-3">{icon}</span>}
        {children}
      </Link>
    );
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto pt-5 pb-4 px-3">
      <div className="flex items-center justify-between mb-6 px-1 lg:hidden">
        <h2 className="text-xl font-bold text-gray-800">Dashboard</h2>
        <button
          onClick={closeSidebar}
          className="p-1 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
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
      </div>

      <div className="hidden lg:block mb-6 px-1">
        <h2 className="text-xl font-bold text-gray-800">Dashboard</h2>
      </div>

      <ul className="space-y-2">
        <li>
          <NavItem
            to="/dashboard"
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
              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                User Management
              </div>
            </li>
            <li>
              <NavItem
                to="/users"
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

            <li className="pt-4">
              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                System Management
              </div>
            </li>
            <li>
              <NavItem
                to="/admin/containers"
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
              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Monitoring
              </div>
            </li>
            <li>
              <NavItem
                to="/audit-logs"
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
              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                My Access
              </div>
            </li>
            <li>
              <NavItem
                to="/my-assignments"
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
          </>
        )}
      </ul>

      {/* User Info at Bottom */}
      <div className="mt-auto pt-4 border-t border-gray-200">
        <div className="px-4 py-2">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {currentUser?.name.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-700">
                {currentUser?.name}
              </p>
              <p className="text-xs text-gray-500 capitalize">
                {currentUser?.role}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
