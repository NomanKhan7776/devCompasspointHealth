import { createContext, useContext } from "react";

export const DashboardContext = createContext();

export const useDashboard = () => useContext(DashboardContext);
