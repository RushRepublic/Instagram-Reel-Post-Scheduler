const { MetaClient, MetaAPIError } = require("./metaClient");

class InsightsError extends Error {}

const IMAGE_METRICS = ["reach", "impressions", "likes", "comments", "saved", "shares"];
const VIDEO_METRICS = [...IMAGE_METRICS, "plays"];

/** Real Graph API insight values for one published media item. */
async function getMediaInsights(igMediaId, accessToken, isVideo = false) {
  const client = new MetaClient(accessToken);
  let result;
  try {
    result = await client.get(`${igMediaId}/insights`, { metric: (isVideo ? VIDEO_METRICS : IMAGE_METRICS).join(",") });
  } catch (err) {
    if (err instanceof MetaAPIError) throw new InsightsError(err.message);
    throw err;
  }
  const values = {};
  for (const entry of result.data || []) {
    if (entry.name && entry.values?.length) values[entry.name] = entry.values[0].value;
  }
  return values;
}

module.exports = { getMediaInsights, InsightsError };
