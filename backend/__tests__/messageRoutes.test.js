import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../server.js';
import { Message } from '../models/Message.js';

let mongoServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Message.deleteMany({});
});

describe('POST /api/messages', () => {
  it('creates exactly one database record for a new message', async () => {
    const payload = {
      messageId: 'msg-1',
      conversationId: 'convo-1',
      content: 'Hello World',
      clientCreatedAt: new Date().toISOString()
    };

    const res = await request(app).post('/api/messages').send(payload);

    expect(res.statusCode).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.message.messageId).toBe('msg-1');

    const count = await Message.countDocuments();
    expect(count).toBe(1);
  });

  it('sending the same messageId twice results in one database record (Idempotency)', async () => {
    const payload = {
      messageId: 'msg-2',
      conversationId: 'convo-1',
      content: 'Idempotent Message',
      clientCreatedAt: new Date().toISOString()
    };

    // First request
    const res1 = await request(app).post('/api/messages').send(payload);
    expect(res1.statusCode).toBe(201);
    expect(res1.body.created).toBe(true);

    // Second request
    const res2 = await request(app).post('/api/messages').send(payload);
    expect(res2.statusCode).toBe(200);
    expect(res2.body.created).toBe(false);
    expect(res2.body.duplicate).toBe(true);
    expect(res2.body.message.messageId).toBe('msg-2');

    // Verify DB count
    const count = await Message.countDocuments();
    expect(count).toBe(1);
  });

  it('different messageIds create different messages', async () => {
    const payload1 = {
      messageId: 'msg-diff-1',
      conversationId: 'convo-1',
      content: 'Hello 1',
      clientCreatedAt: new Date().toISOString()
    };
    const payload2 = {
      messageId: 'msg-diff-2',
      conversationId: 'convo-1',
      content: 'Hello 2',
      clientCreatedAt: new Date().toISOString()
    };

    await request(app).post('/api/messages').send(payload1);
    await request(app).post('/api/messages').send(payload2);

    const count = await Message.countDocuments();
    expect(count).toBe(2);
  });

  it('rejects invalid requests (missing fields)', async () => {
    const payload = {
      messageId: 'msg-3',
      // missing conversationId, content, clientCreatedAt
    };

    const res = await request(app).post('/api/messages').send(payload);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();

    const count = await Message.countDocuments();
    expect(count).toBe(0);
  });

  it('concurrent duplicate requests do not create duplicate logical messages', async () => {
    const payload = {
      messageId: 'msg-4',
      conversationId: 'convo-1',
      content: 'Concurrent Race',
      clientCreatedAt: new Date().toISOString()
    };

    // Send multiple requests simultaneously
    const reqs = Array.from({ length: 5 }).map(() => request(app).post('/api/messages').send(payload));
    const responses = await Promise.all(reqs);

    // One should be 201 (created), the rest should be 200 (duplicate)
    const createdCount = responses.filter(r => r.statusCode === 201).length;
    const dupCount = responses.filter(r => r.statusCode === 200).length;

    expect(createdCount).toBe(1);
    expect(dupCount).toBe(4);

    const dbCount = await Message.countDocuments();
    expect(dbCount).toBe(1);
  });
});
