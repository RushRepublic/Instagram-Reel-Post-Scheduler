import { zonedParts } from "./format";

/**
 * Adapts the backend ScheduledContentSerializer shape (nested
 * instagram_account/media, ISO scheduled_at) to the flat shape
 * ContentRow/Calendar were built against.
 */
export function adaptContent(item) {
  const when = zonedParts(item.scheduled_at, item.timezone);
  return {
    ...item,
    type: item.content_type,
    account: `@${item.instagram_account.username}`,
    mediaKind: item.media?.kind === "VIDEO" ? "video" : "image",
    mediaDataUrl: item.media?.url || null,
    scheduledDate: when.date,
    scheduledTime: when.time,
    publishedDate: item.published_at ? item.published_at.slice(0, 10) : null,
    failReason: item.failure_reason,
  };
}
