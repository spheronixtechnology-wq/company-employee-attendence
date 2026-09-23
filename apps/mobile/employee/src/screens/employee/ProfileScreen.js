import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Home } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';

export default function ProfileScreen({ onBack }) {
  const { user, updateUserLocally, logout } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [designation, setDesignation] = useState(user?.designation || '');
  const [avatarBase64, setAvatarBase64] = useState(user?.avatarUrl || null);

  // Keep local avatar state in sync when user context changes (e.g. from socket update on another device)
  useEffect(() => {
    setAvatarBase64(user?.avatarUrl || null);
  }, [user?.avatarUrl]);

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Camera roll permissions are required to change your avatar.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      const dataUri = `data:image/jpeg;base64,${asset.base64}`;
      setAvatarBase64(dataUri);
    } catch (err) {
      console.error('Image picker error:', err);
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Full Name cannot be empty.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.put('/employee/profile', {
        name: name.trim(),
        phone: phone.trim(),
        designation: designation.trim(),
        avatarUrl: avatarBase64,
      });

      const updatedUser = res.data?.data?.user;
      if (updatedUser) {
        await updateUserLocally(updatedUser);
      }

      Alert.alert('Success', 'Profile updated successfully!');
      setIsEditing(false);
    } catch (err) {
      console.error('Update profile error:', err);
      Alert.alert('Update Failed', err.response?.data?.message || 'Failed to update profile.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Confirm Sign Out',
      'Are you sure you want to sign out of Spheronix Attendance?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header Bar */}
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

        <View style={styles.headerTitleRow}>
          <View>
            <Text style={styles.headerTitle}>My Profile</Text>
            <Text style={styles.headerSubtitle}>Employee details & account settings</Text>
          </View>
          <TouchableOpacity
            style={isEditing ? styles.saveBtn : styles.editBtn}
            disabled={submitting}
            onPress={isEditing ? handleSaveProfile : () => setIsEditing(true)}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.btnText}>{isEditing ? 'Save' : 'Edit'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Avatar & Header Card */}
        <View style={styles.profileHeroCard}>
          <View style={styles.avatarWrapper}>
            {avatarBase64 ? (
              <Image source={{ uri: avatarBase64 }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>
                  {user?.name ? user.name.slice(0, 2).toUpperCase() : 'SP'}
                </Text>
              </View>
            )}

            {isEditing && (
              <TouchableOpacity style={styles.cameraBadge} onPress={handlePickImage}>
                <Text style={styles.cameraIcon}>📷</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.profileHeroName}>{user?.name || 'Employee'}</Text>
          <Text style={styles.profileHeroRole}>
            {user?.designation || user?.role || 'Team Member'}
          </Text>
          {user?.employeeId && (
            <View style={styles.empIdBadge}>
              <Text style={styles.empIdText}>ID: {user.employeeId}</Text>
            </View>
          )}
        </View>

        {/* Editable Information Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>Personal Information</Text>

          {/* Full Name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            {isEditing ? (
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="Full Name"
              />
            ) : (
              <Text style={styles.fieldValue}>{user?.name || '—'}</Text>
            )}
          </View>

          {/* Phone */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Phone Number</Text>
            {isEditing ? (
              <TextInput
                style={styles.textInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="+91 9876543210"
                keyboardType="phone-pad"
              />
            ) : (
              <Text style={styles.fieldValue}>{user?.phone || '—'}</Text>
            )}
          </View>

          {/* Designation */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Designation</Text>
            {isEditing ? (
              <TextInput
                style={styles.textInput}
                value={designation}
                onChangeText={setDesignation}
                placeholder="e.g. Senior Software Engineer"
              />
            ) : (
              <Text style={styles.fieldValue}>{user?.designation || '—'}</Text>
            )}
          </View>

          {isEditing && (
            <TouchableOpacity
              style={styles.cancelEditBtn}
              onPress={() => {
                setName(user?.name || '');
                setPhone(user?.phone || '');
                setDesignation(user?.designation || '');
                setAvatarBase64(user?.avatarUrl || null);
                setIsEditing(false);
              }}
            >
              <Text style={styles.cancelEditText}>Cancel Changes</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Company & Role Details Card (Read-only) */}
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>Organizational Details</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Email Address</Text>
            <Text style={styles.detailVal}>{user?.email || '—'}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Department</Text>
            <Text style={styles.detailVal}>{user?.department || 'Engineering'}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Employment Role</Text>
            <Text style={[styles.detailVal, { textTransform: 'capitalize' }]}>
              {user?.role || 'employee'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Work Mode</Text>
            <Text style={[styles.detailVal, { color: '#059669' }]}>
              {user?.workMode || 'Office'}
            </Text>
          </View>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Sign Out from Device</Text>
        </TouchableOpacity>

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
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  editBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 12,
  },
  saveBtn: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 12,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  profileHeroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatarFallback: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#4f46e5',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#6366f1',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  cameraIcon: {
    fontSize: 14,
  },
  profileHeroName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  profileHeroRole: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  empIdBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  empIdText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 14,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a',
  },
  cancelEditBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 6,
  },
  cancelEditText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  detailKey: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  detailVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  logoutButton: {
    backgroundColor: '#fee2e2',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutButtonText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '800',
  },
});
