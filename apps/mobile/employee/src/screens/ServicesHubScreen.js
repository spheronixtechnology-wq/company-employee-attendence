import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { ArrowLeft, Home } from 'lucide-react-native';

export default function ServicesHubScreen({ onNavigate, onBack }) {
  const services = [
    {
      id: 'history',
      title: 'Attendance History',
      subtitle: 'Verified shifts, work hours, breaks & monthly summaries',
      icon: '📅',
      color: '#0284c7',
      bg: '#f0f9ff',
    },
    {
      id: 'overtime',
      title: 'Overtime Management',
      subtitle: 'Two-stage approval workflow & live focus stopwatch',
      icon: '⏱',
      color: '#ea580c',
      bg: '#fff7ed',
    },
    {
      id: 'dailylog',
      title: 'Daily Work Log',
      subtitle: 'Shift compliance, streak milestones & document upload',
      icon: '📝',
      color: '#059669',
      bg: '#ecfdf5',
    },
    {
      id: 'leave',
      title: 'Leave Management',
      subtitle: 'Leave balances, applications & manager approvals',
      icon: '🏖',
      color: '#6366f1',
      bg: '#eef2ff',
    },
    {
      id: 'device',
      title: 'Device Security',
      subtitle: 'Hardware binding, fingerprint hash & replacement requests',
      icon: '🔒',
      color: '#0ea5e9',
      bg: '#f0f9ff',
    },
    {
      id: 'manual',
      title: 'Manual Attendance',
      subtitle: 'Emergency fallback check-in request to manager',
      icon: '📋',
      color: '#d97706',
      bg: '#fffbeb',
    },
    {
      id: 'profile',
      title: 'Employee Profile',
      subtitle: 'Avatar photo, emergency contact & contact details',
      icon: '👤',
      color: '#6366f1',
      bg: '#eef2ff',
    },
    {
      id: 'diagnostic',
      title: 'Diagnostics & Connectivity',
      subtitle: 'Socket.IO status, API latency & native sensor signals',
      icon: '⚡',
      color: '#8b5cf6',
      bg: '#f5f3ff',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <View style={styles.headerTopRow}>
          {onBack ? (
            <TouchableOpacity
              onPress={onBack}
              style={styles.backHomeBtn}
              activeOpacity={0.7}
              accessibilityLabel="Back to Home Dashboard"
            >
              <ArrowLeft size={16} color="#0f172a" />
              <Text style={styles.backHomeBtnText}>Back to Home</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}

          {onBack && (
            <TouchableOpacity
              onPress={onBack}
              style={styles.homeCircleBtn}
              activeOpacity={0.7}
              accessibilityLabel="Home Dashboard"
            >
              <Home size={16} color="#0284c7" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>Services & Compliance</Text>
          <Text style={styles.headerSubtitle}>Enterprise employee workflows</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.grid}>
          {services.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              onPress={() => onNavigate(item.id)}
            >
              <View style={[styles.iconBox, { backgroundColor: item.bg }]}>
                <Text style={styles.iconText}>{item.icon}</Text>
              </View>

              <View style={styles.textBox}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
              </View>

              <Text style={styles.arrowIcon}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Bottom Back to Home Button */}
        {onBack && (
          <TouchableOpacity
            style={styles.bottomBackBtn}
            activeOpacity={0.8}
            onPress={onBack}
          >
            <Home size={16} color="#334155" />
            <Text style={styles.bottomBackBtnText}>Back to Home Dashboard</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  headerBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerTitleBox: {
    gap: 2,
  },
  backHomeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  backHomeBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0f172a',
  },
  homeCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#f0f9ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0f2fe',
  },
  bottomBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 18,
    marginBottom: 20,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  bottomBackBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  grid: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconText: {
    fontSize: 22,
  },
  textBox: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 15,
  },
  arrowIcon: {
    fontSize: 22,
    fontWeight: '300',
    color: '#94a3b8',
    marginLeft: 8,
  },
});
