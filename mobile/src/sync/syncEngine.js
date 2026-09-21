import { loadOutbox, updateMessage } from '../storage/outboxStorage';
import { sendMessage } from '../services/messageApi';

let isSyncing = false;
let isOnline = true; // Simulated network state
export let MAX_AUTO_RETRIES = 3;
export let RETRY_DELAY_MS = 2000;

export function _resetForTest() {
  isSyncing = false;
  isOnline = true;
  RETRY_DELAY_MS = 0; // zero delay for fast testing
}

export function setNetworkStatus(status) {
  const wasOffline = !isOnline;
  isOnline = status;
  if (status && wasOffline) {
    // Attempt sync immediately when coming online
    syncMessages();
  }
}

export function getNetworkStatus() {
  return isOnline;
}

function delay(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function manualRetry(messageId) {
  await updateMessage(messageId, { status: 'pending', retryCount: 0 });
  if (isOnline) {
    return syncMessages();
  }
}

export async function syncMessages() {
  if (!isOnline) return;

  // Concurrency guard
  if (isSyncing) return;

  isSyncing = true;

  try {
    let hasMoreWork = true;
    while (hasMoreWork) {
      hasMoreWork = false;
      const messages = await loadOutbox();
      
      // Strict FIFO ordering policy based on client creation time
      messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      // Process messages that are pending or still eligible for automatic retry
      const pendingMessages = messages.filter(m => 
        m.status === 'pending' || 
        (m.status === 'failed' && (m.retryCount || 0) < MAX_AUTO_RETRIES)
      );

      for (const msg of pendingMessages) {
        if (!isOnline) {
          return;
        }

        // State transition: pending/failed -> sending
        await updateMessage(msg.messageId, { status: 'sending' });

        const result = await sendMessage(msg);

        if (result.success && (result.data.created || result.data.duplicate)) {
          // State transition: sending -> delivered
          await updateMessage(msg.messageId, { status: 'delivered' });
        } else {
          // State transition: sending -> failed (Temporary failure)
          const newRetryCount = (msg.retryCount || 0) + 1;
          await updateMessage(msg.messageId, { 
            status: 'failed',
            retryCount: newRetryCount 
          });
          
          if (newRetryCount <= MAX_AUTO_RETRIES && isOnline) {
             // Backoff and retry
             await delay(RETRY_DELAY_MS * newRetryCount);
             hasMoreWork = true; // Loop will restart and pick up the message again
          }
          
          // Strict FIFO trade-off: if an earlier message fails, later messages are blocked.
          break; 
        }
      }
    }
  } catch (error) {
    console.error('Sync error:', error);
  } finally {
    isSyncing = false;
  }
}
