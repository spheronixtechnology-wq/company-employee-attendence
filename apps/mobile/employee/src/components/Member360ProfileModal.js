import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  ActivityIndicator, ScrollView, Image, FlatList, Linking, Alert
} from 'react-native';
import {
  X, User, Calendar, FileText, Clock, MapPin, Smartphone, Mail, Phone, Shield, ExternalLink, Download
} from 'lucide-react-native';
import { managerApi } from '../services/api/managerApi';
import DocumentViewerModal from './DocumentViewerModal';
import { useSocket } from '../contexts/SocketContext';

const colors = {
  primary: '#8b5cf6',
  primaryLight: '#ede9fe',
  success: '#10b981',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  danger: '#ef4444',
  dangerLight: '#fee2e2',
  secondary: '#64748b',
  border: '#e2e8f0',
  textDark: '#0f172a',
  background: '#f8fafc',
  card: '#ffffff'
};

const formatHrs = (ms) => {
  if (!ms || ms < 0) return '0h 0m';
  const hrs = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${hrs}h ${m}m`;
};

export default function Member360ProfileModal({ visible, member, onClose }) {
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [loadingDocId, setLoadingDocId] = useState(null);
  const [viewerUrl, setViewerUrl] = useState(null);
  const [viewerName, setViewerName] = useState(null);

  const fetchProfile = useCallback(async () => {
    if (!member?._id) return;
    setLoading(true);
    try {
      const profileRes = await managerApi.getMemberProfile(member._id, 'current_month');
      let leaveBalances = [];
      try {
        const leaveRes = await managerApi.getMemberLeaveBalances(member._id);
        leaveBalances = leaveRes.data?.data?.balances || [];
      } catch (e) {
        // Silently handle leave balances failure
      }
      
      setData(profileRes.data?.data);
      setLeaveBalances(leaveBalances);
    } catch (err) {
      console.error('Failed to load 360 profile:', err);
    } finally {
      setLoading(false);
    }
  }, [member]);

  useEffect(() => {
    if (visible && member) {
      setActiveTab('profile');
      fetchProfile();
    }
  }, [visible, member, fetchProfile]);

  if (!visible || !member) return null;

  const statusColor = member.currentStatus === 'checked_in' ? colors.success :
                      member.currentStatus === 'on_break' ? colors.warning :
                      member.currentStatus === 'checked_out' ? '#3b82f6' : colors.secondary;
  const statusText = member.currentStatus === 'checked_in' ? 'Working' :
                     member.currentStatus === 'on_break' ? 'On Break' :
                     member.currentStatus === 'checked_out' ? 'Checked Out' : 'Offline';

  const renderTabHeader = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabContent}>
      {[
        { id: 'profile', label: 'Profile', icon: User },
        { id: 'attendance', label: 'Attendance', icon: Calendar },
        { id: 'logs', label: 'Daily Logs', icon: FileText },
        { id: 'overtime', label: 'Overtime', icon: Clock },
        { id: 'device', label: 'Device', icon: Smartphone }
      ].map(t => {
        const isActive = activeTab === t.id;
        const Icon = t.icon;
        return (
          <TouchableOpacity key={t.id} style={[styles.tabBtn, isActive && styles.tabBtnActive]} onPress={() => setActiveTab(t.id)}>
            <Icon size={16} color={isActive ? colors.primary : colors.secondary} />
            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const renderProfileTab = () => {
    const fullMember = data?.member || member;
    return (
      <ScrollView style={styles.tabBody} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        
        {/* Personal Information */}
        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Full Name</Text><Text style={styles.infoValue}>{[fullMember?.name, fullMember?.middleName, fullMember?.lastName].filter(Boolean).join(' ') || '—'}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Date of Birth</Text><Text style={styles.infoValue}>{fullMember.dob ? new Date(fullMember.dob).toLocaleDateString() : '—'}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Gender</Text><Text style={styles.infoValue}>{fullMember.gender || '—'}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Current Address</Text><Text style={styles.infoValue}>{fullMember.currentAddress || '—'}</Text></View>
        </View>

        {/* Job Information */}
        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Job Information</Text>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Designation</Text><Text style={styles.infoValue}>{fullMember.designation || '—'}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Department</Text><Text style={styles.infoValue}>{fullMember.department || '—'}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Job Type</Text><Text style={styles.infoValue}>{fullMember.jobType || '—'}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Date of Joining</Text><Text style={styles.infoValue}>{fullMember.joinedDate ? new Date(fullMember.joinedDate).toLocaleDateString() : '—'}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Work Location</Text><Text style={styles.infoValue}>{fullMember.workLocation || '—'} {fullMember.country ? `(${fullMember.country})` : ''}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Office Branch</Text><Text style={styles.infoValue}>{fullMember.officeBranch || '—'}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Team Shift</Text><Text style={styles.infoValue}>{fullMember.teamShift || '—'}</Text></View>
        </View>

        {/* Contact Details */}
        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Contact Details</Text>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Mobile Number</Text><Text style={styles.infoValue}>{fullMember.phone || fullMember.mobileNumber || '—'}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Personal Email</Text><Text style={styles.infoValue}>{fullMember.email || '—'}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Company Email</Text><Text style={styles.infoValue}>{fullMember.companyEmail || '—'}</Text></View>
        </View>

        {/* Emergency Contact */}
        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Emergency Contact</Text>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Contact Name</Text><Text style={styles.infoValue}>{fullMember.emergencyContactName || '—'}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Relationship</Text><Text style={styles.infoValue}>{fullMember.emergencyContactRelation || '—'}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Contact Number</Text><Text style={styles.infoValue}>{fullMember.emergencyContactNumber || '—'}</Text></View>
        </View>

        {/* Leave Balances */}
        <View style={[styles.infoCard, { marginBottom: 40 }]}>
          <Text style={styles.sectionTitle}>Leave Balances</Text>
          {leaveBalances.length > 0 ? (
            <View style={styles.leaveGrid}>
              {leaveBalances.map((bal, idx) => (
                <View key={idx} style={styles.leaveCard}>
                  <Text style={styles.leaveName}>{bal.name}</Text>
                  <Text style={styles.leaveValue}>{bal.remaining} <Text style={styles.leaveValueUnit}>REMAINING</Text></Text>
                  <Text style={styles.leaveAllocated}>/ {bal.allocated} Allocated</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No leave balances found.</Text>
          )}
        </View>

      </ScrollView>
    );
  };

  const renderAttendanceTab = () => {
    const records = data?.attendance?.records || [];
    if (records.length === 0) return <Text style={styles.emptyText}>No attendance records found.</Text>;
    return (
      <FlatList
        data={records}
        keyExtractor={item => item._id}
        renderItem={({ item }) => (
          <View style={styles.listCard}>
            <View style={styles.listCardHeader}>
              <Text style={styles.listDate}>{item.date}</Text>
              <Text style={styles.listDuration}>{item.totalWorkMinutes ? formatHrs(item.totalWorkMinutes * 60000) : '—'}</Text>
            </View>
            <View style={styles.listRow}>
              <View><Text style={styles.listLabel}>Check-In</Text><Text style={styles.listValue}>{item.checkInTime ? new Date(item.checkInTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '—'}</Text></View>
              <View><Text style={styles.listLabel}>Check-Out</Text><Text style={styles.listValue}>{item.checkOutTime ? new Date(item.checkOutTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '—'}</Text></View>
            </View>
          </View>
        )}
      />
    );
  };

  const renderLogsTab = () => {
    const records = data?.dailyLogs?.records || [];
    if (records.length === 0) return <Text style={styles.emptyText}>No daily logs found.</Text>;
    return (
      <FlatList
        data={records}
        keyExtractor={item => item._id}
        renderItem={({ item }) => (
          <View style={styles.listCard}>
            <View style={styles.listCardHeader}>
              <Text style={styles.listDate}>{item.logDate}</Text>
              <Text style={styles.listDuration}>{item.hoursSpent} Hrs</Text>
            </View>
            {!!item.taskTitle && <Text style={{fontWeight: '700', fontSize: 13, marginBottom: 4}}>{item.taskTitle}</Text>}
            {!!item.description && <Text style={styles.logText} numberOfLines={3}>{item.description}</Text>}
            {!!item.blockers && <Text style={{color: colors.warning, fontSize: 12, marginTop: 4}}>Blockers: {item.blockers}</Text>}
            
            {/* GitHub Link */}
            {!!item.githubLink && (
              <TouchableOpacity style={styles.docLink} onPress={() => Linking.openURL(item.githubLink.startsWith('http') ? item.githubLink : `https://${item.githubLink}`)}>
                <ExternalLink size={14} color={colors.primary} />
                <Text style={styles.docLinkText} numberOfLines={1}>{item.githubLink}</Text>
              </TouchableOpacity>
            )}

            {/* Document Attachments */}
            {(!!item.documentUrl || !!item.attachmentUrl || item.hasDocument) && (
              <TouchableOpacity 
                  style={styles.docBtn} 
                  disabled={loadingDocId === item._id}
                  onPress={async () => {
                    if (loadingDocId) return;
                    setLoadingDocId(item._id);
                  let url = item.documentUrl || item.attachmentUrl;
                  if (!url && item.hasDocument && item._id) {
                    try {
                      const res = await managerApi.getDailyLogDocument(item._id);
                      if (res.data?.success && res.data?.data) {
                        url = res.data.data.documentUrl || res.data.data.attachmentUrl;
                      } else {
                        Alert.alert('Error', 'Could not load the document payload from the server.');
                        return;
                      }
                    } catch (e) {
                      Alert.alert('Error', 'Failed to fetch the document. ' + (e.response?.data?.message || ''));
                        setLoadingDocId(null);
                        return;
                      }
                  }
                  if (url) { setViewerUrl(url); setViewerName(item.documentName || 'Document'); setLoadingDocId(null); } else { setLoadingDocId(null); }
                }}
              >
                {loadingDocId === item._id && <ActivityIndicator size="small" color={colors.primary} style={{marginRight: 6}} />}
                <Text style={styles.docBtnText} numberOfLines={1}>{item.documentName || 'Attached Document'}</Text>
                {!!item.documentSize && <Text style={styles.docSizeText}>({(item.documentSize / (1024 * 1024)).toFixed(2)} MB)</Text>}
              </TouchableOpacity>
            )}
          </View>
        )}
      />
    );
  };

  const renderOvertimeTab = () => {
    const records = data?.overtime?.records || [];
    if (records.length === 0) return <Text style={styles.emptyText}>No overtime records found.</Text>;
    return (
      <FlatList
        data={records}
        keyExtractor={item => item._id}
        renderItem={({ item }) => (
          <View style={styles.listCard}>
            <View style={styles.listCardHeader}>
              <Text style={styles.listDate}>{new Date(item.date).toLocaleDateString()}</Text>
              <Text style={[styles.statusBadge, item.status === 'approved' ? {color: colors.success} : {color: colors.warning}]}>
                {item.status.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.listDuration}>{formatHrs(item.durationMinutes * 60000)} Overtime</Text>
            <Text style={styles.logText}>{item.reason}</Text>
          </View>
        )}
      />
    );
  };

  const renderDeviceTab = () => {
    const device = data?.device;
    if (!device) return <Text style={styles.emptyText}>No device information found.</Text>;

    return (
      <ScrollView style={styles.tabBody} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        
        {/* Primary Authorized Device */}
        <View style={styles.infoCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={styles.deviceIconBox}>
              <Smartphone size={22} color="#fff" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.deviceTitle}>{device.deviceLabel || 'Authorized Attendance Mobile'}</Text>
              <View style={styles.deviceStatusBadge}>
                <View style={styles.deviceStatusDot} />
                <Text style={styles.deviceStatusText}>Active Bound Hardware</Text>
              </View>
            </View>
          </View>

          <View style={styles.deviceGrid}>
            <View style={styles.deviceGridItem}>
              <Text style={styles.deviceGridLabel}>MODEL & OS</Text>
              <Text style={styles.deviceGridValue} numberOfLines={1}>{device.deviceLabel?.split('·')[0]?.trim() || 'Android Device'}</Text>
              <Text style={styles.deviceGridSub}>{device.os || 'Android'} · {device.browser || 'Chrome'}</Text>
            </View>
            <View style={styles.deviceGridItem}>
              <Text style={styles.deviceGridLabel}>FINGERPRINT</Text>
              <Text style={styles.deviceGridValue} numberOfLines={1}>{device.deviceFingerprint ? `${device.deviceFingerprint.slice(0, 12)}…` : 'HW-VERIFIED'}</Text>
              <Text style={[styles.deviceGridSub, { color: colors.success }]}>Hardware Locked</Text>
            </View>
            <View style={styles.deviceGridItem}>
              <Text style={styles.deviceGridLabel}>NETWORK IP</Text>
              <Text style={styles.deviceGridValue} numberOfLines={1}>{device.lastPunchIp || '—'}</Text>
              <Text style={styles.deviceGridSub}>Verified Gateway</Text>
            </View>
            <View style={styles.deviceGridItem}>
              <Text style={styles.deviceGridLabel}>BOUND DATE</Text>
              <Text style={styles.deviceGridValue} numberOfLines={1}>{device.registeredAt ? new Date(device.registeredAt).toLocaleDateString() : 'Authorized'}</Text>
              <Text style={styles.deviceGridSub}>{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Active'}</Text>
            </View>
          </View>
        </View>

        {/* Recent Punches */}
        {device.recentPunches && device.recentPunches.length > 0 && (
          <View style={styles.infoCard}>
            <Text style={styles.sectionTitle}>Recent Punch Logs</Text>
            {device.recentPunches.map((punch) => (
              <View key={punch._id} style={styles.punchLogItem}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={styles.punchLogDate}>{punch.date}</Text>
                  <Text style={styles.punchLogMethod}>{punch.method}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.punchLogIp}>IP: {punch.checkInIp || '—'}</Text>
                  <Text style={styles.punchLogVerified}>✓ Hardware Matched</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Device Requests */}
        {device.deviceRequests && device.deviceRequests.length > 0 && (
          <View style={styles.infoCard}>
            <Text style={styles.sectionTitle}>Authorization History</Text>
            {device.deviceRequests.map((req) => (
              <View key={req._id} style={styles.reqItem}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={styles.reqTitle}>{req.requestedDeviceLabel || 'Standard Mobile Device'}</Text>
                  <Text style={[styles.statusBadge, req.status === 'approved' ? {color: colors.success} : {color: colors.warning}]}>
                    {req.status?.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.reqSub}>
                  {req.requestType === 'replacement' ? 'Replacement' : 'Enrollment'} · {new Date(req.createdAt).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </View>
        )}

      </ScrollView>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={24} color={colors.textDark} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>360° Profile</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Profile Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryTop}>
              <View style={styles.avatar}>
                {member.avatarUrl ? (
                  <Image source={{ uri: member.avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarText}>{member.name?.[0]?.toUpperCase()}</Text>
                )}
                <View style={[styles.activeDot, { backgroundColor: statusColor }]} />
              </View>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryName}>{member.name}</Text>
                <Text style={styles.summaryRole}>{member.designation || 'Team Member'}</Text>
                <Text style={styles.summaryTeam}>{member.teamId?.name || 'Unassigned Team'}</Text>
              </View>
            </View>
          </View>

          {/* Tabs */}
          {renderTabHeader()}

          {/* Content */}
          <View style={styles.contentArea}>
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
            ) : (
              <>
                {activeTab === 'profile' && renderProfileTab()}
                {activeTab === 'attendance' && renderAttendanceTab()}
                {activeTab === 'logs' && renderLogsTab()}
                {activeTab === 'overtime' && renderOvertimeTab()}
                {activeTab === 'device' && renderDeviceTab()}
              </>
            )}
          </View>

        </View>
      </View>
      <DocumentViewerModal visible={!!viewerUrl} onClose={() => setViewerUrl(null)} documentUrl={viewerUrl} documentName={viewerName || 'Document'} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    height: '92%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textDark,
  },
  summaryCard: {
    backgroundColor: colors.card,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarImg: {
    width: 64,
    height: 64,
    borderRadius: 20,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  activeDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: '#fff',
  },
  summaryInfo: {
    flex: 1,
  },
  summaryName: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textDark,
    marginBottom: 4,
  },
  summaryRole: {
    fontSize: 14,
    color: colors.secondary,
    fontWeight: '500',
  },
  summaryTeam: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  tabScroll: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    maxHeight: 52,
  },
  tabContent: {
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
    color: colors.secondary,
  },
  tabTextActive: {
    color: colors.primary,
  },
  contentArea: {
    flex: 1,
  },
  tabBody: {
    padding: 16,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoLabel: {
    fontSize: 13,
    color: colors.secondary,
    flexShrink: 0,
    marginRight: 16,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
    flex: 1,
    textAlign: 'right',
  },
  listCard: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  listDate: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
  },
  listDuration: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  listLabel: {
    fontSize: 12,
    color: colors.secondary,
    marginBottom: 2,
  },
  listValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDark,
  },
  logText: {
    fontSize: 14,
    color: colors.secondary,
    lineHeight: 20,
    marginTop: 8,
  },
  docLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  docLinkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
    textDecorationLine: 'underline',
  },
  docBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#f5f3ff', // Light violet background
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#ede9fe',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  docBtnText: {
    color: '#7c3aed', // Deep violet
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8,
  },
  docSizeText: {
    color: '#8b5cf6',
    fontSize: 11,
    marginLeft: 6,
    fontWeight: '600',
    opacity: 0.9,
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: '800',
  },
  emptyText: {
    textAlign: 'center',
    color: colors.secondary,
    marginTop: 40,
    fontSize: 15,
  },
  leaveGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  leaveCard: {
    width: '48%',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  leaveName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.secondary,
    marginBottom: 8,
    textAlign: 'center',
  },
  leaveValue: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.primary,
  },
  leaveValueUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.secondary,
  },
  leaveAllocated: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.secondary,
    marginTop: 4,
  },
  deviceIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textDark,
  },
  deviceStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  deviceStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
    marginRight: 4,
  },
  deviceStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.success,
  },
  deviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  deviceGridItem: {
    width: '48%',
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  deviceGridLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.secondary,
    marginBottom: 2,
  },
  deviceGridValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: 2,
  },
  deviceGridSub: {
    fontSize: 10,
    color: colors.secondary,
  },
  punchLogItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  punchLogDate: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textDark,
  },
  punchLogMethod: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondary,
  },
  punchLogIp: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: colors.secondary,
  },
  punchLogVerified: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
  },
  reqItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reqTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textDark,
  },
  reqSub: {
    fontSize: 11,
    color: colors.secondary,
  }
});
