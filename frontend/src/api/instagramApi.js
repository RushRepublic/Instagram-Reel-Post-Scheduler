import { http } from "./httpClient";

export const instagramApi = {
  getAccounts: () => http.get("/instagram/accounts/"),
  getAccount: (id) => http.get(`/instagram/accounts/${id}/`),

  /**
   * Kicks off the real Facebook Login for Business OAuth flow: asks the
   * backend for the signed authorization URL, then navigates the whole
   * browser there (Facebook's OAuth dialog cannot run inside an iframe/XHR).
   */
  async startConnect() {
    const { auth_url } = await http.get("/instagram/oauth/start/");
    window.location.href = auth_url;
  },
};
