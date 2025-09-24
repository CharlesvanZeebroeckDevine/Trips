import { Image } from 'expo-image';
import { StyleSheet, View, Text, Dimensions, Pressable, Modal, FlatList, Animated } from 'react-native';
import { Link, router } from 'expo-router';
import { useTripStore } from '@/hooks/use-trip-store';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import { useMemo, useRef, useState } from 'react';
import { useMediaStore } from '@/hooks/use-media-store';
import { useDebouncedClusters } from '@/hooks/use-debounced-clusters';
import { DiaporamaModal } from '@/components/diaporama-modal';
import type { MediaItem } from '@/components/types';

export default function HomeScreen() {
  const media = useMediaStore((s) => s.items);
  const mapRef = useRef<MapView | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [zoom, setZoom] = useState<number>(3);
  const [showListView, setShowListView] = useState(false);
  const [showDiaporama, setShowDiaporama] = useState(false);
  const [diaporamaMedia, setDiaporamaMedia] = useState<MediaItem[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(-300)).current;

  const deriveZoom = (r: Region) => {
    const angle = r.longitudeDelta;
    const z = Math.round(Math.log2(360 / angle));
    return Math.max(0, Math.min(20, z));
  };

  // Filter media based on selected trip
  const filteredMedia = useMemo(() => {
    if (!selectedTripId) return media;
    return media.filter(m => m.tripId === selectedTripId);
  }, [media, selectedTripId]);

  // Use debounced clustering for better performance
  const { clusters, supercluster } = useDebouncedClusters({
    media: filteredMedia,
    region,
    zoom,
    radiusPx: 60,
    minPoints: 2,
    debounceMs: 200
  });

  const { width, height } = Dimensions.get('window');
  const aspect = width / height;
  const trips = useTripStore((s) => s.trips);
  const selectedTrip = useMemo(() => trips.find(t => t.id === selectedTripId) ?? null, [trips, selectedTripId]);
  const selectedTripDates = useMemo(() => {
    if (!selectedTrip) return null;
    const items = media.filter(m => selectedTrip.mediaIds.includes(m.id));
    const times = items.map(m => m.creationTime ?? 0).filter(Boolean).sort((a, b) => a - b);
    if (!times.length) return null;
    return { start: new Date(times[0]), end: new Date(times[times.length - 1]) };
  }, [selectedTrip, media]);

  const trySelectTripForCluster = (clusterId: string) => {
    // With trip-separated clustering, we can directly extract the trip ID from the cluster ID
    try {
      const [tripId] = clusterId.split('-');
      if (tripId) {
        setSelectedTripId(tripId);
      }
    } catch { }
  };

  const deltasForZoom = (z: number) => {
    const lngDelta = 360 / Math.pow(2, z);
    const latDelta = lngDelta / aspect;
    return { latitudeDelta: latDelta, longitudeDelta: lngDelta };
  };

  const regionFromPoints = (pts: { latitude: number; longitude: number }[], paddingFactor = 1.2) => {
    if (!pts.length) return null;
    let minLat = pts[0].latitude, maxLat = pts[0].latitude;
    let minLng = pts[0].longitude, maxLng = pts[0].longitude;
    for (const p of pts) {
      minLat = Math.min(minLat, p.latitude);
      maxLat = Math.max(maxLat, p.latitude);
      minLng = Math.min(minLng, p.longitude);
      maxLng = Math.max(maxLng, p.longitude);
    }
    const latDelta = (maxLat - minLat) * paddingFactor || 0.02;
    const lngDelta = (maxLng - minLng) * paddingFactor || 0.02;
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(latDelta, 0.01),
      longitudeDelta: Math.max(lngDelta, 0.01),
    } as Region;
  };

  const openListView = () => {
    setShowListView(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeListView = () => {
    Animated.timing(slideAnim, {
      toValue: -300,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowListView(false);
    });
  };

  const selectTripFromList = (tripId: string) => {
    closeListView();
    setSelectedTripId(tripId);

    // Find the trip and zoom to its photos
    const trip = trips.find(t => t.id === tripId);
    if (trip) {
      const tripMedia = media.filter(m => trip.mediaIds.includes(m.id));
      const pointsWithLocation = tripMedia
        .filter(m => m.latitude != null && m.longitude != null)
        .map(m => ({ latitude: m.latitude!, longitude: m.longitude! }));

      if (pointsWithLocation.length > 0) {
        const fitRegion = regionFromPoints(pointsWithLocation);
        if (fitRegion) {
          mapRef.current?.animateToRegion(fitRegion, 1000);
        }
      }
    }
  };

  const openDiaporama = (clusterId: string) => {
    if (!supercluster || !(supercluster instanceof Map)) return;

    try {
      // Extract trip ID and numeric cluster ID from the combined ID
      const [tripId, numericClusterId] = clusterId.split('-');
      const tripCluster = supercluster.get(tripId);

      if (!tripCluster) return;

      const leaves: any[] = tripCluster.getLeaves(parseInt(numericClusterId), 50);
      const clusterMedia: MediaItem[] = leaves
        .map((leaf: any) => leaf?.properties?.media as MediaItem)
        .filter((media: MediaItem) => media && media.uri);

      if (clusterMedia.length > 0) {
        setDiaporamaMedia(clusterMedia);
        setShowDiaporama(true);
      }
    } catch (error) {
      console.warn('Failed to get cluster media:', error);
    }
  };

  const closeDiaporama = () => {
    setShowDiaporama(false);
    setDiaporamaMedia([]);
  };

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={{
          latitude: 50.8503,
          longitude: 4.3517,
          latitudeDelta: 20,
          longitudeDelta: 20,
        }}
        ref={(r) => { mapRef.current = r; }}
        onRegionChangeComplete={(r) => {
          setRegion(r);
          setZoom(deriveZoom(r));
        }}
        onPress={(e) => {
          // Only unselect if tapping empty map area (not on markers)
          if (selectedTripId && e.nativeEvent.action !== 'marker-press') {
            setSelectedTripId(null);
          }
        }}
      >
        {clusters.map((c) => {
          if (c.isCluster) {
            return (
              <Marker
                key={`cluster-${c.id}`}
                coordinate={{ latitude: c.latitude, longitude: c.longitude }}
                onPress={() => openDiaporama(c.id as string)}
              >
                <View style={styles.clusterContainer}>
                  <View style={styles.clusterBadge}>
                    <Text style={styles.clusterBadgeText}>{c.count}</Text>
                  </View>
                  <View style={styles.photoMarker}>
                    <Image
                      source={{
                        uri: (() => {
                          try {
                            if (!supercluster || !(supercluster instanceof Map)) return undefined;
                            const [tripId, numericClusterId] = (c.id as string).split('-');
                            const tripCluster = supercluster.get(tripId);
                            if (!tripCluster) return undefined;
                            const leaf: any = tripCluster.getLeaves(parseInt(numericClusterId), 1)[0];
                            return leaf?.properties?.media?.uri as string | undefined;
                          } catch {
                            return undefined as unknown as string;
                          }
                        })()
                      }}
                      style={styles.photo}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={200}
                    />
                  </View>
                </View>
              </Marker>
            );
          }
          const p = c.media!;
          return (
            <Marker key={p.id} coordinate={{ latitude: p.latitude as number, longitude: p.longitude as number }} onPress={() => {
              if (p.tripId) setSelectedTripId(p.tripId);
            }}>
              <View style={styles.photoMarker}>
                <Image
                  source={{ uri: p.uri }}
                  style={styles.photo}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                />
              </View>
            </Marker>
          );
        })}
      </MapView>
      {selectedTrip && (
        <View style={styles.tripHeader} pointerEvents="box-none">
          <View style={styles.tripHeaderInner}>
            <Text style={styles.tripTitle}>{selectedTrip.name}</Text>
            {selectedTripDates && (
              <Text style={styles.tripSubtitle}>
                {selectedTripDates.start.toLocaleDateString()} – {selectedTripDates.end.toLocaleDateString()}
              </Text>
            )}
          </View>
          <View style={styles.tripActions}>
            <Pressable style={styles.tripEditBtn} onPress={() => router.push(`/trip/${selectedTrip.id}`)}>
              <Text style={styles.tripEditText}>Edit</Text>
            </Pressable>
            <Pressable style={styles.tripClearBtn} onPress={() => setSelectedTripId(null)}>
              <Text style={styles.tripClearText}>Show All</Text>
            </Pressable>
          </View>
        </View>
      )}
      {/* Toggle Buttons */}
      <View style={styles.toggleContainer}>
        <Pressable style={[styles.toggleBtn, !showListView && styles.toggleBtnActive]} onPress={closeListView}>
          <Text style={[styles.toggleText, !showListView && styles.toggleTextActive]}>Map</Text>
        </Pressable>
        <Pressable style={[styles.toggleBtn, showListView && styles.toggleBtnActive]} onPress={openListView}>
          <Text style={[styles.toggleText, showListView && styles.toggleTextActive]}>List</Text>
        </Pressable>
      </View>

      <Link href="/modal" asChild>
        <Pressable style={styles.fab}>
          <Text style={styles.fabText}>Add Trip</Text>
        </Pressable>
      </Link>

      {/* List View Modal */}
      <Modal
        visible={showListView}
        transparent={true}
        animationType="none"
        onRequestClose={closeListView}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeListView} />
          <Animated.View style={[styles.listModal, { transform: [{ translateX: slideAnim }] }]}>
            <View style={styles.listHeader}>
              <View>
                <Text style={styles.listTitle}>
                  {selectedTripId ? `Photos from ${selectedTrip?.name}` : 'Your Trips'}
                </Text>
                {selectedTripId && (
                  <Text style={styles.listSubtitle}>
                    Showing only photos from this trip
                  </Text>
                )}
              </View>
              <Pressable onPress={closeListView} style={styles.closeBtn}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            <FlatList
              data={trips}
              keyExtractor={(item) => item.id}
              renderItem={({ item: trip }) => {
                const tripMedia = media.filter(m => trip.mediaIds.includes(m.id));

                // Calculate trip dates
                const times = tripMedia.map(m => m.creationTime ?? 0).filter(Boolean).sort((a, b) => a - b);
                const tripDates = times.length > 0 ? {
                  start: new Date(times[0]),
                  end: new Date(times[times.length - 1])
                } : null;

                const firstPhoto = tripMedia.find(m => m.uri);

                return (
                  <Pressable
                    style={[
                      styles.tripCard,
                      selectedTripId === trip.id && styles.tripCardSelected
                    ]}
                    onPress={() => selectTripFromList(trip.id)}
                  >
                    <View style={styles.tripCardContent}>
                      <View style={styles.tripImageContainer}>
                        {firstPhoto ? (
                          <Image
                            source={{ uri: firstPhoto.uri }}
                            style={styles.tripImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                          />
                        ) : (
                          <View style={[styles.tripImage, styles.tripImagePlaceholder]}>
                            <Text style={styles.placeholderText}>📷</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.tripInfo}>
                        <Text style={styles.tripName}>{trip.name}</Text>
                        {tripDates && (
                          <Text style={styles.tripDate}>
                            {tripDates.start.toLocaleDateString()} – {tripDates.end.toLocaleDateString()}
                          </Text>
                        )}
                        <Text style={styles.tripCount}>{tripMedia.length} photos</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              }}
              contentContainerStyle={styles.listContent}
            />
          </Animated.View>
        </View>
      </Modal>

      {/* Diaporama Modal */}
      <DiaporamaModal
        visible={showDiaporama}
        onClose={closeDiaporama}
        media={diaporamaMedia}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  photoMarker: {
    width: 84,
    height: 84,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'white',
    backgroundColor: '#ddd',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  photo: { width: '100%', height: '100%' },
  clusterContainer: { alignItems: 'center', justifyContent: 'center' },
  clusterBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: '#1e88e5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  clusterBadgeText: { color: 'white', fontWeight: '700', fontSize: 12 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 32,
    backgroundColor: '#1e88e5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: { color: 'white', fontWeight: '700' },
  tripHeader: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tripHeaderInner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  tripTitle: { fontWeight: '700', fontSize: 16 },
  tripSubtitle: { color: '#666', marginTop: 2 },
  tripActions: {
    flexDirection: 'row',
    gap: 8,
  },
  tripEditBtn: { backgroundColor: '#1e88e5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  tripEditText: { color: 'white', fontWeight: '700' },
  tripClearBtn: { backgroundColor: '#666', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  tripClearText: { color: 'white', fontWeight: '700' },
  // Toggle buttons
  toggleContainer: {
    position: 'absolute',
    top: 32,
    left: 16,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  toggleBtnActive: {
    backgroundColor: '#1e88e5',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  toggleTextActive: {
    color: 'white',
  },
  // List modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  modalBackdrop: {
    flex: 1,
  },
  listModal: {
    width: 300,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: -2, height: 0 },
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  listSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#666',
  },
  listContent: {
    padding: 16,
  },
  tripCard: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#f8f9fa',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  tripCardSelected: {
    backgroundColor: '#e3f2fd',
    borderWidth: 2,
    borderColor: '#1e88e5',
  },
  tripCardContent: {
    flexDirection: 'row',
    padding: 12,
  },
  tripImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 12,
  },
  tripImage: {
    width: '100%',
    height: '100%',
  },
  tripImagePlaceholder: {
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 24,
  },
  tripInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  tripName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  tripDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  tripCount: {
    fontSize: 12,
    color: '#1e88e5',
    fontWeight: '600',
  },
});