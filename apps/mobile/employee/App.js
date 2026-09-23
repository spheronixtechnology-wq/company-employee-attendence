import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  LogBox,
} from 'react-native';

LogBox.ignoreLogs([
  'Background location is limited in Expo Go',
  'SafeAreaView has been deprecated',
  '[sendPresencePing]',
  'ping error',
  'Network Error',
]);

import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import './src/services/presenceTracking'; // Ensure TaskManager is defined in global scope to prevent background crashes
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { SocketProvider } from './src/contexts/SocketContext';

import RootNavigation from './src/navigation/RootNavigation';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SocketProvider>
          <RootNavigation />
        </SocketProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
