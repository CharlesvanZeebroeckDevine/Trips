import { Link, router } from 'expo-router';
import { StyleSheet, TextInput, View, Text, Pressable, Alert, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useState, useCallback } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useMediaStore } from '@/hooks/use-media-store';
import { useTripStore } from '@/hooks/use-trip-store';
import type { MediaItem } from '@/components/types';

export default function ModalScreen() {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<MediaItem[]>([]);
  const upsertMany = useMediaStore((s) => s.upsertMany);
  const addTrip = useTripStore((s) => s.addTrip);

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
    const result = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, mediaTypes: ['images'], exif: true, selectionLimit: 0, quality: 0.7 });
    if (result.canceled) return;
    const enriched: MediaItem[] = await Promise.all(result.assets.map(async (a) => {
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
      return {
        id: a.assetId ?? a.uri,
        uri: a.uri,
        mediaType: a.type ?? 'image',
        filename: (a as any).fileName ?? null,
        creationTime: creationTime ?? fallbackCreation,
        latitude,
        longitude,
      } as MediaItem;
    }));
    setPicked((prev) => [...prev, ...enriched]);
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

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Create Trip</ThemedText>
      <View style={styles.formRow}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Sri Lanka 2025"
          style={styles.input}
        />
      </View>
      <View style={styles.actions}>
        <Pressable onPress={pickImages} style={styles.actionBtn}><Text style={styles.actionText}>Add Photos</Text></Pressable>
        <Pressable onPress={saveTrip} style={[styles.actionBtn, styles.primary]}><Text style={styles.primaryText}>Save</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.previewWrap}>
        {picked.map((p) => (
          <View key={p.id} style={styles.thumb} />
        ))}
      </ScrollView>
      <Link href="/" dismissTo style={styles.link}>
        <ThemedText type="link">Close</ThemedText>
      </Link>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
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
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: '#eee' },
  actionText: { fontWeight: '600' },
  primary: { backgroundColor: '#1e88e5' },
  primaryText: { color: 'white', fontWeight: '700' },
  previewWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 16 },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#ddd' },
});
