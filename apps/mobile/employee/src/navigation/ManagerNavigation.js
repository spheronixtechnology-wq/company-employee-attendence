import React, { useState } from 'react';
import { View, StyleSheet, StatusBar, TouchableOpacity, Text, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ManagerDashboardScreen from '../screens/manager/dashboard/ManagerDashboardScreen';
import ManagerRequestsScreen from '../screens/manager/requests/ManagerRequestsScreen';
import SessionReactivationsScreen from '../screens/manager/sessions/SessionReactivationsScreen';
import TeamOvertimeScreen from '../screens/manager/overtime/TeamOvertimeScreen';
import ManagerSettingsScreen from '../screens/manager/settings/ManagerSettingsScreen';
import ManagerWifiSettingsScreen from '../screens/manager/wifi/ManagerWifiSettingsScreen';
import ManagerDeviceRequestsScreen from '../screens/manager/requests/ManagerDeviceRequestsScreen';
import ManagerLocationRequestsScreen from '../screens/manager/requests/ManagerLocationRequestsScreen';
import TeamMembersScreen from '../screens/manager/members/TeamMembersScreen';
import TeamAttendanceScreen from '../screens/manager/attendance/TeamAttendanceScreen';
import TeamDailyLogsScreen from '../screens/manager/logs/TeamDailyLogsScreen';
import ManagerProfileScreen from '../screens/manager/profile/ManagerProfileScreen';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'team-members', label: 'Team Members' },
  { id: 'team-attendance', label: 'Team Attendance' },
  { id: 'session-reactivations', label: 'Session Reactivations' },
  { id: 'team-overtime', label: 'Overtime' },
  { id: 'team-daily-logs', label: 'Daily Logs' },
  { id: 'leave-requests', label: 'Leave Requests' },
  { id: 'device-requests', label: 'Device Requests' },
  { id: 'location-requests', label: 'Location Requests' },
  { id: 'attendance-method', label: 'Attendance Method' },
  { id: 'wifi-settings', label: 'WiFi / IP Settings' },
  { id: 'office-locations', label: 'Office Locations' },
  { id: 'manager-profile', label: 'My Profile' }
];

export default function ManagerNavigation() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [previousTab, setPreviousTab] = useState('dashboard');

  const navigateTo = (tab) => {
    setPreviousTab(activeTab);
    setActiveTab(tab);
  };

  const handleBack = () => {
    setActiveTab('dashboard'); // Always back to home
  };

  return (
    <SafeAreaView style={styles.appContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      
      <View style={styles.screenContainer}>
        {activeTab === 'dashboard' && (
          <ManagerDashboardScreen 
            onNavigate={(screen) => navigateTo(screen)}
          />
        )}
        
        {activeTab === 'leave-requests' && (
          <ManagerRequestsScreen key={activeTab} navigation={{ goBack: handleBack }} initialTab="leave" />
        )}
        {activeTab === 'device-requests' && (
          <ManagerDeviceRequestsScreen key={activeTab} navigation={{ goBack: handleBack }} />
        )}
        {activeTab === 'location-requests' && (
          <ManagerLocationRequestsScreen key={activeTab} navigation={{ goBack: handleBack }} />
        )}

        {activeTab === 'team-members' && (
          <TeamMembersScreen navigation={{ goBack: handleBack }} />
        )}

        {activeTab === 'team-attendance' && (
          <TeamAttendanceScreen navigation={{ goBack: handleBack }} />
        )}

        {activeTab === 'team-daily-logs' && (
          <TeamDailyLogsScreen navigation={{ goBack: handleBack }} />
        )}

        {activeTab === 'session-reactivations' && (
          <SessionReactivationsScreen navigation={{ goBack: handleBack }} />
        )}

        {activeTab === 'team-overtime' && (
          <TeamOvertimeScreen navigation={{ goBack: handleBack }} />
        )}

        {activeTab === 'attendance-method' && (
          <ManagerSettingsScreen key={activeTab} navigation={{ goBack: handleBack }} initialTab="attendance" />
        )}
        {activeTab === 'wifi-settings' && (
          <ManagerWifiSettingsScreen key={activeTab} navigation={{ goBack: handleBack }} />
        )}
        {activeTab === 'office-locations' && (
          <ManagerSettingsScreen key={activeTab} navigation={{ goBack: handleBack }} initialTab="locations" />
        )}

        {activeTab === 'manager-profile' && (
          <ManagerProfileScreen navigation={{ goBack: handleBack }} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  topNavContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoWrapper: {
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  logo: {
    width: 80,
    height: 30,
  },
  topNavScroll: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  topNavItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    marginRight: 6,
  },
  topNavItemActive: {
    backgroundColor: '#8b5cf6', // primary color
  },
  topNavText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  topNavTextActive: {
    color: '#ffffff',
  },
  screenContainer: {
    flex: 1,
  }
});
