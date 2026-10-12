/* ==========================================================================
   RUSH REPUBLIC — HTTP CLIENT
   Thin fetch wrapper: attaches the JWT access token, retries once after a
   silent refresh on 401, and normalizes error handling for the api* layer.
   ========================================================================== */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

const TOKEN_KEYS = { ACCESS: "rr_access_token", REFRESH: "rr_refresh_token" };

export const tokenStore = {
  getAccess: () => localStorage.getItem(TOKEN_KEYS.ACCESS),
  getRefresh: () => localStorage.getItem(TOKEN_KEYS.REFRESH),
  set: (access, refresh) => {
    localStorage.setItem(TOKEN_KEYS.ACCESS, access);
    if (refresh) localStorage.setItem(TOKEN_KEYS.REFRESH, refresh);
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEYS.ACCESS);
    localStorage.removeItem(TOKEN_KEYS.REFRESH);
  },
};

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

function extractErrorMessage(payload) {
  if (!payload) return "Request failed.";
  if (typeof payload.detail === "string") return payload.detail;
  const firstKey = Object.keys(payload)[0];
  if (firstKey) {
    const val = payload[firstKey];
    const msg = Array.isArray(val) ? val[0] : val;
    return typeof msg === "string" ? msg : "Request failed.";
  }
  return "Request failed.";
}

async function refreshAccessToken() {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return false;

  const res = await fetch(`${API_BASE_URL}/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) return false;

  const data = await res.json();
  tokenStore.set(data.access, refresh);
  return true;
}

/**
 * @param {string} path e.g. "/dashboard/"
 * @param {object} options { method, body, isFormData, skipAuth }
 */
export async function request(path, options = {}) {
  const { method = "GET", body, isFormData = false, skipAuth = false, _retried = false } = options;

  const headers = {};
  if (!isFormData) headers["Content-Type"] = "application/json";
  const access = tokenStore.getAccess();
  if (!skipAuth && access) headers["Authorization"] = `Bearer ${access}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !skipAuth && !_retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request(path, { ...options, _retried: true });
    }
    tokenStore.clear();
    throw new ApiError("Session expired. Please log in again.", 401, null);
  }

  if (res.status === 204 || res.status === 205) return null;

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // no JSON body (e.g. some error pages) — leave payload null
  }

  if (!res.ok) {
    throw new ApiError(extractErrorMessage(payload), res.status, payload);
  }

  return payload;
}

export const http = {
  get: (path) => request(path, { method: "GET" }),
  post: (path, body) => request(path, { method: "POST", body }),
  patch: (path, body) => request(path, { method: "PATCH", body }),
  postForm: (path, formData) => request(path, { method: "POST", body: formData, isFormData: true }),
  patchForm: (path, formData) => request(path, { method: "PATCH", body: formData, isFormData: true }),
};
