import { createContext, useContext } from "react";

export const AssignmentsContext = createContext();

export const useAssignments = () => useContext(AssignmentsContext);
