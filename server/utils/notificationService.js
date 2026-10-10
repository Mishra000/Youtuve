/**
 * notificationService.js — Comment Notification Integration Point
 * ─────────────────────────────────────────────────────────────
 * Safely dispatches notifications for @mentions, replies, etc.
 * Never throws or interrupts comment posting flow.
 */

export async function sendMentionNotification({ mentionedUserIds, commenterName, videoId, commentId, commentText }) {
  if (!mentionedUserIds || !mentionedUserIds.length) return;

  try {
    for (const userId of mentionedUserIds) {
      // Integration point: log or send via WebSocket / database if available
      console.log(`[Notification] User ${userId} was mentioned by ${commenterName} on video ${videoId} (comment: ${commentId})`);
    }
  } catch (error) {
    console.warn("Failed to dispatch mention notification:", error.message);
  }
}

export async function sendReplyNotification({ parentCommentOwnerId, replierName, videoId, commentId }) {
  if (!parentCommentOwnerId) return;

  try {
    console.log(`[Notification] User ${parentCommentOwnerId} received a reply from ${replierName} on video ${videoId} (comment: ${commentId})`);
  } catch (error) {
    console.warn("Failed to dispatch reply notification:", error.message);
  }
}
