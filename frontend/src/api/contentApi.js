import { http } from "./httpClient";

function buildQuery(params) {
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const contentApi = {
  list: (params) => http.get(`/content/${buildQuery(params)}`),
  get: (id) => http.get(`/content/${id}/`),

  /**
   * payload: { instagram_account, content_type, caption, media (File),
   *            scheduled_at (ISO string), timezone, publish_now }
   */
  create: (payload) => {
    const form = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) form.append(key, value);
    });
    return http.postForm("/content/", form);
  },

  update: (id, patch) => http.patch(`/content/${id}/`, patch),
  cancel: (id) => http.post(`/content/${id}/cancel/`),
  remove: (id) => http.delete(`/content/${id}/`),
  retry: (id) => http.post(`/content/${id}/retry/`),

  scheduled: () => contentApi.list({ status: "SCHEDULED" }),
  published: () => contentApi.list({ status: "PUBLISHED" }),
  failed: () => contentApi.list({ status: "FAILED" }),
};
