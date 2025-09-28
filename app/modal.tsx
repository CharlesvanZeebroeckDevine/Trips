import { Link, router } from 'expo-router';
import { StyleSheet, TextInput, View, Text, Pressable, Alert, ScrollView, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useState, useCallback } from 'react';
import { Image } from 'expo-image';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useMediaStore } from '@/hooks/use-media-store';
import { useTripStore } from '@/hooks/use-trip-store';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAppTheme } from '@/hooks/use-app-theme';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { MediaItem } from '@/components/types';

export default function ModalScreen() {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const upsertMany = useMediaStore((s) => s.upsertMany);
  const addTrip = useTripStore((s) => s.addTrip);

  // Theme colors using the new comprehensive theme system
  const theme = useAppTheme();
  const textColor = theme.colors.text;
  const backgroundColor = theme.colors.background;
  const borderColor = theme.colors.border;

  // Glass effect availability
  const isGlassAvailable = isLiquidGlassAvailable();

  // Dynamic styles with theme colors
  const dynamicStyles = {
    actionBtn: {
      ...styles.actionBtn,
    },
    primary: {
      ...styles.primary,
      backgroundColor: theme.colors.primary,
    },
    thumb: {
      ...styles.thumb,
      backgroundColor: theme.colors.backgroundTertiary,
    },
    removeBtn: {
      ...styles.removeBtn,
      backgroundColor: theme.colors.danger,
    },
  };

  const ensurePermissions = useCallback(async () => {
    const media = await MediaLibrary.requestPermissionsAsync();
    const pick = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return media.status === 'granted' && pick.status === 'granted';
  }, []);

  const extractGpsFromExif = (exif: Record<string, any> | undefined | null) => {
    if (!exif) return { latitude: null, longitude: null };
    const lat = exif.GPSLatitude ?? exif.gpsLatitude ?? null;
    const lon = exif.GPSLongitude ?? exif.gpsLongitude ?? null;
    const latRef = exif.GPSLatitudeRef;
    const lonRef = exif.GPSLongitudeRef;
    const normalize = (value: any, ref?: string) => {
      if (value == null) return null;
      if (Array.isArray(value)) {
        const [d, m, s] = value;
        const decimal = Number(d) + Number(m) / 60 + Number(s) / 3600;
        return (ref === 'S' || ref === 'W') ? -decimal : decimal;
      }
      const num = Number(value);
      if (isNaN(num)) return null;
      return (ref === 'S' || ref === 'W') ? -num : num;
    };
    return { latitude: normalize(lat, latRef), longitude: normalize(lon, lonRef) };
  };

  const pickImages = useCallback(async () => {
    const ok = await ensurePermissions();
    if (!ok) {
      Alert.alert('Permissions required', 'Enable Photos access in Settings.');
      return;
    }

    setIsLoading(true);
    setLoadingProgress(0);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        exif: true,
        selectionLimit: 0,
        quality: 0.3, // Reduced quality for faster processing
        allowsEditing: false,
      });

      if (result.canceled) {
        setIsLoading(false);
        return;
      }

      const total = result.assets.length;
      const enriched: MediaItem[] = [];

      for (let i = 0; i < result.assets.length; i++) {
        const a = result.assets[i];
        setLoadingProgress(Math.round((i / total) * 100));

        try {
          let latitude: number | null = null;
          let longitude: number | null = null;
          let creationTime: number | null | undefined = null;

          if (a.assetId) {
            try {
              const info = await MediaLibrary.getAssetInfoAsync(a.assetId);
              if (info && (info as any).location) {
                const loc = (info as any).location;
                latitude = typeof loc.latitude === 'number' ? loc.latitude : null;
                longitude = typeof loc.longitude === 'number' ? loc.longitude : null;
              } else if ((info as any).exif) {
                const gps = extractGpsFromExif((info as any).exif);
                latitude = gps.latitude;
                longitude = gps.longitude;
              }
              creationTime = (info as any).creationTime ?? null;
            } catch { }
          }

          if ((latitude == null || longitude == null) && (a as any).exif) {
            const gps = extractGpsFromExif((a as any).exif as Record<string, any>);
            latitude = gps.latitude;
            longitude = gps.longitude;
          }

          const fallbackCreation = (a as any).creationTime ?? Date.now();

          enriched.push({
            id: a.assetId ?? a.uri,
            uri: a.uri,
            mediaType: a.type ?? 'image',
            filename: (a as any).fileName ?? null,
            creationTime: creationTime ?? fallbackCreation,
            latitude,
            longitude,
          } as MediaItem);

          // Add small delay to prevent UI blocking
          if (i % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        } catch (error) {
          console.warn('Failed to process image:', error);
        }
      }

      setPicked((prev) => [...prev, ...enriched]);
      setLoadingProgress(100);
    } catch (error) {
      Alert.alert('Error', 'Failed to load images');
    } finally {
      setIsLoading(false);
    }
  }, [ensurePermissions]);

  const saveTrip = useCallback(() => {
    const nameTrim = name.trim();
    if (!nameTrim) {
      Alert.alert('Trip name required');
      return;
    }
    if (picked.length === 0) {
      Alert.alert('Add at least one photo');
      return;
    }
    const tripId = `${Date.now()}`;
    upsertMany(picked.map(p => ({ ...p, tripId })));
    addTrip({ id: tripId, name: nameTrim, mediaIds: picked.map(p => p.id), createdAt: Date.now() });
    Alert.alert('Trip created', undefined, [{ text: 'OK', onPress: () => router.dismiss() }]);
  }, [name, picked, upsertMany, addTrip]);

  const removeImage = useCallback((id: string) => {
    setPicked(prev => prev.filter(p => p.id !== id));
  }, []);

  return (
    <View style={styles.modalOverlay}>
      {isGlassAvailable ? (
        <GlassView
          style={styles.modalContainer}
          glassEffectStyle="regular"
          isInteractive={true}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: textColor }]}>Create Trip</Text>
            <Pressable onPress={() => router.dismiss()} style={styles.closeButton}>
              <Text style={[styles.closeButtonText, { color: textColor }]}>×</Text>
            </Pressable>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.formRow}>
              <Text style={[styles.label, { color: textColor }]}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Sri Lanka 2025"
                style={[
                  styles.input,
                  {
                    color: textColor,
                    backgroundColor: backgroundColor,
                    borderColor: borderColor,
                  }
                ]}
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>

            <View style={styles.actions}>
              <GlassView
                style={[dynamicStyles.actionBtn, isLoading && styles.disabledBtn]}
                glassEffectStyle="regular"
                isInteractive={!isLoading}
              >
                <Pressable
                  onPress={pickImages}
                  style={styles.actionBtnPressable}
                  disabled={isLoading}
                >
                  <Text style={styles.actionText}>
                    {isLoading ? 'Loading...' : 'Add Photos'}
                  </Text>
                </Pressable>
              </GlassView>

              <GlassView
                style={[dynamicStyles.actionBtn, dynamicStyles.primary]}
                glassEffectStyle="regular"
                isInteractive={true}
              >
                <Pressable onPress={saveTrip} style={styles.actionBtnPressable}>
                  <Text style={styles.primaryText}>Save</Text>
                </Pressable>
              </GlassView>
            </View>

            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Processing {loadingProgress}%</Text>
              </View>
            )}

            <ScrollView contentContainerStyle={styles.previewWrap}>
              {picked.map((p) => (
                <View key={p.id} style={styles.thumbContainer}>
                  <Image
                    source={{ uri: p.uri }}
                    style={dynamicStyles.thumb}
                    contentFit="cover"
                    placeholder="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
                  />
                  <Pressable
                    onPress={() => removeImage(p.id)}
                    style={styles.removeBtn}
                  >
                    <Text style={styles.removeText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>

          </View>
        </GlassView>
      ) : (
        <ThemedView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: textColor }]}>Create Trip</Text>
            <Pressable onPress={() => router.dismiss()} style={styles.closeButton}>
              <Text style={[styles.closeButtonText, { color: textColor }]}>×</Text>
            </Pressable>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.formRow}>
              <Text style={[styles.label, { color: textColor }]}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Sri Lanka 2025"
                style={[
                  styles.input,
                  {
                    color: textColor,
                    backgroundColor: backgroundColor,
                    borderColor: borderColor,
                  }
                ]}
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={pickImages}
                style={[dynamicStyles.actionBtn, isLoading && styles.disabledBtn]}
                disabled={isLoading}
              >
                <Text style={styles.actionText}>
                  {isLoading ? 'Loading...' : 'Add Photos'}
                </Text>
              </Pressable>
              <Pressable onPress={saveTrip} style={[dynamicStyles.actionBtn, dynamicStyles.primary]}>
                <Text style={styles.primaryText}>Save</Text>
              </Pressable>
            </View>

            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Processing {loadingProgress}%</Text>
              </View>
            )}

            <ScrollView contentContainerStyle={styles.previewWrap}>
              {picked.map((p) => (
                <View key={p.id} style={styles.thumbContainer}>
                  <Image
                    source={{ uri: p.uri }}
                    style={dynamicStyles.thumb}
                    contentFit="cover"
                    placeholder="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
                  />
                  <Pressable
                    onPress={() => removeImage(p.id)}
                    style={styles.removeBtn}
                  >
                    <Text style={styles.removeText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        </ThemedView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: '60%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'transparent',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalContent: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  formRow: { marginTop: 16 },
  label: { marginBottom: 8, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: '#eee' },
  actionBtnPressable: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionText: { fontWeight: '600' },
  primary: { backgroundColor: '#1e88e5' },
  primaryText: { color: 'white', fontWeight: '700' },
  disabledBtn: { opacity: 0.6 },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
    marginVertical: 12,
  },
  loadingText: { marginTop: 8, fontWeight: '600' },
  previewWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 16 },
  thumbContainer: { position: 'relative' },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#ddd' },
  removeBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ff4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: 'white', fontWeight: '700', fontSize: 12 },
});