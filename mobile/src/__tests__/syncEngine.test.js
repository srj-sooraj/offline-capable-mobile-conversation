import { syncMessages, setNetworkStatus, _resetForTest, manualRetry, MAX_AUTO_RETRIES } from '../sync/syncEngine';
import { loadOutbox, updateMessage } from '../storage/outboxStorage';
import { sendMessage } from '../services/messageApi';

jest.mock('../storage/outboxStorage', () => ({
  loadOutbox: jest.fn(),
  updateMessage: jest.fn()
}));

jest.mock('../services/messageApi', () => ({
  sendMessage: jest.fn()
}));

describe('Sync Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetForTest();
    loadOutbox.mockResolvedValue([]);
  });

  it('pending messages synchronize in FIFO order', async () => {
    loadOutbox.mockResolvedValue([
      { messageId: 'msg-2', status: 'pending', createdAt: '2026-09-21T10:00:02Z' },
      { messageId: 'msg-1', status: 'pending', createdAt: '2026-09-21T10:00:01Z' }
    ]);
    sendMessage.mockResolvedValue({ success: true, data: { created: true } });

    await syncMessages();

    expect(sendMessage.mock.calls[0][0].messageId).toBe('msg-1');
    expect(sendMessage.mock.calls[1][0].messageId).toBe('msg-2');
  });

  it('successful synchronization marks messages delivered', async () => {
    loadOutbox.mockResolvedValue([
      { messageId: 'msg-1', status: 'pending', createdAt: '2026-09-21T10:00:01Z' }
    ]);
    sendMessage.mockResolvedValue({ success: true, data: { created: true } });

    await syncMessages();

    expect(updateMessage).toHaveBeenCalledWith('msg-1', { status: 'sending' });
    expect(updateMessage).toHaveBeenCalledWith('msg-1', { status: 'delivered' });
  });

  it('offline mode prevents synchronization', async () => {
    setNetworkStatus(false);
    loadOutbox.mockResolvedValue([
      { messageId: 'msg-1', status: 'pending', createdAt: '2026-09-21T10:00:01Z' }
    ]);

    await syncMessages();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(updateMessage).not.toHaveBeenCalled();
  });

  it('duplicate/idempotent backend response is treated as delivered (Lost ACK recovery)', async () => {
    loadOutbox.mockResolvedValue([
      { messageId: 'msg-1', status: 'pending', createdAt: '2026-09-21T10:00:01Z' }
    ]);
    sendMessage.mockResolvedValue({ success: true, data: { duplicate: true, created: false } });

    await syncMessages();

    expect(updateMessage).toHaveBeenCalledWith('msg-1', { status: 'delivered' });
  });

  it('concurrent sync calls do not create overlapping synchronization runs', async () => {
    loadOutbox.mockResolvedValue([
      { messageId: 'msg-1', status: 'pending', createdAt: '2026-09-21T10:00:01Z' }
    ]);
    
    sendMessage.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ success: true, data: { created: true } }), 100)));

    const p1 = syncMessages();
    const p2 = syncMessages();

    await Promise.all([p1, p2]);

    expect(loadOutbox).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('temporary failure causes retryable failure', async () => {
    loadOutbox.mockResolvedValue([
      { messageId: 'msg-1', status: 'pending', createdAt: '2026-09-21T10:00:01Z', retryCount: 0 }
    ]);
    sendMessage.mockResolvedValueOnce({ success: false, error: 'Network Error' });

    await syncMessages();

    expect(updateMessage).toHaveBeenCalledWith('msg-1', { status: 'failed', retryCount: 1 });
  });

  it('automatic retry succeeds', async () => {
    let callCount = 0;
    // We mock loadOutbox to return the message. 
    // syncEngine modifies status through updateMessage, but our loadOutbox mock is static.
    // However, syncEngine loops and calls loadOutbox again if it backs off.
    loadOutbox.mockImplementation(() => {
      if (callCount === 0) {
        callCount++;
        return Promise.resolve([{ messageId: 'msg-1', status: 'pending', createdAt: '2026-09-21T10:00:01Z', retryCount: 0 }]);
      } else {
        return Promise.resolve([{ messageId: 'msg-1', status: 'failed', createdAt: '2026-09-21T10:00:01Z', retryCount: 1 }]);
      }
    });

    sendMessage
      .mockResolvedValueOnce({ success: false, error: 'Network Error' })
      .mockResolvedValueOnce({ success: true, data: { created: true } });

    await syncMessages();

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(updateMessage).toHaveBeenCalledWith('msg-1', { status: 'delivered' });
  });

  it('automatic retry is bounded and does not loop infinitely', async () => {
    let currentRetryCount = MAX_AUTO_RETRIES - 1;
    
    // Dynamically return the mock message so the loop can read the incremented count
    loadOutbox.mockImplementation(() => {
      return Promise.resolve([{ 
        messageId: 'msg-1', 
        status: 'failed', 
        createdAt: '2026-09-21T10:00:01Z', 
        retryCount: currentRetryCount
      }]);
    });
    
    // Catch updateMessage to update the mocked retryCount
    updateMessage.mockImplementation((id, updates) => {
      if (updates.retryCount !== undefined) {
        currentRetryCount = updates.retryCount;
      }
      return Promise.resolve();
    });

    sendMessage.mockResolvedValue({ success: false, error: 'Permanent Network Error' });

    await syncMessages();

    expect(updateMessage).toHaveBeenCalledWith('msg-1', { status: 'failed', retryCount: MAX_AUTO_RETRIES });
    expect(sendMessage).toHaveBeenCalledTimes(1); 
  });

  it('manual retry succeeds', async () => {
    let mockMessage = { 
      messageId: 'msg-1', 
      status: 'failed', 
      createdAt: '2026-09-21T10:00:01Z', 
      retryCount: MAX_AUTO_RETRIES 
    };

    loadOutbox.mockImplementation(() => Promise.resolve([mockMessage]));
    
    updateMessage.mockImplementation((id, updates) => {
      mockMessage = { ...mockMessage, ...updates };
      return Promise.resolve();
    });

    sendMessage.mockResolvedValue({ success: true, data: { created: true } });

    await manualRetry('msg-1');

    expect(updateMessage).toHaveBeenCalledWith('msg-1', { status: 'pending', retryCount: 0 });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('retry never creates a new messageId', async () => {
    loadOutbox.mockReturnValue(Promise.resolve([{ 
      messageId: 'stable-id-123', 
      status: 'pending', 
      createdAt: '2026-09-21T10:00:01Z', 
      retryCount: 0 
    }]));
    
    // Fail first
    sendMessage.mockResolvedValueOnce({ success: false, error: 'Network Error' });
    await syncMessages();

    expect(sendMessage.mock.calls[0][0].messageId).toBe('stable-id-123');

    // Manual Retry
    sendMessage.mockResolvedValueOnce({ success: true, data: { created: true } });
    await manualRetry('stable-id-123');

    // Verify same ID used in subsequent attempt
    expect(sendMessage.mock.calls[1][0].messageId).toBe('stable-id-123');
  });

  it('retry count survives persistence', async () => {
    // This is tested by the fact that we call updateMessage with retryCount
    loadOutbox.mockResolvedValue([
      { messageId: 'msg-1', status: 'pending', createdAt: '2026-09-21T10:00:01Z', retryCount: 0 }
    ]);
    sendMessage.mockResolvedValueOnce({ success: false, error: 'Network Error' });

    await syncMessages();

    // Verify we passed it to the persistence layer
    expect(updateMessage).toHaveBeenCalledWith('msg-1', { status: 'failed', retryCount: 1 });
  });
});
