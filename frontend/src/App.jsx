// src/App.jsx - UPDATED VERSION
import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";

// Auth Components
import Login from "./components/Auth/Login";
import PrivateRoute from "./components/Auth/PrivateRoute";
import RoleCheck from "./components/Auth/RoleCheck";

// SmartToken Component (NEW)
import SmartTokenRedirect from "./components/SmartToken/SmartTokenRedirect";

// Admin Components
import AdminDashboard from "./components/Dashboard/Admin/AdminDashboard";
import UserList from "./components/Dashboard/Admin/UserList";
import CreateUser from "./components/Dashboard/Admin/CreateUser";
import EditUser from "./components/Dashboard/Admin/EditUser";
import AssignResources from "./components/Dashboard/Admin/AssignResources";
import AssignmentsList from "./components/Dashboard/Admin/AssignmentsList";
import AuditLogs from "./components/Dashboard/Admin/AuditLogs";
import AdminContainers from "./components/Dashboard/Admin/AdminContainers";
import AdminFolders from "./components/Dashboard/Admin/AdminFolders";
import SmartTokenManagement from "./components/Dashboard/Admin/SmartTokenManagement";

// User Components
import UserDashboard from "./components/Dashboard/User/UserDashboard";
import ContainerList from "./components/Dashboard/User/ContainerList";
import BlobViewer from "./components/Dashboard/User/BlobViewer";
import MyAssignments from "./components/Dashboard/User/MyAssignments";

// Context Providers
import { AssignmentsProvider } from "./context/AssignmentsContext";
import { AdminProvider } from "./context/AdminContext";
import { DashboardProvider } from "./context/DashboardContext";

const App = () => {
  return (
    <AuthProvider>
      <DashboardProvider>
        <AssignmentsProvider>
          <AdminProvider>
            <Router>
              <Routes>
                {/* PUBLIC ROUTES - No authentication required */}

                {/* Login Route */}
                <Route path="/login" element={<Login />} />

                {/* SmartToken Redirect Route - MUST be public for emergency access */}
                <Route
                  path="/patients/verify/:id"
                  element={<SmartTokenRedirect />}
                />

                {/* PRIVATE ROUTES - Authentication required */}
                <Route element={<PrivateRoute />}>
                  {/* Dashboard route */}
                  <Route path="/dashboard" element={<DashboardRouter />} />

                  {/* Admin routes - using RoleCheck */}
                  <Route
                    path="/users"
                    element={
                      <RoleCheck allowedRoles={["admin"]}>
                        <UserList />
                      </RoleCheck>
                    }
                  />

                  <Route
                    path="/users/create"
                    element={
                      <RoleCheck allowedRoles={["admin"]}>
                        <CreateUser />
                      </RoleCheck>
                    }
                  />

                  <Route
                    path="/users/edit/:userId"
                    element={
                      <RoleCheck allowedRoles={["admin"]}>
                        <EditUser />
                      </RoleCheck>
                    }
                  />

                  <Route
                    path="/users/assign/:userId"
                    element={
                      <RoleCheck allowedRoles={["admin"]}>
                        <AssignResources />
                      </RoleCheck>
                    }
                  />

                  <Route
                    path="/assignments"
                    element={
                      <RoleCheck allowedRoles={["admin"]}>
                        <AssignmentsList />
                      </RoleCheck>
                    }
                  />

                  <Route
                    path="/audit-logs"
                    element={
                      <RoleCheck allowedRoles={["admin"]}>
                        <AuditLogs />
                      </RoleCheck>
                    }
                  />

                  {/* Admin Container Management Routes */}
                  <Route
                    path="/admin/containers"
                    element={
                      <RoleCheck allowedRoles={["admin"]}>
                        <AdminContainers />
                      </RoleCheck>
                    }
                  />

                  <Route
                    path="/admin/containers/:containerName"
                    element={
                      <RoleCheck allowedRoles={["admin"]}>
                        <AdminFolders />
                      </RoleCheck>
                    }
                  />

                  {/* SmartToken Management Route */}
                  <Route
                    path="/admin/smart-tokens"
                    element={
                      <RoleCheck allowedRoles={["admin"]}>
                        <SmartTokenManagement />
                      </RoleCheck>
                    }
                  />

                  {/* Admin Blob Viewer - Important for back button functionality */}
                  <Route
                    path="/admin/containers/:containerName/folders/:folderName"
                    element={
                      <RoleCheck allowedRoles={["admin"]}>
                        <BlobViewer />
                      </RoleCheck>
                    }
                  />

                  {/* User routes - all authenticated users */}
                  <Route path="/my-assignments" element={<MyAssignments />} />
                  <Route
                    path="/containers/:containerName"
                    element={<ContainerList />}
                  />
                  <Route
                    path="/containers/:containerName/folders/:folderName"
                    element={<BlobViewer />}
                  />
                </Route>

                {/* Default Routes */}
                <Route
                  path="/"
                  element={<Navigate replace to="/dashboard" />}
                />

                {/* Catch-all route - redirect unknown paths to dashboard */}
                <Route
                  path="*"
                  element={<Navigate replace to="/dashboard" />}
                />
              </Routes>
            </Router>
          </AdminProvider>
        </AssignmentsProvider>
      </DashboardProvider>
    </AuthProvider>
  );
};

// Smart Dashboard Router that redirects based on role
const DashboardRouter = () => {
  // Check if user is admin by parsing the token
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate replace to="/login" />;
  }

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const isAdmin = payload.user?.role === "admin";

    return isAdmin ? <AdminDashboard /> : <UserDashboard />;
  } catch (error) {
    console.error("Error parsing token:", error);
    return <Navigate replace to="/login" />;
  }
};

export default App;
