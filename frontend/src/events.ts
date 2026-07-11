export const CHAT_UNREAD_EVENT = 'flowday:chat-unread';
export const OFFLINE_QUEUE_EVENT = 'flowday:offline-queue';

export function notifyChatUnreadChanged() {
  window.dispatchEvent(new CustomEvent(CHAT_UNREAD_EVENT));
}

export function notifyOfflineQueueChanged() {
  window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT));
}
