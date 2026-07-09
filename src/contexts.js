import { createContext, useContext } from 'react';

// Session: auth, family identity — changes only on login/logout/family load
export const SessionCtx = createContext(null);
export const useSession = () => useContext(SessionCtx);

// Data: entries + kids — changes when user adds/edits content
export const DataCtx = createContext(null);
export const useData = () => useContext(DataCtx);

// Notif: all notification/badge state — changes on realtime events
export const NotifCtx = createContext(null);
export const useNotif = () => useContext(NotifCtx);
