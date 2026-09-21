import AsyncStorage from '@react-native-async-storage/async-storage';

const OUTBOX_KEY = 'offline_conversation_outbox';

const listeners = new Set();

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

export async function loadOutbox() {
  try {
    const data = await AsyncStorage.getItem(OUTBOX_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error loading outbox:', error);
    return [];
  }
}

export async function saveOutbox(messages) {
  try {
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(messages));
    notifyListeners();
  } catch (error) {
    console.error('Error saving outbox:', error);
  }
}

export async function addMessage(message) {
  const messages = await loadOutbox();
  messages.push(message);
  await saveOutbox(messages);
}

export async function updateMessage(messageId, updates) {
  const messages = await loadOutbox();
  const index = messages.findIndex((m) => m.messageId === messageId);
  if (index !== -1) {
    messages[index] = { ...messages[index], ...updates };
    await saveOutbox(messages);
  }
}

export async function removeMessage(messageId) {
  const messages = await loadOutbox();
  const filtered = messages.filter((m) => m.messageId !== messageId);
  await saveOutbox(filtered);
}

export async function clearOutbox() {
  try {
    await AsyncStorage.removeItem(OUTBOX_KEY);
    notifyListeners();
  } catch (error) {
    console.error('Error clearing outbox:', error);
  }
}
