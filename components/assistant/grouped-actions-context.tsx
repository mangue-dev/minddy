"use client";

import { createContext, useContext } from "react";

const GroupedActionsContext = createContext(false);

export const GroupedActionsProvider = GroupedActionsContext.Provider;
export const useGroupedActions = () => useContext(GroupedActionsContext);
