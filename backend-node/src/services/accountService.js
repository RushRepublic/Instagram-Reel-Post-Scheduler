// Facebook Login for Business OAuth orchestration (port of account_service.py).
const { query } = require("../config/db");
const { MetaClient, MetaAPIError } = require("./metaClient");
const fernet = require("../lib/fernet");
const { toDb, nowDb } = require("../lib/dates");

class AccountConnectionError extends Error {}

async function connectInstagramAccountsForUser(userId, code, redirectUri) {
  const client = new MetaClient();
  let pages;
  let expiresIn;
  try {
    const short = await client.exchangeCodeForToken(code, redirectUri);
    const long = await client.exchangeForLongLivedToken(short.access_token);
    expiresIn = long.expires_in;
    pages = await client.getUserPages(long.access_token);
  } catch (err) {
    if (err instanceof MetaAPIError) throw new AccountConnectionError(err.message);
    throw err;
  }

  const expiresAt = expiresIn ? toDb(new Date(Date.now() + Number(expiresIn) * 1000)) : null;
  const connected = [];
  const skipped = [];
  console.log(`Connect flow: found ${pages.length} Facebook Page(s) for user_id=${userId}`);

  for (const page of pages) {
    const pageName = page.name || "(unnamed)";
    let igResponse;
    try {
      igResponse = await client.getLinkedInstagramAccount(page.id, page.access_token);
    } catch (err) {
      if (!(err instanceof MetaAPIError)) throw err;
      const reason = `Graph API error looking up linked Instagram account: ${err.message}`;
      console.warn(`Skipped Page '${pageName}' (${page.id}): ${reason}`);
      skipped.push({ page_name: pageName, page_id: page.id, reason });
      continue;
    }
    const ig = igResponse.instagram_business_account;
    if (!ig) {
      const reason = "No Instagram Professional (Business/Creator) account linked to this Page.";
      skipped.push({ page_name: pageName, page_id: page.id, reason });
      continue;
    }

    // update_or_create keyed on instagram_user_id (unique)
    const now = nowDb();
    const fields = {
      user_id: userId,
      username: ig.username || "",
      display_name: ig.name || "",
      facebook_page_id: page.id,
      profile_picture_url: ig.profile_picture_url || "",
      access_token: fernet.encrypt(page.access_token),
      token_expires_at: expiresAt,
      is_active: 1,
      updated_at: now,
    };
    const existing = await query("SELECT id FROM instagram_accounts_instagramaccount WHERE instagram_user_id = ?", [ig.id]);
    if (existing.length) {
      await query("UPDATE instagram_accounts_instagramaccount SET ? WHERE id = ?", [fields, existing[0].id]);
      connected.push(existing[0].id);
    } else {
      const r = await query("INSERT INTO instagram_accounts_instagramaccount SET ?", [
        { ...fields, instagram_user_id: ig.id, account_type: "BUSINESS", connected_at: now, created_at: now },
      ]);
      connected.push(r.insertId);
    }
  }
  console.log(`Connect flow complete for user_id=${userId}: ${connected.length} connected, ${skipped.length} skipped`);
  return { connected, skipped };
}

module.exports = { connectInstagramAccountsForUser, AccountConnectionError };
