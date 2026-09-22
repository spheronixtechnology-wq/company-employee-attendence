import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import { io } from 'socket.io-client';

const SocketContext = createContext({
  socket: null,
  isConnected: false,
});

export const getSocketUrl = () => {
  const envUrl = (typeof process !== 'undefined' && process.env)
    ? process.env.EXPO_PUBLIC_SOCKET_URL
    : undefined;
    
  if (envUrl && !envUrl.includes('10.0.2.2') && !envUrl.includes('localhost')) {
    return envUrl;
  }
  // If running in Expo Go or dev client on physical phone, resolve host computer LAN IP
  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    return `http://${host}:5000`;
  }
  return envUrl || 'http://10.0.2.2:5000';
};

export const SocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const socketUrl = getSocketUrl();
    console.log('🔌 [Mobile Socket] Initializing connection to:', socketUrl);

    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 15,
      reconnectionDelay: 1500,
      timeout: 10000,
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('⚡ [Mobile Socket] Connected with id:', socket.id);
      setIsConnected(true);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 [Mobile Socket] Disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.warn('⚠️ [Mobile Socket] Connection error:', err.message);
      setIsConnected(false);
    });

    // ── App Lifecycle Reconnection Listener ────────────────────────────────────
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('📱 [Mobile Socket] App resumed to foreground, verifying connection...');
        if (socketRef.current && !socketRef.current.connected) {
          socketRef.current.connect();
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  return useContext(SocketContext);
};
