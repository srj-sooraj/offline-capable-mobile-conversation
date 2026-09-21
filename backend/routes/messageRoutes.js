import express from 'express';
import { Message } from '../models/Message.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const { messageId, conversationId, content, clientCreatedAt } = req.body;

  if (!messageId || !conversationId || !content || !clientCreatedAt) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const newMessage = new Message({
      messageId,
      conversationId,
      content,
      clientCreatedAt,
    });
    
    await newMessage.save();
    
    return res.status(201).json({
      message: newMessage,
      created: true
    });
  } catch (error) {
    // 11000 is MongoDB's duplicate key error code
    if (error.code === 11000 && error.keyPattern && error.keyPattern.messageId) {
      // Find the existing message and return it
      const existingMessage = await Message.findOne({ messageId });
      if (existingMessage) {
        return res.status(200).json({
          message: existingMessage,
          created: false,
          duplicate: true
        });
      }
    }
    
    console.error('Error saving message:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
