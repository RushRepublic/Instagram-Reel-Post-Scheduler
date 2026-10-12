import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { instagramApi } from "../api/instagramApi";
import { contentApi } from "../api/contentApi";
import { settingsApi } from "../api/settingsApi";
import { ApiError } from "../api/httpClient";

const AppDataContext = createContext(null);

const ACTIVE_ACCOUNT_KEY = "rr_activeAccount"; // UI preference only, not backend state

export function AppDataProvider({ children }) {
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState(null);

  const [settings, setSettings] = useState(null);

  const [activeAccount, setActiveAccountState] = useState(
    () => localStorage.getItem(ACTIVE_ACCOUNT_KEY) || ""
  );

  const refreshAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const data = await instagramApi.getAccounts();
      setAccounts(data);
      setActiveAccountState((prev) => {
        if (prev && data.some((a) => a.username === prev.replace("@", ""))) return prev;
        return data[0] ? `@${data[0].username}` : "";
      });
    } catch (err) {
      setAccountsError(err instanceof ApiError ? err.message : "Failed to load Instagram accounts.");
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const { user, settings: s } = await settingsApi.get();
      setSettings({ name: user.first_name, email: user.email, ...s });
    } catch {
      // Settings page surfaces its own error state on direct load failure.
    }
  }, []);

  useEffect(() => {
    refreshAccounts();
    refreshSettings();
  }, [refreshAccounts, refreshSettings]);

  const setActiveAccount = useCallback((handle) => {
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, handle);
    setActiveAccountState(handle);
  }, []);

  const connectAccount = useCallback(() => {
    // Real Facebook Login for Business OAuth — navigates the whole browser
    // away and back via the backend's signed-state callback.
    return instagramApi.startConnect();
  }, []);

  const createPost = useCallback((payload) => contentApi.create({ ...payload, content_type: "POST" }), []);
  const createReel = useCallback((payload) => contentApi.create({ ...payload, content_type: "REEL" }), []);
  const cancelScheduled = useCallback((id) => contentApi.cancel(id), []);
  const retryFailed = useCallback((id) => contentApi.retry(id), []);

  const updateSettings = useCallback(async (patch) => {
    const { user, settings: s } = await settingsApi.update(patch);
    const merged = { name: user.first_name, email: user.email, ...s };
    setSettings(merged);
    return merged;
  }, []);

  const value = {
    accounts, accountsLoading, accountsError, refreshAccounts,
    activeAccount, setActiveAccount,
    settings, refreshSettings, updateSettings,
    connectAccount,
    createPost, createReel, cancelScheduled, retryFailed,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  return useContext(AppDataContext);
}
