import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  conversationId: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  clientCreatedAt: {
    type: String,
    required: true,
  }
}, { timestamps: true });

export const Message = mongoose.model('Message', messageSchema);
