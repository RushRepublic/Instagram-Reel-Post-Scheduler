import { http } from "./httpClient";

export const analyticsApi = {
  /**
   * Returns { account, results: [{ content_id, source, reason, metrics }] }.
   * `source` is one of META_API | CACHED | UNAVAILABLE — always render it,
   * never treat `metrics` as real without checking `source` first.
   */
  get: (account) => http.get(`/analytics/${account ? `?account=${encodeURIComponent(account)}` : ""}`),
};
