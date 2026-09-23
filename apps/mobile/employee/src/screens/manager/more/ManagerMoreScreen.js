import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { ShieldAlert, Clock, Settings, ChevronRight } from 'lucide-react-native';

export default function ManagerMoreScreen({ navigation }) {
  const menuItems = [
    {
      id: 'session-reactivations',
      title: 'Session Reactivations',
      subtitle: 'Review and approve auto-checkout sessions',
      icon: ShieldAlert,
      color: '#f97316' // Orange
    },
    {
      id: 'team-overtime',
      title: 'Team Overtime',
      subtitle: 'Manage overtime permissions and work logs',
      icon: Clock,
      color: '#0ea5e9' // Blue
    },
    {
      id: 'settings',
      title: 'Manager Settings',
      subtitle: 'Configure office locations and attendance methods',
      icon: Settings,
      color: '#8b5cf6' // Violet
    }
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More Options</Text>
      </View>
      
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
