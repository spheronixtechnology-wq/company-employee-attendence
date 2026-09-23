import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

import LoginScreen from '../screens/auth/LoginScreen';
import EmployeeNavigation from './EmployeeNavigation';
import ManagerNavigation from './ManagerNavigation';

export default function RootNavigation() {
  const { user, loading, logout } = useAuth();

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

  // Explicit role-based routing (Zero-Regression Security Flow)
  if (user.role === 'employee') {
    return <EmployeeNavigation />;
  }

  if (user.role === 'manager') {
    return <ManagerNavigation />;
  }

  // Unknown role fallback to prevent accidental access
  return (
    <View style={styles.centerContainer}>
      <Text style={styles.errorTitle}>Access Denied</Text>
      <Text style={styles.errorDesc}>
        Your account role ({user.role || 'Unknown'}) is not recognized by this portal.
      </Text>
      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 12,
    fontWeight: '600',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#b91c1c',
    marginBottom: 8,
  },
  errorDesc: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 24,
  },
  logoutButton: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  logoutText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
