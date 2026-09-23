import React, { useState } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import DashboardScreen from '../screens/employee/DashboardScreen';
import AttendanceHistoryScreen from '../screens/employee/AttendanceHistoryScreen';
import DailyLogScreen from '../screens/employee/DailyLogScreen';
import OvertimeScreen from '../screens/employee/OvertimeScreen';
import LeaveScreen from '../screens/employee/LeaveScreen';
import DeviceStatusScreen from '../screens/employee/DeviceStatusScreen';
import ManualAttendanceScreen from '../screens/employee/ManualAttendanceScreen';
import ServicesHubScreen from '../screens/employee/ServicesHubScreen';
import ProfileScreen from '../screens/employee/ProfileScreen';
import DiagnosticsScreen from '../screens/employee/DiagnosticsScreen';
import NotificationsScreen from '../screens/employee/NotificationsScreen';

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
