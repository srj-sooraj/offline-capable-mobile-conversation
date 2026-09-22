import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, FlatList, SafeAreaView, TouchableOpacity, Platform, KeyboardAvoidingView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadOutbox, addMessage, subscribe } from './src/storage/outboxStorage';
import { createMessage } from './src/services/messageService';
import { setNetworkStatus, getNetworkStatus, syncMessages, manualRetry, MAX_AUTO_RETRIES } from './src/sync/syncEngine';
import { setSimulationMode, simulationMode } from './src/services/messageApi';

const NETWORK_MODE_KEY = 'offline_conversation_network_mode';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [simMode, setSimMode] = useState(simulationMode);
  const flatListRef = useRef(null);

  const loadMessages = async () => {
    const stored = await loadOutbox();
    stored.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    setMessages(stored);
  };

  useEffect(() => {
    const initializeApp = async () => {
      // 1. Load messages
      await loadMessages();
      
      // 2. Load simulated network state
      const savedMode = await AsyncStorage.getItem(NETWORK_MODE_KEY);
      const initialOnline = savedMode !== 'offline'; // Default to online if null
      
      setIsOnline(initialOnline);
      setNetworkStatus(initialOnline);
      
      // 3. Mark ready BEFORE triggering sync so UI renders correctly
      setIsReady(true);
      
      // 4. Trigger sync only if we restored an ONLINE state
      if (initialOnline) {
        syncMessages();
      }
    };
    
    initializeApp();
    
    const unsubscribe = subscribe(() => {
      loadMessages();
    });
    return unsubscribe;
  }, []);

  const handleSend = async () => {
    if (!inputText.trim()) return;
    
    const newMessage = createMessage(inputText.trim());
    await addMessage(newMessage); // Saved as pending
    setInputText('');

    if (isOnline) {
      syncMessages();
    }
  };

  const toggleNetwork = async () => {
    const newStatus = !isOnline;
    setIsOnline(newStatus);
    setNetworkStatus(newStatus);
    await AsyncStorage.setItem(NETWORK_MODE_KEY, newStatus ? 'online' : 'offline');
  };

  const toggleSimMode = () => {
    const modes = ['NORMAL', 'SLOW', 'TEMPORARY_FAILURE', 'LOST_ACK'];
    const nextMode = modes[(modes.indexOf(simMode) + 1) % modes.length];
    setSimMode(nextMode);
    setSimulationMode(nextMode);
  };

  const getStatusDisplay = (item) => {
    switch (item.status) {
      case 'delivered': return '✓ Delivered';
      case 'pending': return '◷ Pending';
      case 'sending': return '↻ Sending';
      case 'failed': return '! Failed';
      default: return item.status;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'delivered': return '#34C759';
      case 'pending': return '#FF9500';
      case 'sending': return '#FFCC00';
      case 'failed': return '#FF3B30';
      default: return '#8E8E93';
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.messageRow}>
      <View style={styles.messageBubble}>
        <Text style={styles.messageContent}>{item.content}</Text>
        <View style={styles.messageMeta}>
          <Text style={[styles.messageStatus, { color: getStatusColor(item.status) }]}>
            {getStatusDisplay(item)}
            {item.retryCount > 0 ? ` (Retries: ${item.retryCount})` : ''}
          </Text>
          {item.status === 'failed' && item.retryCount >= MAX_AUTO_RETRIES && (
            <TouchableOpacity style={styles.retryBtn} onPress={() => manualRetry(item.messageId)}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  if (!isReady) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#8E8E93' }}>Initializing...</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.phoneFrame}>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>C</Text>
            </View>
            <View>
              <Text style={styles.headerTitle}>Conversation</Text>
              <Text style={styles.headerSubtitle}>Offline-capable chat</Text>
            </View>
          </View>
          <View style={[styles.statusDot, { backgroundColor: isOnline ? '#34C759' : '#FF3B30' }]} />
        </View>

        {/* Simulation / Control Area */}
        <View style={styles.simCard}>
          <View style={styles.simRow}>
            <Text style={styles.simLabel}>Network:</Text>
            <Text style={[styles.simValue, { color: isOnline ? '#34C759' : '#FF3B30' }]}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
            <TouchableOpacity style={styles.simBtn} onPress={toggleNetwork}>
              <Text style={styles.simBtnText}>{isOnline ? 'Go Offline' : 'Go Online'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.simRow}>
            <Text style={styles.simLabel}>Backend:</Text>
            <Text style={styles.simValue}>{simMode}</Text>
            <TouchableOpacity style={styles.simBtn} onPress={toggleSimMode}>
              <Text style={styles.simBtnText}>Toggle</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Conversation Area */}
        <KeyboardAvoidingView 
          style={styles.chatContainer} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.messageId}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No messages yet.</Text>
                <Text style={styles.emptySubtext}>Send a message to start the conversation.</Text>
              </View>
            }
          />
          
          {/* Composer */}
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type a message..."
              placeholderTextColor="#8E8E93"
              multiline
              blurOnSubmit={false}
              onKeyPress={(e) => {
                if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                  if (e.preventDefault) e.preventDefault();
                  handleSend();
                }
              }}
            />
            <TouchableOpacity 
              style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]} 
              onPress={handleSend}
            >
              <Text style={styles.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

      </SafeAreaView>
    </View>
  );
}

const isWeb = Platform.OS === 'web';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: isWeb ? '#E5E5EA' : '#000', // Browser background
    justifyContent: isWeb ? 'center' : 'flex-start',
    alignItems: isWeb ? 'center' : 'stretch',
  },
  phoneFrame: {
    flex: 1,
    width: '100%',
    backgroundColor: '#F2F2F7',
    ...(isWeb && {
      maxWidth: 390,
      maxHeight: 844,
      borderRadius: 40,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.1,
      shadowRadius: 20,
      borderWidth: 8,
      borderColor: '#1C1C1E',
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#E5E5EA',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  simCard: {
    backgroundColor: '#FFFFFF',
    margin: 12,
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  simRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  simLabel: {
    width: 70,
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  simValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  simBtn: {
    backgroundColor: '#E5E5EA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  simBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
  },
  chatContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 20,
    paddingTop: 10,
  },
  messageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  messageBubble: {
    maxWidth: '78%',
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 18,
    borderBottomRightRadius: 4,
  },
  messageContent: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 20,
    marginBottom: 4,
  },
  messageMeta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  messageStatus: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  retryBtn: {
    marginLeft: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 2,
  },
  retryBtnText: {
    fontSize: 10,
    color: '#FF3B30',
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  emptyText: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '500',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#AEAEB2',
  },
  composer: {
    flexDirection: 'row',
    padding: 10,
    paddingBottom: isWeb ? 10 : 30, // Extra padding for non-web safe areas if needed
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    maxHeight: 100,
    minHeight: 40,
    color: '#1C1C1E',
  },
  sendBtn: {
    marginLeft: 10,
    justifyContent: 'center',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: 12,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  }
});
