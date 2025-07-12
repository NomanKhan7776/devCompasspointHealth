import { createContext, useContext } from "react";

export const AdminContext = createContext();

export const useAdmin = () => useContext(AdminContext);
