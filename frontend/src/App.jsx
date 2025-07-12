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

// Context Providers
import { AssignmentsProvider } from "./context/AssignmentsContext";
import { AdminProvider } from "./context/AdminContext";
import { DashboardProvider } from "./context/DashboardContext";
import { PatientRequestProvider } from "./context/PatientRequestContext";

const App = () => {
  // Load device fingerprinting service on app startup for emergency features
  useEffect(() => {
    const loadDeviceFingerprintingService = () => {
      // Check if service already loaded
      if (window.DeviceFingerprintingService) {
        console.log("✅ Device Fingerprinting Service already loaded");
        return;
      }

      // Get backend URL from environment or default
      const backendUrl =
        import.meta.env.VITE_REACT_API_URL || "http://localhost:5000";

      // Create script element
      const script = document.createElement("script");
      script.src = `${backendUrl}/js/deviceFingerprintingService.js`;
      script.async = true;
      script.crossOrigin = "anonymous";

      script.onload = () => {
        console.log("✅ Device Fingerprinting Service loaded successfully");

        // Verify service is available
        if (window.DeviceFingerprintingService) {
          console.log(
            "✅ DeviceFingerprintingService is ready for emergency features"
          );
        } else {
          console.warn(
            "⚠️ Service loaded but DeviceFingerprintingService not found on window"
          );
        }
      };

      script.onerror = (error) => {
        console.warn(
          "⚠️ Failed to load Device Fingerprinting Service from backend"
        );
        console.warn(`Attempted URL: ${script.src}`);

        // Fallback: Try to load from public folder
        loadFallbackService();
      };

      // Add to head
      document.head.appendChild(script);
    };

    // Fallback function to load from public folder
    const loadFallbackService = () => {
      console.log(
        "🔄 Attempting to load fingerprinting service from public folder..."
      );

      const fallbackScript = document.createElement("script");
      fallbackScript.src = "/deviceFingerprintingService.js";
      fallbackScript.async = true;

      fallbackScript.onload = () => {
        console.log(
          "✅ Device Fingerprinting Service loaded from fallback location"
        );
      };

      fallbackScript.onerror = () => {
        console.error(
          "❌ Failed to load Device Fingerprinting Service from both locations"
        );
        console.log(
          "📝 Please ensure the service file is available at one of these locations:"
        );
        console.log(
          "   1. Backend: http://localhost:5000/js/deviceFingerprintingService.js"
        );
        console.log("   2. Frontend: /public/deviceFingerprintingService.js");

        // Create a minimal fallback service for emergency features
        createFallbackService();
      };

      document.head.appendChild(fallbackScript);
    };

    // Create minimal fallback service for emergency features
    const createFallbackService = () => {
      console.log(
        "🛠️ Creating fallback device fingerprinting service for emergency features..."
      );

      window.DeviceFingerprintingService = class {
        constructor() {
          console.warn(
            "Using fallback fingerprinting service with limited features"
          );
        }

        async generateFingerprint() {
          // Basic fingerprint using available browser APIs
          const basicData = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screenResolution: `${screen.width}x${screen.height}`,
            timezone: new Date().getTimezoneOffset(),
            timestamp: Date.now(),
            deviceType: this.getDeviceType(),
            browserName: this.getBrowserName(),
          };

          // Generate a simple hash
          const dataString = JSON.stringify(basicData);
          const hash = btoa(dataString)
            .replace(/[^a-zA-Z0-9]/g, "")
            .substring(0, 32);

          return {
            hash: hash,
            details: basicData,
            metadata: {
              deviceName: this.getDeviceName(),
              browserName: this.getBrowserName(),
              osName: this.getOSName(),
              deviceType: this.getDeviceType(),
            },
          };
        }

        getDeviceName() {
          const userAgent = navigator.userAgent;
          if (/iPhone/i.test(userAgent)) return "iPhone";
          if (/iPad/i.test(userAgent)) return "iPad";
          if (/Android/i.test(userAgent)) return "Android Device";
          if (/Windows/i.test(userAgent)) return "Windows PC";
          if (/Mac/i.test(userAgent)) return "Mac";
          return "Unknown Device";
        }

        getBrowserName() {
          const userAgent = navigator.userAgent;
          if (/Chrome/i.test(userAgent)) return "Chrome";
          if (/Firefox/i.test(userAgent)) return "Firefox";
          if (/Safari/i.test(userAgent)) return "Safari";
          if (/Edge/i.test(userAgent)) return "Edge";
          return "Unknown Browser";
        }

        getOSName() {
          const userAgent = navigator.userAgent;
          if (/Windows/i.test(userAgent)) return "Windows";
          if (/Mac OS X/i.test(userAgent)) return "macOS";
          if (/Android/i.test(userAgent)) return "Android";
          if (/iPhone OS/i.test(userAgent)) return "iOS";
          if (/Linux/i.test(userAgent)) return "Linux";
          return "Unknown OS";
        }

        getDeviceType() {
          const userAgent = navigator.userAgent;
          if (
            /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(
              userAgent
            )
          ) {
            return "mobile";
          }
          return "desktop";
        }

        async detectBrowserUpdate(previousFingerprint) {
          return { updated: false, changes: [] };
        }
      };

      console.log(
        "✅ Fallback Device Fingerprinting Service created for emergency features"
      );
    };

    // Start loading process
    loadDeviceFingerprintingService();
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
