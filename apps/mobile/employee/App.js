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
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import AttendanceHistoryScreen from './src/screens/AttendanceHistoryScreen';
import DailyLogScreen from './src/screens/DailyLogScreen';
import OvertimeScreen from './src/screens/OvertimeScreen';
import LeaveScreen from './src/screens/LeaveScreen';
import DeviceStatusScreen from './src/screens/DeviceStatusScreen';
import ManualAttendanceScreen from './src/screens/ManualAttendanceScreen';
import ServicesHubScreen from './src/screens/ServicesHubScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import DiagnosticsScreen from './src/screens/DiagnosticsScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';

function MainNavigation() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [previousTab, setPreviousTab] = useState('dashboard');

  const navigateTo = (tab) => {
    setPreviousTab(activeTab);
    setActiveTab(tab);
  };

  const handleBack = () => {
    setActiveTab(previousTab || 'dashboard');
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Restoring session...</Text>
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <SafeAreaView style={styles.appContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Screen Body */}
      <View style={styles.screenContainer}>
        {activeTab === 'dashboard' && (
          <DashboardScreen
            onNavigateHistory={() => navigateTo('history')}
            onNavigateOvertime={() => navigateTo('overtime')}
            onNavigateDailyLog={() => navigateTo('dailylog')}
            onNavigateLeave={() => navigateTo('leave')}
            onNavigateDevice={() => navigateTo('device')}
            onNavigateManual={() => navigateTo('manual')}
            onNavigateProfile={() => navigateTo('profile')}
            onNavigateServices={() => navigateTo('services')}
            onNavigateNotifications={() => navigateTo('notifications')}
          />
        )}
        {activeTab === 'history' && (
          <AttendanceHistoryScreen onBack={handleBack} />
        )}
        {activeTab === 'dailylog' && (
          <DailyLogScreen onBack={handleBack} />
        )}
        {activeTab === 'services' && (
          <ServicesHubScreen onNavigate={(screen) => navigateTo(screen)} onBack={handleBack} />
        )}
        {activeTab === 'profile' && (
          <ProfileScreen onBack={handleBack} />
        )}
        {activeTab === 'overtime' && (
          <OvertimeScreen onBack={handleBack} />
        )}
        {activeTab === 'leave' && (
          <LeaveScreen onBack={handleBack} />
        )}
        {activeTab === 'device' && (
          <DeviceStatusScreen onBack={handleBack} />
        )}
        {activeTab === 'manual' && (
          <ManualAttendanceScreen onBack={handleBack} />
        )}
        {activeTab === 'diagnostic' && (
          <DiagnosticsScreen onBack={handleBack} />
        )}
        {activeTab === 'notifications' && (
          <NotificationsScreen onBack={handleBack} />
        )}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SocketProvider>
          <MainNavigation />
        </SocketProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  screenContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 12,
    fontWeight: '600',
  },
});
