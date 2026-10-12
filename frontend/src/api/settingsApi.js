import { http } from "./httpClient";

export const settingsApi = {
  get: () => http.get("/auth/me/"),
  update: (patch) => http.patch("/auth/me/", patch),
};
