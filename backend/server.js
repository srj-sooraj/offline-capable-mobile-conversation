import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import messageRoutes from './routes/messageRoutes.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/offline_conversation';

app.use(cors());
app.use(express.json());

app.use('/api/messages', messageRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export async function connectDB() {
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(mongoUri);
      console.log('Connected to MongoDB');
    }
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
}

// Start the server if this file is not imported by tests
if (process.env.NODE_ENV !== 'test') {
  connectDB().then(() => {
    app.listen(port, () => {
      console.log(`Backend server listening at http://localhost:${port}`);
    });
  });
}

export default app;
