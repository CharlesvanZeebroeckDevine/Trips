import { useLocalSearchParams, Link, router } from 'expo-router';
import { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Image } from 'expo-image';
import { useTripStore } from '@/hooks/use-trip-store';
import { useMediaStore } from '@/hooks/use-media-store';
import { useThemeColor } from '@/hooks/use-theme-color';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { MediaItem } from '@/components/types';

export default function TripDetailsScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const trip = useTripStore((s) => s.trips.find((t) => t.id === id));
    const addMediaToTrip = useTripStore((s) => s.addMediaToTrip);
    const removeMediaFromTrip = useTripStore((s) => s.removeMediaFromTrip);
    const deleteTrip = useTripStore((s) => s.deleteTrip);
    const media = useMediaStore((s) => s.items);
    const upsertMany = useMediaStore((s) => s.upsertMany);
    const removeMedia = useMediaStore((s) => s.removeMedia);

    // Theme colors
    const textColor = useThemeColor({}, 'text');
    const backgroundColor = useThemeColor({}, 'background');
    const secondaryTextColor = useThemeColor({ light: '#666', dark: '#999' }, 'text');

    // Glass effect availability
    const isGlassAvailable = isLiquidGlassAvailable();

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

    const removePhoto = useCallback((mediaId: string) => {
        // Remove from trip
        removeMediaFromTrip(id!, mediaId);
        // Remove from media store completely
        removeMedia(mediaId);
    }, [id, removeMediaFromTrip, removeMedia]);

    const handleDeleteTrip = useCallback(() => {
        Alert.alert(
            'Delete Trip',
            'Are you sure you want to delete this trip? This action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        // Remove all media from this trip
                        items.forEach(item => removeMedia(item.id));
                        // Delete the trip
                        deleteTrip(id!);
                        // Navigate back
                        router.dismiss();
                    }
                }
            ]
        );
    }, [id, items, removeMedia, deleteTrip]);

    if (!trip) {
        return (
            <View style={styles.modalOverlay}>
                <View style={styles.modalContainer}>
                    <Text style={[styles.title, { color: textColor }]}>Trip not found</Text>
                    <Pressable onPress={() => router.dismiss()} style={styles.closeButton}>
                        <Text style={[styles.closeButtonText, { color: textColor }]}>×</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.modalOverlay}>
            {isGlassAvailable ? (
                <GlassView
                    style={styles.modalContainer}
                    glassEffectStyle="regular"
                    isInteractive={true}
                >
                    <View style={styles.modalHeader}>
                        <View>
                            <Text style={[styles.title, { color: textColor }]}>{trip.name}</Text>
                            {dateRange && (
                                <Text style={[styles.subtitle, { color: secondaryTextColor }]}>
                                    {dateRange.start.toLocaleDateString()} – {dateRange.end.toLocaleDateString()}
                                </Text>
                            )}
                        </View>
                        <Pressable onPress={() => router.dismiss()} style={styles.closeButton}>
                            <Text style={[styles.closeButtonText, { color: textColor }]}>×</Text>
                        </Pressable>
                    </View>

                    <View style={styles.actions}>
                        <GlassView
                            style={[styles.actionBtn, styles.primary]}
                            glassEffectStyle="regular"
                            isInteractive={true}
                        >
                            <Pressable onPress={addPhotos} style={styles.actionBtnPressable}>
                                <Text style={styles.primaryText}>Add Photos</Text>
                            </Pressable>
                        </GlassView>

                        <GlassView
                            style={[styles.actionBtn, styles.danger]}
                            glassEffectStyle="regular"
                            isInteractive={true}
                        >
                            <Pressable onPress={handleDeleteTrip} style={styles.actionBtnPressable}>
                                <Text style={styles.dangerText}>Delete Trip</Text>
                            </Pressable>
                        </GlassView>
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
                                <Pressable onPress={() => removePhoto(item.id)} style={styles.removeBadge}>
                                    <Text style={styles.removeText}>×</Text>
                                </Pressable>
                            </View>
                        )}
                    />
                </GlassView>
            ) : (
                <View style={[styles.modalContainer, { backgroundColor }]}>
                    <View style={styles.modalHeader}>
                        <View>
                            <Text style={[styles.title, { color: textColor }]}>{trip.name}</Text>
                            {dateRange && (
                                <Text style={[styles.subtitle, { color: secondaryTextColor }]}>
                                    {dateRange.start.toLocaleDateString()} – {dateRange.end.toLocaleDateString()}
                                </Text>
                            )}
                        </View>
                        <Pressable onPress={() => router.dismiss()} style={styles.closeButton}>
                            <Text style={[styles.closeButtonText, { color: textColor }]}>×</Text>
                        </Pressable>
                    </View>

                    <View style={styles.actions}>
                        <Pressable onPress={addPhotos} style={[styles.actionBtn, styles.primary]}>
                            <Text style={styles.primaryText}>Add Photos</Text>
                        </Pressable>

                        <Pressable onPress={handleDeleteTrip} style={[styles.actionBtn, styles.danger]}>
                            <Text style={styles.dangerText}>Delete Trip</Text>
                        </Pressable>
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
                                <Pressable onPress={() => removePhoto(item.id)} style={styles.removeBadge}>
                                    <Text style={styles.removeText}>×</Text>
                                </Pressable>
                            </View>
                        )}
                    />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        height: '80%',
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
        alignItems: 'flex-start',
        marginBottom: 20,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 0, 0, 0.1)',
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
    title: { fontSize: 20, fontWeight: '700' },
    subtitle: { marginTop: 4 },
    actions: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
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
    danger: { backgroundColor: '#ff4444' },
    dangerText: { color: 'white', fontWeight: '700' },
    gridItem: { position: 'relative', width: '32%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: '#f2f2f2' },
    gridPhoto: { width: '100%', height: '100%' },
    removeBadge: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    removeText: { color: 'white', fontWeight: '700' },
    link: { color: '#1e88e5', marginTop: 12 },
});
