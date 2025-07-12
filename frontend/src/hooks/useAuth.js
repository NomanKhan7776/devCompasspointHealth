import { createContext, useContext } from "react";
// import {  } from "../context/AuthContext";
export const AuthContext = createContext();
// This is a separate hook file
export const useAuth = () => {
  return useContext(AuthContext);
};
