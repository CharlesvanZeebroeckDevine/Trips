import { Image } from 'expo-image';
import { StyleSheet, View, Text, Dimensions, Pressable } from 'react-native';
import { Link, router } from 'expo-router';
import { useTripStore } from '@/hooks/use-trip-store';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import { useMemo, useRef, useState } from 'react';
import { useMediaStore } from '@/hooks/use-media-store';
import { useClusters } from '@/hooks/use-clusters';

export default function HomeScreen() {
  const media = useMediaStore((s) => s.items);
  const mapRef = useRef<MapView | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [zoom, setZoom] = useState<number>(3);

  const deriveZoom = (r: Region) => {
    const angle = r.longitudeDelta;
    const z = Math.round(Math.log2(360 / angle));
    return Math.max(0, Math.min(20, z));
  };

  const { clusters, supercluster } = useClusters({ media, region, zoom, radiusPx: 60, minPoints: 2 });
  const { width, height } = Dimensions.get('window');
  const aspect = width / height;
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const trips = useTripStore((s) => s.trips);
  const selectedTrip = useMemo(() => trips.find(t => t.id === selectedTripId) ?? null, [trips, selectedTripId]);
  const selectedTripDates = useMemo(() => {
    if (!selectedTrip) return null;
    const items = media.filter(m => selectedTrip.mediaIds.includes(m.id));
    const times = items.map(m => m.creationTime ?? 0).filter(Boolean).sort((a, b) => a - b);
    if (!times.length) return null;
    return { start: new Date(times[0]), end: new Date(times[times.length - 1]) };
  }, [selectedTrip, media]);

  const trySelectTripForCluster = (clusterId: number) => {
    if (!supercluster) return;
    try {
      const leaves: any[] = supercluster.getLeaves(clusterId, 50);
      const tripIds = new Set<string>();
      for (const leaf of leaves) {
        const tid = leaf?.properties?.media?.tripId as string | undefined;
        if (tid) tripIds.add(tid);
        if (tripIds.size > 1) break;
      }
      if (tripIds.size === 1) {
        const [tid] = Array.from(tripIds);
        setSelectedTripId(tid);
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
                onPress={() => {
                  if (!supercluster) return;
                  try {
                    // Try to fit children bounds to ensure the split
                    const children: any[] = supercluster.getChildren(c.id as number);
                    const childPoints = children.map((child: any) => {
                      const [lng, lat] = child.geometry.coordinates as [number, number];
                      return { latitude: lat, longitude: lng };
                    });
                    const fit = regionFromPoints(childPoints);
                    if (fit) {
                      mapRef.current?.animateToRegion(fit, 300);
                      // Attempt to select trip if all items belong to one
                      trySelectTripForCluster(c.id as number);
                      return;
                    }
                  } catch { }
                  // Fallback: expansion zoom + 1 to force split
                  const expansionZoom = supercluster.getClusterExpansionZoom(c.id as number);
                  const targetZoom = Math.min(expansionZoom + 1, 20);
                  const deltas = deltasForZoom(targetZoom);
                  mapRef.current?.animateToRegion({ latitude: c.latitude, longitude: c.longitude, ...deltas }, 300);
                  trySelectTripForCluster(c.id as number);
                }}
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
                            const leaf: any = supercluster!.getLeaves(c.id as number, 1)[0];
                            return leaf?.properties?.media?.uri as string | undefined;
                          } catch {
                            return undefined as unknown as string;
                          }
                        })()
                      }}
                      style={styles.photo}
                      contentFit="cover"
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
                <Image source={{ uri: p.uri }} style={styles.photo} contentFit="cover" />
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
          <Pressable style={styles.tripEditBtn} onPress={() => router.push(`/trip/${selectedTrip.id}`)}>
            <Text style={styles.tripEditText}>Edit</Text>
          </Pressable>
        </View>
      )}
      <Link href="/modal" asChild>
        <Pressable style={styles.fab}>
          <Text style={styles.fabText}>Add Trip</Text>
        </Pressable>
      </Link>
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
  tripEditBtn: { backgroundColor: '#1e88e5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  tripEditText: { color: 'white', fontWeight: '700' },
});
