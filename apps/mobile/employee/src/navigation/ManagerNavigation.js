import React, { useState } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LayoutDashboard, Inbox, UserCheck, Menu } from 'lucide-react-native';

import ManagerDashboardScreen from '../screens/manager/dashboard/ManagerDashboardScreen';
import ManagerMoreScreen from '../screens/manager/more/ManagerMoreScreen';
import SessionReactivationsScreen from '../screens/manager/sessions/SessionReactivationsScreen';
import ManagerRequestsScreen from '../screens/manager/requests/ManagerRequestsScreen';

export default function ManagerNavigation() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [moreSubScreen, setMoreSubScreen] = useState(null);

  // Navigate back to More list from sub-screens
  const navigateToMore = () => setMoreSubScreen(null);

  return (
    <SafeAreaView style={styles.appContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      
      {/* Screen Body */}
      <View style={styles.screenContainer}>
        {activeTab === 'dashboard' && (
          <ManagerDashboardScreen 
            navigation={{ navigate: (screen) => setActiveTab(screen.toLowerCase()) }} 
          />
        )}
        
        {activeTab === 'requests' && (
          <ManagerRequestsScreen />
        )}

        {activeTab === 'attendance' && (
          <View style={styles.placeholder}>
            <Text style={styles.title}>My Attendance</Text>
            <Text style={styles.subtitle}>Phase 10 - Coming Soon</Text>
          </View>
        )}

        {activeTab === 'more' && (
          <>
            {!moreSubScreen && (
              <ManagerMoreScreen navigation={{ navigate: setMoreSubScreen }} />
            )}
            {moreSubScreen === 'session-reactivations' && (
              <SessionReactivationsScreen navigation={{ goBack: navigateToMore }} />
            )}
            {moreSubScreen === 'team-overtime' && (
              <View style={styles.placeholder}>
                <TouchableOpacity onPress={navigateToMore} style={{ marginBottom: 20 }}>
                  <Text style={{ color: '#0ea5e9' }}>← Back to More Settings</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Team Overtime</Text>
                <Text style={styles.subtitle}>Phase 8 - Coming Soon</Text>
              </View>
            )}
            {moreSubScreen === 'settings' && (
              <View style={styles.placeholder}>
                <TouchableOpacity onPress={navigateToMore} style={{ marginBottom: 20 }}>
                  <Text style={{ color: '#0ea5e9' }}>← Back to More Settings</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Manager Settings</Text>
                <Text style={styles.subtitle}>Phase 9 - Coming Soon</Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* Bottom Tab Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('dashboard')}>
          <LayoutDashboard size={24} color={activeTab === 'dashboard' ? '#0ea5e9' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'dashboard' && styles.activeTabText]}>Dashboard</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('requests')}>
          <Inbox size={24} color={activeTab === 'requests' ? '#0ea5e9' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'requests' && styles.activeTabText]}>Requests</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('attendance')}>
          <UserCheck size={24} color={activeTab === 'attendance' ? '#0ea5e9' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'attendance' && styles.activeTabText]}>My Attendance</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('more')}>
          <Menu size={24} color={activeTab === 'more' ? '#0ea5e9' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'more' && styles.activeTabText]}>More</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  screenContainer: {
    flex: 1,
  },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingBottom: 10,
    paddingTop: 10,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#0ea5e9',
    fontWeight: '600',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 8,
  },
});
