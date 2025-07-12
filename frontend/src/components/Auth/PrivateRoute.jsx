import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import Layout from "../Layout/Layout";

const PrivateRoute = ({ allowedRoles = [] }) => {
  const { currentUser, loading } = useAuth();

  // If still loading, show nothing
  if (loading) {
    return null;
  }

  // If not logged in, redirect to login
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // If roles are specified and user doesn't have permission
  if (allowedRoles.length > 0 && !allowedRoles.includes(currentUser.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // If all checks pass, render the child routes wrapped in layout
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
};

export default PrivateRoute;
