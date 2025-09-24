import { useLocalSearchParams, Link } from 'expo-router';
import { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Image } from 'expo-image';
import { useTripStore } from '@/hooks/use-trip-store';
import { useMediaStore } from '@/hooks/use-media-store';
import type { MediaItem } from '@/components/types';

export default function TripDetailsScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const trip = useTripStore((s) => s.trips.find((t) => t.id === id));
    const addMediaToTrip = useTripStore((s) => s.addMediaToTrip);
    const removeMediaFromTrip = useTripStore((s) => s.removeMediaFromTrip);
    const media = useMediaStore((s) => s.items);
    const upsertMany = useMediaStore((s) => s.upsertMany);

    const items = useMemo(() => media.filter((m) => trip?.mediaIds.includes(m.id)), [media, trip]);
    const dateRange = useMemo(() => {
        const times = items.map((m) => m.creationTime ?? 0).filter(Boolean).sort((a, b) => a - b);
        if (!times.length) return null;
        return { start: new Date(times[0]), end: new Date(times[times.length - 1]) };
    }, [items]);

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

    const addPhotos = useCallback(async () => {
        const mediaPerm = await MediaLibrary.requestPermissionsAsync();
        const pickPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!(mediaPerm.status === 'granted' && pickPerm.status === 'granted')) {
            Alert.alert('Permissions required');
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
                tripId: id,
            } as MediaItem;
        }));
        upsertMany(enriched.map(e => ({ ...e, tripId: id })));
        addMediaToTrip(id!, enriched.map((e) => e.id));
    }, [id, upsertMany, addMediaToTrip]);

    if (!trip) {
        return (
            <View style={styles.container}>
                <Text>Trip not found</Text>
                <Link href="/" dismissTo><Text style={styles.link}>Back</Text></Link>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{trip.name}</Text>
                {dateRange && (
                    <Text style={styles.subtitle}>
                        {dateRange.start.toLocaleDateString()} – {dateRange.end.toLocaleDateString()}
                    </Text>
                )}
            </View>
            <View style={styles.actions}>
                <Pressable onPress={addPhotos} style={[styles.actionBtn, styles.primary]}><Text style={styles.primaryText}>Add Photos</Text></Pressable>
                <Link href="/" dismissTo asChild>
                    <Pressable style={styles.actionBtn}><Text style={styles.actionText}>Close</Text></Pressable>
                </Link>
            </View>
            <FlatList
                data={items}
                keyExtractor={(i) => i.id}
                numColumns={3}
                columnWrapperStyle={{ gap: 8 }}
                contentContainerStyle={{ gap: 8, padding: 12 }}
                renderItem={({ item }) => (
                    <View style={styles.gridItem}>
                        <Image source={{ uri: item.uri }} style={styles.gridPhoto} contentFit="cover" />
                        <Pressable onPress={() => removeMediaFromTrip(trip.id, item.id)} style={styles.removeBadge}>
                            <Text style={styles.removeText}>×</Text>
                        </Pressable>
                    </View>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'white' },
    header: { paddingHorizontal: 16, paddingTop: 16 },
    title: { fontSize: 20, fontWeight: '700' },
    subtitle: { marginTop: 4, color: '#666' },
    actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    actionBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: '#eee' },
    actionText: { fontWeight: '600' },
    primary: { backgroundColor: '#1e88e5' },
    primaryText: { color: 'white', fontWeight: '700' },
    gridItem: { position: 'relative', width: '32%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: '#f2f2f2' },
    gridPhoto: { width: '100%', height: '100%' },
    removeBadge: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    removeText: { color: 'white', fontWeight: '700' },
    link: { color: '#1e88e5', marginTop: 12 },
});
