// src/components/Layout/Layout.jsx - Updated with collapsible sidebar state
import React, { useState, useEffect } from "react";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import Footer from "./Footer";

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    if (saved !== null) {
      setSidebarCollapsed(JSON.parse(saved));
    }
  }, []);

  // Save collapsed state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleMobileMenuClick = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <Navbar onMenuClick={handleMobileMenuClick} />

      <div className="flex flex-1">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black bg-opacity-50 lg:hidden"
            onClick={closeSidebar}
          ></div>
        )}

        {/* Sidebar */}
        <div
          className={`
          fixed inset-y-0 left-0 z-30 transform bg-white shadow-md transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} 
          lg:relative lg:translate-x-0 lg:z-0
          ${sidebarCollapsed ? "lg:w-16" : "lg:w-64"}
        `}
        >
          <Sidebar
            closeSidebar={closeSidebar}
            isCollapsed={sidebarCollapsed}
            toggleSidebar={toggleSidebar}
          />
        </div>

        {/* Main content */}
        <main
          className={`
          flex-1 p-4 w-full lg:p-6 overflow-x-hidden transition-all duration-300
          ${sidebarCollapsed ? "lg:ml-0" : "lg:ml-0"}
        `}
        >
          <div className="max-w-full mx-auto">{children}</div>
        </main>
      </div>

      {/* Footer positioned at the bottom */}
      <Footer />
    </div>
  );
};

export default Layout;
