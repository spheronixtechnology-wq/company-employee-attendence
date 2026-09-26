import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  Platform,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Linking
} from 'react-native';
import { X, Download, FileText } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';

const colors = {
  primary: '#8b5cf6',
  white: '#ffffff',
  slate900: '#0f172a',
  slate600: '#475569',
  slate200: '#e2e8f0',
  slate50: '#f8fafc',
};

export default function DocumentViewerModal({
  visible,
  onClose,
  documentUrl,
  documentName,
}) {
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  if (!visible || !documentUrl) return null;

  // Determine if it's an image
  const isImage = documentUrl.match(/\.(jpeg|jpg|gif|png)$/i) || 
                  (documentName && documentName.match(/\.(jpeg|jpg|gif|png)$/i));

  // Determine if it's a webpage
  const isWebpage = documentUrl.includes('github.com') || 
                    (!documentUrl.includes('supabase.co') && !documentName?.match(/\.(pdf|doc|docx|xls|xlsx|csv|txt)$/i));

  // Determine preview URL for WebView
  let previewUrl = documentUrl;
  if (Platform.OS === 'android' && !isImage && !isWebpage) {
    // Android WebView cannot render PDFs/Docs directly, wrap it in Google Docs Viewer
    previewUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(documentUrl)}`;
  }

    const handleDownload = async () => {
    try {
      setDownloading(true);

      // 1. If it's a direct webpage (like GitHub), just open it in the browser
      if (isWebpage) {
        await Linking.openURL(documentUrl);
        setDownloading(false);
        return;
      }

      let ext = 'file';
      if (documentName) {
        const parts = documentName.split('.');
        if (parts.length > 1) ext = parts[parts.length - 1].toLowerCase();
      }

      const fileName = documentName ? documentName.replace(/[^a-zA-Z0-9.\-_]/g, '_') : `document_${Date.now()}.${ext}`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      // 2. Download the file locally to app cache
      if (documentUrl.startsWith('data:')) {
        const base64Data = documentUrl.split(',')[1];
        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        const downloadRes = await FileSystem.downloadAsync(documentUrl, fileUri);
        if (downloadRes.status !== 200) {
          throw new Error('Download failed from server.');
        }
      }

      // 3. Save to device
      let mimeType = 'application/octet-stream';
      if (ext === 'pdf') mimeType = 'application/pdf';
      else if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) mimeType = `image/${ext}`;
      else if (['doc', 'docx'].includes(ext)) mimeType = 'application/msword';

      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const base64Data = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
          const newFileUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, fileName, mimeType);
          await FileSystem.writeAsStringAsync(newFileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
          
          // Attempt to open the saved file natively using an Intent
          try {
            await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
              data: newFileUri,
              flags: 1,
              type: mimeType
            });
          } catch (e) {
            Alert.alert('Success', 'Document successfully downloaded to your device! Check your files app to open it.');
          }
        }
      } else {
        await Sharing.shareAsync(fileUri, { 
          mimeType, 
          dialogTitle: 'Download Document',
          UTI: 'public.item'
        });
      }

    } catch (err) {
      console.error('Download error:', err);
      Alert.alert('Download Failed', 'Could not open or save the document. ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            <View style={styles.iconBox}>
              <FileText size={20} color={colors.primary} />
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {documentName || 'Document Preview'}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={colors.slate600} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {isImage ? (
            <View style={styles.imageContainer}>
              <Image 
                source={{ uri: documentUrl }} 
                style={styles.image} 
                resizeMode="contain" 
                onLoad={() => setLoading(false)}
              />
              {loading && <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />}
            </View>
          ) : (
            <View style={styles.webviewContainer}>
              <WebView
                source={{ uri: previewUrl }}
                style={styles.webview}
                onLoadEnd={() => setLoading(false)}
                startInLoadingState={true}
                renderLoading={() => (
                  <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
                )}
                onError={() => {
                  setLoading(false);
                }}
              />
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity 
            style={styles.downloadButton} 
            onPress={handleDownload}
            disabled={downloading}
          >
            {downloading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Download size={20} color={colors.white} />
                <Text style={styles.downloadText}>Download & Open</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.slate900,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f5f3ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.slate900,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    backgroundColor: colors.slate50,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  webviewContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loader: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -18,
    marginTop: -18,
  },
  footer: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
  },
  downloadButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  downloadText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  androidDocContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.slate50,
  },
  androidDocTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.slate900,
    marginBottom: 8,
  },
  androidDocDesc: {
    fontSize: 14,
    color: colors.slate600,
    textAlign: 'center',
    lineHeight: 20,
  },
});
