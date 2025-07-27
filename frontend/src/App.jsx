// src/App.jsx - ENHANCED VERSION WITH EMERGENCY FEATURES
import React, { useEffect } from "react";
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

// SmartToken Components
import SmartTokenRedirect from "./components/SmartToken/SmartTokenRedirect";
import QRDeviceRegistration from "./components/QRDeviceRegistration";

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
import EnhancedSmartTokenManagement from "./components/Dashboard/Admin/EnhancedSmartTokenManagement";
import SmartTokenManagement from "./components/Dashboard/Admin/SmartTokenManagement";
import SmartTokenLogs from "./components/Dashboard/Admin/SmartTokenLogs";

// User Components
import UserDashboard from "./components/Dashboard/User/UserDashboard";
import ContainerList from "./components/Dashboard/User/ContainerList";
import BlobViewer from "./components/Dashboard/User/BlobViewer";
import MyAssignments from "./components/Dashboard/User/MyAssignments";

// ✅ ENHANCED: Patient Components with Emergency Features
import PatientDashboard from "./components/Dashboard/PatientDashboard";
import EmergencyContacts from "./components/Dashboard/Patient/EmergencyContacts";
import SecurityAlerts from "./components/Dashboard/Patient/SecurityAlerts";
import DeviceManagement from "./components/Dashboard/Patient/DeviceRegistration";
import MySmartTokens from "./components/Dashboard/Patient/MySmartTokens";

// Patient Request Components
import PatientRequestList from "./components/patient-requests/PatientRequestList";
import CreatePatientRequest from "./components/patient-requests/CreatePatientRequest";
import PatientRequestDetail from "./components/patient-requests/PatientRequestDetail";
import FamilyDeviceQR from "./components/Dashboard/Patient/FamilyDeviceQR";
// Context Providers
import { AssignmentsProvider } from "./context/AssignmentsContext";
import { AdminProvider } from "./context/AdminContext";
import { DashboardProvider } from "./context/DashboardContext";
import { PatientRequestProvider } from "./context/PatientRequestContext";
import fingerprintService from "./services/fingerprintService";

const App = () => {
  useEffect(() => {
    const initializeFingerprintService = async () => {
      try {
        console.log(
          "🔄 Initializing FingerprintJS Pro for emergency features..."
        );
        await fingerprintService.initialize();
        console.log(
          "✅ FingerprintJS Pro ready for device management and emergency access"
        );

        // Optional: Test consistency on startup (useful for debugging)
        if (import.meta.env.NODE_ENV === "development") {
          fingerprintService.testConsistency();
        }
      } catch (error) {
        console.error("❌ Failed to initialize FingerprintJS Pro:", error);
        console.warn(
          "🔄 Falling back to basic fingerprinting for emergency access"
        );
      }
    };

    initializeFingerprintService();
  }, []);

  return (
    <AuthProvider>
      <DashboardProvider>
        <AssignmentsProvider>
          <AdminProvider>
            <PatientRequestProvider>
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

                  {/* QR Device Registration Route - Public for family members */}
                  <Route
                    path="/register-device/:qrToken"
                    element={<QRDeviceRegistration />}
                  />

                  {/* PRIVATE ROUTES - Authentication required */}
                  <Route element={<PrivateRoute />}>
                    {/* Dashboard route with enhanced role-based routing */}
                    <Route path="/dashboard" element={<DashboardRouter />} />
                    <Route
                      path="/"
                      element={<Navigate replace to="/dashboard" />}
                    />

                    {/* ✅ PATIENT-SPECIFIC ROUTES - Emergency Features */}
                    <Route
                      path="/emergency-contacts"
                      element={
                        <RoleCheck allowedRoles={["patient"]}>
                          <EmergencyContacts />
                        </RoleCheck>
                      }
                    />

                    <Route
                      path="/security-alerts"
                      element={
                        <RoleCheck allowedRoles={["patient"]}>
                          <SecurityAlerts />
                        </RoleCheck>
                      }
                    />

                    <Route
                      path="/device-management"
                      element={
                        <RoleCheck allowedRoles={["patient"]}>
                          <DeviceManagement />
                        </RoleCheck>
                      }
                    />

                    <Route
                      path="/my-tokens"
                      element={
                        <RoleCheck allowedRoles={["patient"]}>
                          <MySmartTokens />
                        </RoleCheck>
                      }
                    />
                    <Route
                      path="/family-registration"
                      element={
                        <RoleCheck allowedRoles={["patient"]}>
                          <FamilyDeviceQR />
                        </RoleCheck>
                      }
                    />

                    {/* ADMIN ROUTES */}
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

                    <Route
                      path="/smarttoken-logs"
                      element={
                        <RoleCheck allowedRoles={["admin"]}>
                          <SmartTokenLogs />
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

                    {/* Enhanced SmartToken Management Route */}
                    <Route
                      path="/admin/smart-tokens"
                      element={
                        <RoleCheck allowedRoles={["admin"]}>
                          <EnhancedSmartTokenManagement />
                        </RoleCheck>
                      }
                    />

                    {/* Admin Blob Viewer */}
                    <Route
                      path="/admin/containers/:containerName/folders/:folderName"
                      element={
                        <RoleCheck allowedRoles={["admin"]}>
                          <BlobViewer />
                        </RoleCheck>
                      }
                    />

                    {/* Patient Request Routes */}
                    <Route
                      path="/patient-requests"
                      element={
                        <RoleCheck allowedRoles={["admin", "doctor"]}>
                          <PatientRequestList />
                        </RoleCheck>
                      }
                    />

                    <Route
                      path="/patient-requests/create"
                      element={
                        <RoleCheck allowedRoles={["doctor"]}>
                          <CreatePatientRequest />
                        </RoleCheck>
                      }
                    />

                    <Route
                      path="/patient-requests/:requestId"
                      element={
                        <RoleCheck allowedRoles={["admin", "doctor"]}>
                          <PatientRequestDetail />
                        </RoleCheck>
                      }
                    />

                    {/* USER/DOCTOR ROUTES */}
                    <Route path="/my-assignments" element={<MyAssignments />} />
                    <Route
                      path="/containers"
                      element={
                        <RoleCheck
                          allowedRoles={[
                            "doctor",
                            "nurse",
                            "assistant",
                            "patient",
                          ]}
                        >
                          <ContainerList />
                        </RoleCheck>
                      }
                    />
                    <Route
                      path="/containers/:containerName"
                      element={
                        <RoleCheck
                          allowedRoles={[
                            "doctor",
                            "nurse",
                            "assistant",
                            "patient",
                          ]}
                        >
                          <ContainerList />
                        </RoleCheck>
                      }
                    />
                    <Route
                      path="/containers/:containerName/folders/:folderName"
                      element={
                        <RoleCheck
                          allowedRoles={[
                            "doctor",
                            "nurse",
                            "assistant",
                            "patient",
                          ]}
                        >
                          <BlobViewer />
                        </RoleCheck>
                      }
                    />
                  </Route>

                  {/* Catch-all route - redirect unknown paths to dashboard */}
                  <Route
                    path="*"
                    element={<Navigate replace to="/dashboard" />}
                  />
                </Routes>
              </Router>
            </PatientRequestProvider>
          </AdminProvider>
        </AssignmentsProvider>
      </DashboardProvider>
    </AuthProvider>
  );
};

// Enhanced Dashboard Router with improved role handling and emergency features
const DashboardRouter = () => {
  // Check if user is authenticated by parsing the token
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate replace to="/login" />;
  }

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const userRole = payload.user?.role || payload.role;
    const userType = payload.user?.userType || payload.userType;

    // Handle different user roles with enhanced dashboards including emergency features
    if (userRole === "admin") {
      return <AdminDashboard />;
    } else if (userRole === "patient") {
      // ✅ ENHANCED: Patient dashboard with emergency features
      return <PatientDashboard />;
    } else if (userRole === "doctor") {
      // Enhanced user dashboard for doctors
      return <UserDashboard />;
    } else if (userRole === "nurse" || userRole === "assistant") {
      // Enhanced user dashboard for other healthcare staff
      return <UserDashboard />;
    } else {
      // Fallback to general user dashboard
      return <UserDashboard />;
    }
  } catch (error) {
    console.error("Error parsing token:", error);
    // Clear invalid token and redirect to login
    localStorage.removeItem("token");
    return <Navigate replace to="/login" />;
  }
};

export default App;
