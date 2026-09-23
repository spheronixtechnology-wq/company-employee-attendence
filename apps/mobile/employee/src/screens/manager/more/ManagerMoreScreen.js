import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldAlert, Clock, Settings, ChevronRight, Users, UserCheck, FileText, UserCircle2, MapPin, Wifi, ShieldCheck, ClipboardList, CalendarDays } from 'lucide-react-native';

export default function ManagerMoreScreen({ navigation }) {
  const menuItems = [
    {
      id: 'leave-requests',
      title: 'Pending Requests',
      subtitle: 'Review and approve leave requests',
      icon: Clock,
      color: '#eab308' // yellow
    },
    {
      id: 'device-requests',
      title: 'Device Approvals',
      subtitle: 'Review and approve device registrations',
      icon: ShieldAlert,
      color: '#f97316' // orange
    },
    {
      id: 'team-attendance',
      title: 'Attendance',
      subtitle: 'Review historical team attendance',
      icon: UserCheck,
      color: '#3b82f6' // blue
    },
    {
      id: 'team-daily-logs',
      title: 'Daily Logs',
      subtitle: 'Review end-of-day reports',
      icon: FileText,
      color: '#06b6d4' // cyan
    },
    {
      id: 'team-overtime',
      title: 'Overtime',
      subtitle: 'Manage overtime permissions and work logs',
      icon: Clock,
      color: '#10b981' // emerald
    },
    {
      id: 'session-reactivations',
      title: 'Session Reactivations',
      subtitle: 'Review and approve auto-checkout sessions',
      icon: ShieldCheck,
      color: '#8b5cf6' // violet
    },
    {
      id: 'team-members',
      title: 'Team Directory',
      subtitle: 'View and manage team directory',
      icon: Users,
      color: '#6366f1' // indigo
    },
    {
      id: 'attendance-method',
      title: 'Attendance Method',
      subtitle: 'Configure company-wide attendance verification',
      icon: ShieldCheck,
      color: '#8b5cf6' // violet
    },
    {
      id: 'office-locations',
      title: 'Office Locations',
      subtitle: 'Manage allowed office coordinates and IPs',
      icon: MapPin,
      color: '#ec4899' // pink
    },
    {
      id: 'wifi-settings',
      title: 'WiFi / IP Settings',
      subtitle: 'Configure office network restrictions',
      icon: Wifi,
      color: '#14b8a6' // teal
    }
  ];

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ backgroundColor: '#ffffff' }} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>More Options</Text>
        </View>
      </SafeAreaView>
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <TouchableOpacity 
              key={item.id} 
              style={styles.menuCard}
              onPress={() => navigation.navigate(item.id)}
            >
              <View style={[styles.iconBox, { backgroundColor: item.color + '20' }]}>
                <Icon size={24} color={item.color} />
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
              <ChevronRight size={20} color="#94a3b8" />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  menuSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
});
