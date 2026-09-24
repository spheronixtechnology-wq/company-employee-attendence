import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Image,
  TextInput,
  RefreshControl,
  Platform,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Users,
  Search,
  Plus,
  Trash2,
  X,
  ChevronLeft,
  Eye,
  EyeOff,
  UserCircle2,
  Mail,
  Briefcase,
  Lock,
  Check,
} from 'lucide-react-native';
import { managerApi } from '../../../services/api/managerApi';
import { useSocket } from '../../../contexts/SocketContext';
import Member360ProfileModal from '../../../components/Member360ProfileModal';

const colors = {
  primary: '#8b5cf6', // Violet matching Web UI
  secondary: '#64748b',
  danger: '#ef4444',
  success: '#10b981',
  warning: '#f59e0b',
  background: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
};

export default function TeamMembersScreen({ navigation }) {
  const [data, setData] = useState({ teams: [], members: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Create Member Modal
  const [createModal, setCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [createForm, setCreateForm] = useState({
    name: '', middleName: '', lastName: '', dob: '', gender: '',
    email: '', companyEmail: '', mobileNumber: '', currentAddress: '',
    emergencyContactName: '', emergencyContactNumber: '', emergencyContactRelation: '',
    department: '', designation: '', jobType: 'Full-Time', dateOfJoining: '',
    workLocation: '', country: '', officeBranch: '', teamShift: '',
    teamId: '', password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [selectModal, setSelectModal] = useState(null); // { field, title, options }

  // Profile Quick-View Modal
  const [profileModal, setProfileModal] = useState(null); // member object

  const { socket } = useSocket();

  const fetchMembers = useCallback(async () => {
    try {
      const res = await managerApi.getTeamMembers();
      setData(res.data?.data || { teams: [], members: [] });
    } catch (err) {
      console.error('Fetch members error:', err);
      Alert.alert('Error', 'Failed to load team members.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    if (!socket) return;
    const onUpdate = () => {
      fetchMembers(); // Re-fetch on status update
    };
    socket.on('attendance:update', onUpdate);
    socket.on('break:update', onUpdate);
    return () => {
      socket.off('attendance:update', onUpdate);
      socket.off('break:update', onUpdate);
    };
  }, [socket, fetchMembers]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMembers();
  };

  const handleArchiveMember = (member) => {
    Alert.alert(
      'Archive Team Member?',
      `Are you sure you want to remove ${member.name}? They will no longer appear in the team member list, but their attendance history will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await managerApi.deleteTeamMember(member._id);
              fetchMembers();
            } catch (err) {
              Alert.alert('Error', err.response?.data?.message || 'Failed to archive team member.');
            }
          }
        }
      ]
    );
  };

  const resetCreateForm = () => {
    setCreateStep(1);
    setCreateForm({
      name: '', middleName: '', lastName: '', dob: '', gender: '',
      email: '', companyEmail: '', mobileNumber: '', currentAddress: '',
      emergencyContactName: '', emergencyContactNumber: '', emergencyContactRelation: '',
      department: '', designation: '', jobType: 'Full-Time', dateOfJoining: '',
      workLocation: '', country: '', officeBranch: '', teamShift: '',
      teamId: data.teams && data.teams.length > 0 ? data.teams[0]._id : '', password: ''
    });
  };

  const nextStep = () => {
    if (createStep === 1) {
      if (!createForm.name || !createForm.lastName || !createForm.dob || !createForm.gender) {
        return Alert.alert('Validation Error', 'First Name, Last Name, Date of Birth, and Gender are required.');
      }
    } else if (createStep === 2) {
      if (!createForm.email || !createForm.mobileNumber || !createForm.currentAddress || !createForm.emergencyContactName || !createForm.emergencyContactNumber || !createForm.emergencyContactRelation) {
        return Alert.alert('Validation Error', 'Please fill all required contact details.');
      }
      if (createForm.mobileNumber.length !== 10 || createForm.emergencyContactNumber.length !== 10) {
        return Alert.alert('Validation Error', 'Mobile and Emergency Contact Numbers must be exactly 10 digits.');
      }
    }
    setCreateStep(s => Math.min(s + 1, 3));
  };

  const prevStep = () => setCreateStep(s => Math.max(s - 1, 1));

  const handleDateInput = (field, text) => {
    let val = text.replace(/[^\d]/g, '');
    let formattedVal = val;
    
    if (val.length > 2 && val.length <= 4) {
      let dd = val.slice(0, 2);
      if (parseInt(dd, 10) === 0) dd = '01';
      else if (parseInt(dd, 10) > 31) dd = '31';
      formattedVal = dd + '-' + val.slice(2);
    } else if (val.length > 4) {
      let dd = val.slice(0, 2);
      if (parseInt(dd, 10) === 0) dd = '01';
      else if (parseInt(dd, 10) > 31) dd = '31';
      
      let mm = val.slice(2, 4);
      if (val.length >= 4) {
        if (parseInt(mm, 10) === 0) mm = '01';
        else if (parseInt(mm, 10) > 12) mm = '12';
      }
      formattedVal = dd + '-' + mm + '-' + val.slice(4, 8);
    }
    
    setCreateForm(f => ({ ...f, [field]: formattedVal }));
  };

  const handleCreateMember = async () => {
    if (!createForm.department || !createForm.designation || !createForm.jobType || !createForm.dateOfJoining || !createForm.workLocation || !createForm.country || !createForm.officeBranch || !createForm.teamShift) {
      return Alert.alert('Validation Error', 'Please fill all required job information fields.');
    }
    if (!createForm.password || createForm.password.length < 6) {
      return Alert.alert('Validation Error', 'A temporary password of at least 6 characters is required.');
    }
    if (data.teams && data.teams.length > 1 && !createForm.teamId) {
      return Alert.alert('Validation Error', 'Please select a team.');
    }

    const submitForm = {
      ...createForm,
      dob: createForm.dob ? createForm.dob.split('-').reverse().join('-') : '',
      dateOfJoining: createForm.dateOfJoining ? createForm.dateOfJoining.split('-').reverse().join('-') : ''
    };

    setCreating(true);
    try {
      await managerApi.createTeamMember(submitForm);
      Alert.alert('Success', `${createForm.name} has been added to your team.`);
      setCreateModal(false);
      resetCreateForm();
      fetchMembers();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to create team member.');
    } finally {
      setCreating(false);
    }
  };

  const filteredMembers = (data.members || []).filter(m => 
    m.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    m.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedMembers = React.useMemo(() => {
    const groups = {};
    filteredMembers.forEach(m => {
      const teamName = m.teamId?.name || 'Unassigned';
      if (!groups[teamName]) {
        groups[teamName] = [];
      }
      groups[teamName].push(m);
    });
    
    return Object.entries(groups)
      .map(([teamName, members]) => ({
        teamName,
        members
      }))
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [filteredMembers]);

  const renderMember = (member) => {
    const statusColor =
      member.currentStatus === 'checked_in' ? colors.success :
      member.currentStatus === 'on_break' ? colors.warning :
      member.currentStatus === 'checked_out' ? '#3b82f6' : colors.secondary;

    const statusText =
      member.currentStatus === 'checked_in' ? 'Working' :
      member.currentStatus === 'on_break' ? 'On Break' :
      member.currentStatus === 'checked_out' ? 'Checked Out' : 'Offline';

    return (
      <TouchableOpacity
        style={styles.memberCard}
        activeOpacity={0.75}
        onPress={() => setProfileModal(member)}
      >
        <View style={styles.memberHeader}>
          <View style={styles.memberInfo}>
            {(member.avatarUrl || member.profileImage || member.user?.avatarUrl || member.user?.profileImage) ? (
              <Image source={{ uri: member.avatarUrl || member.profileImage || member.user?.avatarUrl || member.user?.profileImage }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarText}>{member.name?.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.memberDetails}>
              <Text style={styles.memberName}>{member.name}</Text>
              <Text style={styles.memberRole}>{member.designation || 'Employee'}</Text>
              <Text style={styles.memberEmail}>{member.email}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={(e) => { e.stopPropagation?.(); handleArchiveMember(member); }}
          >
            <Trash2 size={18} color={colors.danger} />
          </TouchableOpacity>
        </View>

        <View style={styles.memberFooter}>
          <View style={[styles.statusBadge, { borderColor: statusColor, backgroundColor: statusColor + '10' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
          <Text style={styles.teamText}>Team: {member.teamId?.name || 'Unassigned'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ backgroundColor: '#ffffff' }} edges={['top', 'left', 'right']}>
        {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={28} color="#0f172a" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Team Members</Text>
          <Text style={styles.headerSubtitle}>
            {(data.teams || []).map(t => t.name).join(', ') || 'Managed Teams'} · {(data.members || []).length} member(s)
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => { resetCreateForm(); setCreateModal(true); }}
        >
          <Plus size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      </SafeAreaView>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Search size={20} color="#94a3b8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search members by name or email..."
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={20} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : filteredMembers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Users size={48} color="#cbd5e1" />
          <Text style={styles.emptyTitle}>No Members Found</Text>
          <Text style={styles.emptyDesc}>There are no members matching your search criteria.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        >
          {groupedMembers.map(group => (
            <View key={group.teamName} style={styles.teamGroup}>
              <View style={styles.teamGroupHeader}>
                <Text style={styles.teamGroupTitle}>{group.teamName}</Text>
                <Text style={styles.teamGroupSubtitle}>· {group.members.length} member{group.members.length !== 1 ? 's' : ''}</Text>
              </View>
              {group.members.map(member => (
                 <React.Fragment key={member._id}>
                   {renderMember(member)}
                 </React.Fragment>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── Create Member Modal ──────────────────────────────────────── */}
      <Modal visible={createModal} transparent animationType="slide" onRequestClose={() => setCreateModal(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContentLarge}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Add Team Member</Text>
                  <Text style={styles.modalSubtitle}>Step {createStep} of 3</Text>
                </View>
                <TouchableOpacity onPress={() => setCreateModal(false)} style={styles.modalCloseBtn}>
                  <X size={20} color={colors.secondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
                {createStep === 1 && (
                  <View style={styles.stepContainer}>
                    <Text style={styles.stepTitle}>Basic Information</Text>
                    
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>First Name *</Text>
                      <TextInput style={styles.formInput} placeholder="first name" value={createForm.name} onChangeText={(v) => setCreateForm(f => ({ ...f, name: v }))} />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Middle Name</Text>
                      <TextInput style={styles.formInput} placeholder="middle name" value={createForm.middleName} onChangeText={(v) => setCreateForm(f => ({ ...f, middleName: v }))} />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Last Name *</Text>
                      <TextInput style={styles.formInput} placeholder="last name" value={createForm.lastName} onChangeText={(v) => setCreateForm(f => ({ ...f, lastName: v }))} />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Date of Birth * (DD-MM-YYYY)</Text>
                      <TextInput 
                        style={styles.formInput} 
                        placeholder="31-12-2000" 
                        keyboardType="number-pad"
                        maxLength={10}
                        value={createForm.dob} 
                        onChangeText={(v) => handleDateInput('dob', v)} 
                      />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Gender *</Text>
                      <TouchableOpacity
                        style={styles.formInputSelect}
                        onPress={() => setSelectModal({
                          field: 'gender',
                          title: 'Select Gender',
                          options: ['Male', 'Female', 'Other']
                        })}
                      >
                        <Text style={[styles.formInputSelectText, !createForm.gender && { color: '#94a3b8' }]}>
                          {createForm.gender || 'Select Gender'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {createStep === 2 && (
                  <View style={styles.stepContainer}>
                    <Text style={styles.stepTitle}>Contact Details</Text>

                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Personal Email (Login) *</Text>
                      <TextInput style={styles.formInput} placeholder="employee@spheronixtechnology.in" keyboardType="email-address" autoCapitalize="none" value={createForm.email} onChangeText={(v) => setCreateForm(f => ({ ...f, email: v }))} />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Company Email</Text>
                      <TextInput style={styles.formInput} placeholder="employee@spheronixtechnology.in" keyboardType="email-address" autoCapitalize="none" value={createForm.companyEmail} onChangeText={(v) => setCreateForm(f => ({ ...f, companyEmail: v }))} />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Mobile Number *</Text>
                      <TextInput style={styles.formInput} placeholder="1234567890" keyboardType="number-pad" maxLength={10} value={createForm.mobileNumber} onChangeText={(v) => setCreateForm(f => ({ ...f, mobileNumber: v.replace(/\D/g, '') }))} />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Current Address *</Text>
                      <TextInput style={styles.formInput} placeholder="Full residential address" value={createForm.currentAddress} onChangeText={(v) => setCreateForm(f => ({ ...f, currentAddress: v }))} />
                    </View>
                    
                    <Text style={[styles.stepTitle, { marginTop: 12, fontSize: 14 }]}>Emergency Contact</Text>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Name *</Text>
                      <TextInput style={styles.formInput} placeholder="name" value={createForm.emergencyContactName} onChangeText={(v) => setCreateForm(f => ({ ...f, emergencyContactName: v }))} />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Number *</Text>
                      <TextInput style={styles.formInput} placeholder="1234567890" keyboardType="number-pad" maxLength={10} value={createForm.emergencyContactNumber} onChangeText={(v) => setCreateForm(f => ({ ...f, emergencyContactNumber: v.replace(/\D/g, '') }))} />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Relation *</Text>
                      <TextInput style={styles.formInput} placeholder="e.g. Spouse" value={createForm.emergencyContactRelation} onChangeText={(v) => setCreateForm(f => ({ ...f, emergencyContactRelation: v }))} />
                    </View>
                  </View>
                )}

                {createStep === 3 && (
                  <View style={styles.stepContainer}>
                    <Text style={styles.stepTitle}>Job Information</Text>
                    
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Department *</Text>
                      <TextInput style={styles.formInput} placeholder="e.g. Engineering" value={createForm.department} onChangeText={(v) => setCreateForm(f => ({ ...f, department: v }))} />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Designation *</Text>
                      <TextInput style={styles.formInput} placeholder="e.g. Frontend Dev" value={createForm.designation} onChangeText={(v) => setCreateForm(f => ({ ...f, designation: v }))} />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Job Type *</Text>
                      <TouchableOpacity
                        style={styles.formInputSelect}
                        onPress={() => setSelectModal({
                          field: 'jobType',
                          title: 'Select Job Type',
                          options: ['Full-Time', 'Part-Time', 'Intern', 'Contract']
                        })}
                      >
                        <Text style={[styles.formInputSelectText, !createForm.jobType && { color: '#94a3b8' }]}>
                          {createForm.jobType || 'Select Job Type'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Date of Joining * (DD-MM-YYYY)</Text>
                      <TextInput 
                        style={styles.formInput} 
                        placeholder="DD-MM-YYYY" 
                        keyboardType="number-pad"
                        maxLength={10}
                        value={createForm.dateOfJoining} 
                        onChangeText={(v) => handleDateInput('dateOfJoining', v)} 
                      />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Work Location *</Text>
                      <TextInput style={styles.formInput} placeholder="e.g. Remote" value={createForm.workLocation} onChangeText={(v) => setCreateForm(f => ({ ...f, workLocation: v }))} />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Country *</Text>
                      <TextInput style={styles.formInput} placeholder="e.g. USA" value={createForm.country} onChangeText={(v) => setCreateForm(f => ({ ...f, country: v }))} />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Office Branch *</Text>
                      <TextInput style={styles.formInput} placeholder="e.g. Head Office" value={createForm.officeBranch} onChangeText={(v) => setCreateForm(f => ({ ...f, officeBranch: v }))} />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Team Shift *</Text>
                      <TouchableOpacity
                        style={styles.formInputSelect}
                        onPress={() => setSelectModal({
                          field: 'teamShift',
                          title: 'Select Team Shift',
                          options: ['Morning (9 AM - 5 PM)', 'Evening (5 PM - 1 AM)', 'Night (1 AM - 9 AM)', 'Flexible']
                        })}
                      >
                        <Text style={[styles.formInputSelectText, !createForm.teamShift && { color: '#94a3b8' }]}>
                          {createForm.teamShift || 'Select Shift'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {data.teams && data.teams.length > 1 && (
                      <View style={styles.formGroup}>
                        <Text style={styles.formLabelText}>Assign to Team *</Text>
                        {data.teams.map(t => (
                          <TouchableOpacity
                            key={t._id}
                            style={[
                              styles.teamSelectBtn,
                              createForm.teamId === t._id && styles.teamSelectBtnActive
                            ]}
                            onPress={() => setCreateForm(f => ({ ...f, teamId: t._id }))}
                          >
                            <Text style={[
                              styles.teamSelectText,
                              createForm.teamId === t._id && styles.teamSelectTextActive
                            ]}>{t.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <View style={styles.formGroup}>
                      <Text style={styles.formLabelText}>Temporary Password * (min 6 chars)</Text>
                      <View style={styles.passwordRow}>
                        <TextInput
                          style={[styles.formInput, { flex: 1 }]}
                          placeholder="Temporary password"
                          placeholderTextColor="#94a3b8"
                          value={createForm.password}
                          onChangeText={(v) => setCreateForm(f => ({ ...f, password: v }))}
                          secureTextEntry={!showPassword}
                          autoCapitalize="none"
                        />
                        <TouchableOpacity onPress={() => setShowPassword(p => !p)} style={styles.eyeBtn}>
                          {showPassword
                            ? <EyeOff size={18} color={colors.secondary} />
                            : <Eye size={18} color={colors.secondary} />
                          }
                        </TouchableOpacity>
                      </View>
                    </View>

                  </View>
                )}
              </ScrollView>

              <View style={styles.modalActions}>
                {createStep > 1 ? (
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={prevStep}>
                    <Text style={styles.modalCancelText}>Previous</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setCreateModal(false)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                )}
                
                {createStep < 3 ? (
                  <TouchableOpacity style={styles.modalCreateBtn} onPress={nextStep}>
                    <Text style={styles.modalCreateText}>Next</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.modalCreateBtn} onPress={handleCreateMember} disabled={creating}>
                    {creating
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.modalCreateText}>Create Member</Text>
                    }
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Dropdown Select Modal ────────────────────────────────────── */}
      <Modal visible={!!selectModal} transparent animationType="fade" onRequestClose={() => setSelectModal(null)}>
        <View style={styles.selectModalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setSelectModal(null)} />
          <View style={styles.selectModalContent}>
            <Text style={styles.selectModalTitle}>{selectModal?.title}</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
              {selectModal?.options?.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={styles.selectModalOption}
                  onPress={() => {
                    setCreateForm(f => ({ ...f, [selectModal.field]: opt }));
                    setSelectModal(null);
                  }}
                >
                  <Text style={[
                    styles.selectModalOptionText,
                    createForm[selectModal?.field] === opt && styles.selectModalOptionTextActive
                  ]}>
                    {opt}
                  </Text>
                  {createForm[selectModal?.field] === opt && <Check size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Member Profile 360 Modal ─────────────────────────────────── */}
      <Member360ProfileModal
        visible={!!profileModal}
        member={profileModal}
        onClose={() => setProfileModal(null)}
      />
    </View>
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
  addBtn: {
    backgroundColor: colors.primary,
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: '#0f172a',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loader: {
    marginTop: 40,
  },
  memberCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  memberInfo: {
    flexDirection: 'row',
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  memberDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  memberRole: {
    fontSize: 13,
    color: colors.secondary,
    marginBottom: 2,
  },
  memberEmail: {
    fontSize: 12,
    color: '#94a3b8',
  },
  deleteBtn: {
    padding: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
  },
  memberFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  teamText: {
    fontSize: 12,
    color: colors.secondary,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#475569',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
  teamGroup: {
    marginBottom: 16,
  },
  teamGroupHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
    marginTop: 8,
  },
  teamGroupTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  teamGroupSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginLeft: 8,
  },
  // Modal & Form
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 20, paddingBottom: 36,
  },
  modalContentLarge: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24,
    maxHeight: '85%',
  },
  formScroll: { marginVertical: 12 },
  stepContainer: { paddingBottom: 20 },
  stepTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalCloseBtn: { padding: 6, backgroundColor: '#f1f5f9', borderRadius: 8 },
  modalSubtitle: { fontSize: 13, color: colors.secondary, marginTop: 4 },
  formGroup: { marginBottom: 14 },
  formLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  formLabelText: { fontSize: 13, fontWeight: '600', color: colors.secondary, marginBottom: 6 },
  teamSelectBtn: {
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
    marginBottom: 8,
  },
  teamSelectBtnActive: { borderColor: colors.primary, backgroundColor: '#ede9fe' },
  teamSelectText: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  teamSelectTextActive: { color: colors.primary },
  formInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, color: '#0f172a', backgroundColor: colors.background,
  },
  formInputSelect: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 14,
    backgroundColor: colors.background,
    justifyContent: 'center'
  },
  formInputSelectText: { fontSize: 14, color: '#0f172a' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: { padding: 10, backgroundColor: colors.background, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
  },
  modalCancelText: { fontSize: 15, fontWeight: '700', color: colors.secondary },
  modalCreateBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: colors.primary,
  },
  modalCreateText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Select Dropdown Modal
  selectModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  selectModalContent: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 15, elevation: 5,
  },
  selectModalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 16, textAlign: 'center' },
  selectModalOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  selectModalOptionText: { fontSize: 15, color: '#475569', fontWeight: '500' },
  selectModalOptionTextActive: { color: colors.primary, fontWeight: '700' },

  // Profile Modal
  profileAvatar: { width: 80, height: 80, borderRadius: 20, marginBottom: 10 },
  profileAvatarPlaceholder: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { fontSize: 36, fontWeight: '800', color: '#fff' },
  profileName: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  profileEmail: { fontSize: 13, color: '#94a3b8', marginBottom: 12 },
  profileStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginBottom: 16,
  },
  profileDetailsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    width: '100%', marginBottom: 16,
  },
  profileDetailItem: {
    width: '50%', padding: 10,
    backgroundColor: colors.background, borderRadius: 12, marginBottom: 8,
  },
  profileDetailLabel: { fontSize: 11, fontWeight: '600', color: colors.secondary, textTransform: 'uppercase', marginBottom: 4 },
  profileDetailValue: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  archiveProfileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12,
    backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca',
  },
  archiveProfileText: { fontSize: 14, fontWeight: '700', color: colors.danger },
});
