import { http, request, tokenStore } from "./httpClient";

export const authApi = {
  async login(email, password) {
    const data = await request("/auth/login/", {
      method: "POST",
      body: { email, password },
      skipAuth: true,
    });
    tokenStore.set(data.access, data.refresh);
    return data.user;
  },

  async logout() {
    const refresh = tokenStore.getRefresh();
    try {
      if (refresh) await http.post("/auth/logout/", { refresh });
    } finally {
      tokenStore.clear();
    }
  },

  me: () => http.get("/auth/me/"),

  updateSettings: (patch) => http.patch("/auth/me/", patch),

  isAuthenticated: () => Boolean(tokenStore.getAccess()),
};
