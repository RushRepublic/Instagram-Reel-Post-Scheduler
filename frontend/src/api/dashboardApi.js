import { http } from "./httpClient";

export const dashboardApi = {
  get: () => http.get("/dashboard/"),
};
