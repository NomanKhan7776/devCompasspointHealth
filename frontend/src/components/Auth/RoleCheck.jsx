import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";

// This component checks roles without applying layout
const RoleCheck = ({ allowedRoles = [], children }) => {
  const { currentUser } = useAuth();

  // If roles are specified and user doesn't have permission
  if (allowedRoles.length > 0 && !allowedRoles.includes(currentUser.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Just render children without layout
  return children;
};

export default RoleCheck;
