import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  UserCircle2,
  Phone,
  Briefcase,
  Users,
  Mail,
  Shield,
  Edit3,
  Save,
  ChevronLeft,
  Camera
} from 'lucide-react-native';
import { useAuth } from '../../../contexts/AuthContext';
import { managerApi } from '../../../services/api/managerApi';
import * as ImagePicker from 'expo-image-picker';

const colors = {
  primary: '#8b5cf6', // Violet
  secondary: '#64748b',
  background: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
};

export default function ManagerProfileScreen({ navigation }) {
  const { user, login } = useAuth(); // login or checkSession to refresh
  
  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    designation: user?.designation || '',
  });
  
  const [avatarUri, setAvatarUri] = useState(user?.avatarUrl || null);
  const [saving, setSaving] = useState(false);

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'You need to allow access to your photos to upload an avatar.');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!pickerResult.canceled && pickerResult.assets[0]) {
      setAvatarUri(pickerResult.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }
    
    setSaving(true);
    try {
      // Create form data for multipart upload
      const formData = new FormData();
      formData.append('name', form.name);
      formData.append('phone', form.phone);
      formData.append('designation', form.designation);

      if (avatarUri && avatarUri !== user?.avatarUrl) {
        formData.append('avatar', {
          uri: avatarUri,
          name: 'avatar.jpg',
          type: 'image/jpeg',
        });
      }

      await managerApi.updateProfile(formData);
      
      Alert.alert('Success', 'Profile updated successfully.');
      // Optionally trigger a re-fetch of the user object in AuthContext here if needed
    } catch (err) {
      console.error(err);
      Alert.alert('Error', err.response?.data?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={28} color="#0f172a" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Personal Information</Text>
            <Text style={styles.headerSubtitle}>Manage your profile details</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Avatar Section */}
          <View style={styles.avatarSection}>
            <TouchableOpacity style={styles.avatarContainer} onPress={handlePickImage}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarText}>{form.name?.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.editBadge}>
                <Camera size={14} color="#fff" />
              </View>
            </TouchableOpacity>
            
            <View style={styles.nameRoleSection}>
              <Text style={styles.profileName}>{user?.name}</Text>
              <View style={styles.roleBadge}>
                <Shield size={12} color={colors.primary} />
                <Text style={styles.roleText}>Manager</Text>
              </View>
            </View>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Edit3 size={18} color={colors.primary} />
              <Text style={styles.cardTitle}>Editable Information</Text>
            </View>

            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <UserCircle2 size={14} color={colors.secondary} />
                <Text style={styles.label}>FULL NAME</Text>
              </View>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={text => setForm({...form, name: text})}
                placeholder="Your full name"
              />
            </View>

            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <Phone size={14} color={colors.secondary} />
                <Text style={styles.label}>PHONE</Text>
              </View>
              <TextInput
                style={styles.input}
                value={form.phone}
                onChangeText={text => setForm({...form, phone: text})}
                placeholder="+91 98765 43210"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <Briefcase size={14} color={colors.secondary} />
                <Text style={styles.label}>DESIGNATION</Text>
              </View>
              <TextInput
                style={styles.input}
                value={form.designation}
                onChangeText={text => setForm({...form, designation: text})}
                placeholder="e.g. Engineering Manager"
              />
            </View>
          </View>

          {/* Read Only Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Shield size={18} color={colors.secondary} />
              <Text style={styles.cardTitle}>Read Only</Text>
            </View>

            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <Mail size={14} color={colors.secondary} />
                <Text style={styles.label}>EMAIL ADDRESS</Text>
              </View>
              <View style={styles.readOnlyInput}>
                <Text style={styles.readOnlyText}>{user?.email}</Text>
              </View>
            </View>

            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <Users size={14} color={colors.secondary} />
                <Text style={styles.label}>ASSIGNED TEAM</Text>
              </View>
              <View style={styles.readOnlyInput}>
                <Text style={styles.readOnlyText}>{user?.teamId?.name || '—'}</Text>
              </View>
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity 
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
            ) : (
              <Save size={20} color="#fff" style={{ marginRight: 8 }} />
            )}
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    marginRight: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  avatarPlaceholder: {
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.primary,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  nameRoleSection: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  roleText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginLeft: 8,
  },
  formGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondary,
    marginLeft: 6,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '500',
  },
  readOnlyInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    opacity: 0.7,
  },
  readOnlyText: {
    fontSize: 15,
    color: colors.secondary,
    fontWeight: '500',
  },
  saveBtn: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
