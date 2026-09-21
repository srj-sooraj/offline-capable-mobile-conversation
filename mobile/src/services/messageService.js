import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

export function createMessage(content, conversationId = 'demo-convo-1') {
  return {
    messageId: uuidv4(),
    conversationId,
    content,
    createdAt: new Date().toISOString(),
    status: 'pending',
    retryCount: 0,
  };
}
