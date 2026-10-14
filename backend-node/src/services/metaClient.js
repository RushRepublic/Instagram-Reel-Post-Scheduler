// Thin wrapper around the Meta Graph API (port of meta_client.py).
const env = require("../config/env");

class MetaAPIError extends Error {
  constructor(message, statusCode = null, payload = {}) {
    super(message);
    this.name = "MetaAPIError";
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

class MetaClient {
  constructor(accessToken = null) {
    this.accessToken = accessToken;
    this.baseUrl = `https://graph.facebook.com/${env.meta.apiVersion}`;
  }

  async request(method, path, { params = {}, data = null } = {}) {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\/+/, "")}`);
    const all = { ...params };
    if (this.accessToken && !("access_token" in all)) all.access_token = this.accessToken;
    for (const [k, v] of Object.entries(all)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));

    const init = { method, signal: AbortSignal.timeout(30000) };
    if (data) {
      init.body = new URLSearchParams(data);
      init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    }
    const res = await fetch(url, init);
    const payload = await readJson(res);
    if (res.status >= 400) {
      throw new MetaAPIError(payload?.error?.message || "Unknown Meta API error", res.status, payload);
    }
    return payload;
  }

  get(path, params) {
    return this.request("GET", path, { params });
  }

  post(path, { data, params } = {}) {
    return this.request("POST", path, { params, data });
  }

  /** Follows paging.next until exhausted (hard cap of maxPages). */
  async getAllPages(path, params = {}, maxPages = 20) {
    const all = [];
    let nextUrl = null;
    const current = { limit: 100, ...params };
    for (let i = 0; i < maxPages; i++) {
      const response = nextUrl
        ? await (await fetch(nextUrl, { signal: AbortSignal.timeout(30000) })).json()
        : await this.request("GET", path, { params: current });
      if (response.error) throw new MetaAPIError(response.error.message || "Unknown Meta API error", null, response);
      all.push(...(response.data || []));
      nextUrl = response.paging?.next;
      if (!nextUrl) break;
    }
    return all;
  }

  exchangeCodeForToken(code, redirectUri) {
    return this.request("GET", "oauth/access_token", {
      params: { client_id: env.meta.appId, client_secret: env.meta.appSecret, redirect_uri: redirectUri, code },
    });
  }

  exchangeForLongLivedToken(shortLivedToken) {
    return this.request("GET", "oauth/access_token", {
      params: {
        grant_type: "fb_exchange_token",
        client_id: env.meta.appId,
        client_secret: env.meta.appSecret,
        fb_exchange_token: shortLivedToken,
      },
    });
  }

  getUserPages(userAccessToken) {
    return new MetaClient(userAccessToken).getAllPages("me/accounts", { fields: "id,name,access_token" });
  }

  getLinkedInstagramAccount(pageId, pageAccessToken) {
    return new MetaClient(pageAccessToken).get(pageId, {
      fields: "instagram_business_account{id,username,name,profile_picture_url}",
    });
  }
}

module.exports = { MetaClient, MetaAPIError };
