import { http } from "./httpClient";

export const calendarApi = {
  get: ({ startDate, endDate, account } = {}) => {
    const q = new URLSearchParams();
    if (startDate) q.set("start_date", startDate);
    if (endDate) q.set("end_date", endDate);
    if (account) q.set("account", account);
    const s = q.toString();
    return http.get(`/calendar/${s ? `?${s}` : ""}`);
  },
};
