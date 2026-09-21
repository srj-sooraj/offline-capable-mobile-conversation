import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadOutbox,
  addMessage,
  updateMessage,
  removeMessage,
} from '../storage/outboxStorage';
import { createMessage } from '../services/messageService';

// Mock react-native-get-random-values to avoid react-native babel issues
jest.mock('react-native-get-random-values', () => {});

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

describe('Durable Outbox Storage', () => {
  let mockStorage = {};

  beforeEach(() => {
    mockStorage = {};
    
    // Setup mock implementation
    AsyncStorage.setItem.mockImplementation((key, value) => {
      mockStorage[key] = value;
      return Promise.resolve(null);
    });
    
    AsyncStorage.getItem.mockImplementation((key) => {
      return Promise.resolve(mockStorage[key] || null);
    });

    AsyncStorage.removeItem.mockImplementation((key) => {
      delete mockStorage[key];
      return Promise.resolve(null);
    });
    
    jest.clearAllMocks();
  });

  it('adds a message and loads it', async () => {
    const msg = createMessage('Hello World');
    await addMessage(msg);
    
    const loaded = await loadOutbox();
    expect(loaded.length).toBe(1);
    expect(loaded[0].messageId).toBe(msg.messageId);
    expect(loaded[0].content).toBe('Hello World');
  });

  it('multiple messages retain their stored order', async () => {
    const msg1 = createMessage('First');
    const msg2 = createMessage('Second');
    const msg3 = createMessage('Third');
    
    await addMessage(msg1);
    await addMessage(msg2);
    await addMessage(msg3);
    
    const loaded = await loadOutbox();
    expect(loaded.length).toBe(3);
    expect(loaded[0].messageId).toBe(msg1.messageId);
    expect(loaded[1].messageId).toBe(msg2.messageId);
    expect(loaded[2].messageId).toBe(msg3.messageId);
  });

  it('updating a message changes the correct message', async () => {
    const msg1 = createMessage('First');
    const msg2 = createMessage('Second');
    
    await addMessage(msg1);
    await addMessage(msg2);
    
    await updateMessage(msg2.messageId, { status: 'delivered' });
    
    const loaded = await loadOutbox();
    const updatedMsg = loaded.find(m => m.messageId === msg2.messageId);
    expect(updatedMsg.status).toBe('delivered');
    
    const unchangedMsg = loaded.find(m => m.messageId === msg1.messageId);
    expect(unchangedMsg.status).toBe('pending');
  });

  it('removing a message removes only that message', async () => {
    const msg1 = createMessage('First');
    const msg2 = createMessage('Second');
    
    await addMessage(msg1);
    await addMessage(msg2);
    
    await removeMessage(msg1.messageId);
    
    const loaded = await loadOutbox();
    expect(loaded.length).toBe(1);
    expect(loaded[0].messageId).toBe(msg2.messageId);
  });

  it('stored pending messages can be restored after simulated application restart', async () => {
    // Simulate initial run
    const msg = createMessage('Pending Message');
    await addMessage(msg);
    
    // Simulate application restart by relying on the persisted mockStorage 
    // rather than React state.
    const loadedAfterRestart = await loadOutbox();
    
    expect(loadedAfterRestart.length).toBe(1);
    expect(loadedAfterRestart[0].messageId).toBe(msg.messageId);
    expect(loadedAfterRestart[0].status).toBe('pending');
  });
});
