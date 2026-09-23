import React, { useState } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import DashboardScreen from '../screens/DashboardScreen';
import AttendanceHistoryScreen from '../screens/AttendanceHistoryScreen';
import DailyLogScreen from '../screens/DailyLogScreen';
import OvertimeScreen from '../screens/OvertimeScreen';
import LeaveScreen from '../screens/LeaveScreen';
import DeviceStatusScreen from '../screens/DeviceStatusScreen';
import ManualAttendanceScreen from '../screens/ManualAttendanceScreen';
import ServicesHubScreen from '../screens/ServicesHubScreen';
import ProfileScreen from '../screens/ProfileScreen';
import DiagnosticsScreen from '../screens/DiagnosticsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';

export default function EmployeeNavigation() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [previousTab, setPreviousTab] = useState('dashboard');

  const navigateTo = (tab) => {
    setPreviousTab(activeTab);
    setActiveTab(tab);
  };

  const handleBack = () => {
    setActiveTab(previousTab || 'dashboard');
  };

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

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  screenContainer: {
    flex: 1,
  },
});
