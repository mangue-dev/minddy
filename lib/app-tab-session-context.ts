"use client";

import { createContext, useContext } from "react";
import type { AppTabsSession } from "./app-tabs-session";

/** Shared session access without importing the app's tab surfaces. */
export const SessionContext = createContext<AppTabsSession | null>(null);
export const useOptionalAppTabSession = () => useContext(SessionContext);
