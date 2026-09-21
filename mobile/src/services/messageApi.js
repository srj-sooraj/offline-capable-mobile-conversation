import { API_BASE_URL } from '../config';

export let simulationMode = 'NORMAL'; // 'NORMAL' | 'SLOW' | 'TEMPORARY_FAILURE' | 'LOST_ACK'

export function setSimulationMode(mode) {
  simulationMode = mode;
}

export async function sendMessage(message) {
  try {
    if (simulationMode === 'SLOW') {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    if (simulationMode === 'TEMPORARY_FAILURE') {
      throw new Error('Simulated temporary network failure');
    }

    const response = await fetch(`${API_BASE_URL}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messageId: message.messageId,
        conversationId: message.conversationId,
        content: message.content,
        clientCreatedAt: message.createdAt
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (simulationMode === 'LOST_ACK' && data.created) {
      // The request reached the backend, but we simulate losing the acknowledgement
      throw new Error('Simulated lost acknowledgement');
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
