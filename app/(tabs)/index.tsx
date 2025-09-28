import { Image } from 'expo-image';
import { StyleSheet, View, Text, Dimensions, Pressable, Modal, FlatList, Animated, Alert } from 'react-native';
import { Link, router } from 'expo-router';
import { useTripStore } from '@/hooks/use-trip-store';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import { useMemo, useRef, useState, useCallback } from 'react';
import { useMediaStore } from '@/hooks/use-media-store';
import { useDebouncedClusters } from '@/hooks/use-debounced-clusters';
import { DiaporamaModal } from '@/components/diaporama-modal';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAppTheme } from '@/hooks/use-app-theme';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import type { MediaItem } from '@/components/types';

export default function HomeScreen() {
  const media = useMediaStore((s) => s.items);
  const mapRef = useRef<MapView | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [zoom, setZoom] = useState<number>(3);
  const [showListView, setShowListView] = useState(false);
  const [showDiaporama, setShowDiaporama] = useState(false);
  const [showTripEdit, setShowTripEdit] = useState(false);
  const [diaporamaMedia, setDiaporamaMedia] = useState<MediaItem[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [polylineUpdateKey, setPolylineUpdateKey] = useState(0);
  const [clusterUpdateKey, setClusterUpdateKey] = useState(0);
  const slideAnim = useRef(new Animated.Value(-300)).current;

  // Theme colors using the new comprehensive theme system
  const theme = useAppTheme();
  const textColor = theme.colors.text;
  const backgroundColor = theme.colors.background;
  const borderColor = theme.colors.border;
  const cardBackgroundColor = theme.colors.backgroundSecondary;
  const selectedCardBackgroundColor = theme.colors.primaryLight;
  const headerBackgroundColor = theme.colors.glassBackground;
  const toggleBackgroundColor = theme.colors.glassBackground;
  const secondaryTextColor = theme.colors.textSecondary;

  // Glass effect availability
  const isGlassAvailable = isLiquidGlassAvailable();

  // Dynamic styles with theme colors
  const dynamicStyles = {
    clusterBadge: {
      ...styles.clusterBadge,
      backgroundColor: theme.colors.primary,
      shadowColor: theme.colors.shadow,
    },
    fab: {
      ...styles.fab,
      backgroundColor: theme.colors.primary,
      shadowColor: theme.colors.shadow,
    },
    tripEditBtn: {
      ...styles.tripEditBtn,
      backgroundColor: 'transparent', // Let glass effect show through
    },
    tripClearBtn: {
      ...styles.tripClearBtn,
      backgroundColor: 'transparent', // Let glass effect show through
    },
    tripCardSelected: {
      ...styles.tripCardSelected,
      borderColor: theme.colors.primary,
    },
    tripCount: {
      ...styles.tripCount,
      color: theme.colors.primary,
    },
    primary: {
      ...styles.primary,
      backgroundColor: theme.colors.primary,
    },
    danger: {
      ...styles.danger,
      backgroundColor: theme.colors.danger,
    },
    tripEditGridItem: {
      ...styles.tripEditGridItem,
      backgroundColor: theme.colors.backgroundTertiary,
    },
  };

  const deriveZoom = (r: Region) => {
    const angle = r.longitudeDelta;
    const z = Math.round(Math.log2(360 / angle));
    return Math.max(0, Math.min(20, z));
  };

  // Filter media based on selected trip
  const filteredMedia = useMemo(() => {
    if (!selectedTripId) return media;
    return media.filter(m => m.tripId === selectedTripId);
  }, [media, selectedTripId, clusterUpdateKey]);

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
  const addMediaToTrip = useTripStore((s) => s.addMediaToTrip);
  const removeMediaFromTrip = useTripStore((s) => s.removeMediaFromTrip);
  const deleteTrip = useTripStore((s) => s.deleteTrip);
  const upsertMany = useMediaStore((s) => s.upsertMany);
  const removeMedia = useMediaStore((s) => s.removeMedia);
  const selectedTrip = useMemo(() => trips.find(t => t.id === selectedTripId) ?? null, [trips, selectedTripId]);
  const selectedTripDates = useMemo(() => {
    if (!selectedTrip) return null;
    const items = media.filter(m => selectedTrip.mediaIds.includes(m.id));
    const times = items.map(m => m.creationTime ?? 0).filter(Boolean).sort((a, b) => a - b);
    if (!times.length) return null;
    return { start: new Date(times[0]), end: new Date(times[times.length - 1]) };
  }, [selectedTrip, media]);

  // Calculate trip polylines based on zoom level and clusters
  const tripPolylines = useMemo(() => {
    if (!region) return [];

    // Get trips to process - either selected trip or all trips
    const tripsToProcess = selectedTrip ? [selectedTrip] : trips;
    const allPolylines: { coordinates: { latitude: number; longitude: number }[]; tripId: string }[] = [];

    tripsToProcess.forEach(trip => {
      // Skip if trip is null or undefined (defensive programming)
      if (!trip || !trip.id) return;

      // Ensure the trip still exists in the trips array (defensive against race conditions)
      if (!trips.find(t => t.id === trip.id)) return;

      // Filter media that belongs to this specific trip
      const tripMedia = media.filter(m => trip.mediaIds.includes(m.id));
      const mediaWithLocation = tripMedia.filter(m => m.latitude != null && m.longitude != null);


      if (mediaWithLocation.length < 2) return;

      // Sort by creation time to get chronological order
      const sortedMedia = mediaWithLocation.sort((a, b) => (a.creationTime ?? 0) - (b.creationTime ?? 0));

      // Determine polyline strategy based on zoom level
      const shouldShowClusters = zoom < 10; // Show clusters when zoomed out
      const shouldShowIndividual = zoom >= 10; // Show individual points when zoomed in

      let coordinates: { latitude: number; longitude: number }[] = [];

      if (shouldShowClusters) {
        // Group nearby points into clusters for the polyline
        const clusterRadius = 0.01; // Adjust based on zoom level
        const clusters: { lat: number; lng: number; media: typeof sortedMedia }[] = [];

        sortedMedia.forEach(media => {
          const lat = media.latitude!;
          const lng = media.longitude!;

          // Find existing cluster within radius
          let foundCluster = false;
          for (const cluster of clusters) {
            const distance = Math.sqrt(
              Math.pow(lat - cluster.lat, 2) + Math.pow(lng - cluster.lng, 2)
            );
            if (distance < clusterRadius) {
              cluster.media.push(media);
              // Update cluster center to average position
              cluster.lat = (cluster.lat * (cluster.media.length - 1) + lat) / cluster.media.length;
              cluster.lng = (cluster.lng * (cluster.media.length - 1) + lng) / cluster.media.length;
              foundCluster = true;
              break;
            }
          }

          if (!foundCluster) {
            clusters.push({ lat, lng, media: [media] });
          }
        });

        // Create polyline coordinates from clusters
        coordinates = clusters.map(cluster => ({
          latitude: cluster.lat,
          longitude: cluster.lng
        }));
      } else {
        // Show individual points
        coordinates = sortedMedia.map(media => ({
          latitude: media.latitude!,
          longitude: media.longitude!
        }));
      }

      if (coordinates.length > 1) {
        allPolylines.push({ coordinates, tripId: trip.id });
      }
    });

    return allPolylines;
  }, [selectedTrip, trips, media, region, zoom, polylineUpdateKey]);

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

  const openDiaporamaForMedia = (media: MediaItem) => {
    // For single media items, create a single-item array for the diaporama
    setDiaporamaMedia([media]);
    setShowDiaporama(true);
  };

  const selectTrip = (tripId: string) => {
    setSelectedTripId(tripId);
  };

  const closeDiaporama = () => {
    setShowDiaporama(false);

    // Auto-select the trip after viewing pictures
    if (diaporamaMedia.length > 0 && diaporamaMedia[0].tripId) {
      selectTrip(diaporamaMedia[0].tripId);
    }

    setDiaporamaMedia([]);
  };

  const openTripEdit = () => {
    setShowTripEdit(true);
  };

  const closeTripEdit = () => {
    setShowTripEdit(false);
  };

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

  const addPhotosToTrip = useCallback(async () => {
    if (!selectedTripId) return;

    const mediaPerm = await MediaLibrary.requestPermissionsAsync();
    const pickPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!(mediaPerm.status === 'granted' && pickPerm.status === 'granted')) {
      Alert.alert('Permissions required');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      exif: true,
      selectionLimit: 0,
      quality: 0.7
    });

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
        tripId: selectedTripId,
      } as MediaItem;
    }));

    // First, remove these media items from any existing trips
    enriched.forEach(mediaItem => {
      trips.forEach(trip => {
        if (trip.mediaIds.includes(mediaItem.id)) {
          removeMediaFromTrip(trip.id, mediaItem.id);
        }
      });
    });

    // Then add them to the new trip
    upsertMany(enriched.map(e => ({ ...e, tripId: selectedTripId })));
    addMediaToTrip(selectedTripId, enriched.map((e) => e.id));
  }, [selectedTripId, trips, removeMediaFromTrip, upsertMany, addMediaToTrip]);

  const removePhotoFromTrip = useCallback((mediaId: string) => {
    if (!selectedTripId) return;
    // Remove from trip
    removeMediaFromTrip(selectedTripId, mediaId);
    // Remove from media store completely
    removeMedia(mediaId);
    // Force cluster update
    setClusterUpdateKey(prev => prev + 1);
  }, [selectedTripId, removeMediaFromTrip, removeMedia]);

  const handleDeleteTrip = useCallback(() => {
    if (!selectedTripId) return;

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
            const tripMedia = media.filter(m => selectedTrip?.mediaIds.includes(m.id));
            tripMedia.forEach(item => removeMedia(item.id));
            // Delete the trip
            deleteTrip(selectedTripId);
            // Force polyline and cluster updates
            setPolylineUpdateKey(prev => prev + 1);
            setClusterUpdateKey(prev => prev + 1);
            // Close modal and clear selection
            setShowTripEdit(false);
            setSelectedTripId(null);
          }
        }
      ]
    );
  }, [selectedTripId, selectedTrip, media, removeMedia, deleteTrip]);

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
                  <View style={dynamicStyles.clusterBadge}>
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
            <Marker
              key={p.id}
              coordinate={{ latitude: p.latitude as number, longitude: p.longitude as number }}
              onPress={() => openDiaporamaForMedia(p)}
            >
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

        {/* Trip Polylines */}
        {tripPolylines.map((polyline, index) => (
          <Polyline
            key={`polyline-${polyline.tripId}-${polylineUpdateKey}-${polyline.coordinates.length}-${index}`}
            coordinates={polyline.coordinates}
            strokeColor={selectedTrip ? theme.colors.primary : theme.colors.primaryLight}
            strokeWidth={selectedTrip ? 3 : 2}
            lineDashPattern={[5, 5]}
          />
        ))}
      </MapView>
      {selectedTrip && (
        <View style={styles.tripHeader} pointerEvents="box-none">
          {isGlassAvailable ? (
            <GlassView
              style={styles.tripHeaderInner}
              glassEffectStyle="regular"
              isInteractive={true}
            >
              <Text style={[styles.tripTitle, { color: textColor }]}>{selectedTrip.name}</Text>
              {selectedTripDates && (
                <Text style={[styles.tripSubtitle, { color: secondaryTextColor }]}>
                  {selectedTripDates.start.toLocaleDateString()} – {selectedTripDates.end.toLocaleDateString()}
                </Text>
              )}
            </GlassView>
          ) : (
            <View style={[styles.tripHeaderInner, { backgroundColor: headerBackgroundColor }]}>
              <Text style={[styles.tripTitle, { color: textColor }]}>{selectedTrip.name}</Text>
              {selectedTripDates && (
                <Text style={[styles.tripSubtitle, { color: secondaryTextColor }]}>
                  {selectedTripDates.start.toLocaleDateString()} – {selectedTripDates.end.toLocaleDateString()}
                </Text>
              )}
            </View>
          )}
          <View style={styles.tripActions}>
            {isGlassAvailable ? (
              <GlassView
                style={dynamicStyles.tripEditBtn}
                glassEffectStyle="regular"
                isInteractive={true}
              >
                <Pressable onPress={openTripEdit} style={styles.tripEditPressable}>
                  <Text style={styles.tripEditText}>Edit</Text>
                </Pressable>
              </GlassView>
            ) : (
              <Pressable style={dynamicStyles.tripEditBtn} onPress={openTripEdit}>
                <Text style={styles.tripEditText}>Edit</Text>
              </Pressable>
            )}
            {isGlassAvailable ? (
              <GlassView
                style={dynamicStyles.tripClearBtn}
                glassEffectStyle="regular"
                isInteractive={true}
              >
                <Pressable onPress={() => setSelectedTripId(null)} style={styles.tripClearPressable}>
                  <Text style={styles.tripClearText}>Show All</Text>
                </Pressable>
              </GlassView>
            ) : (
              <Pressable style={dynamicStyles.tripClearBtn} onPress={() => setSelectedTripId(null)}>
                <Text style={styles.tripClearText}>Show All</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
      {/* Toggle Buttons */}
      {isGlassAvailable ? (
        <GlassView
          style={styles.toggleContainer}
          glassEffectStyle="regular"
          isInteractive={true}
        >
          <Pressable style={[styles.toggleBtn, !showListView && styles.toggleBtnActive]} onPress={closeListView}>
            <Text style={[styles.toggleText, !showListView && styles.toggleTextActive, { color: !showListView ? 'white' : secondaryTextColor }]}>Map</Text>
          </Pressable>
          <Pressable style={[styles.toggleBtn, showListView && styles.toggleBtnActive]} onPress={openListView}>
            <Text style={[styles.toggleText, showListView && styles.toggleTextActive, { color: showListView ? 'white' : secondaryTextColor }]}>Trips</Text>
          </Pressable>
        </GlassView>
      ) : (
        <View style={[styles.toggleContainer, { backgroundColor: toggleBackgroundColor }]}>
          <Pressable style={[styles.toggleBtn, !showListView && styles.toggleBtnActive]} onPress={closeListView}>
            <Text style={[styles.toggleText, !showListView && styles.toggleTextActive, { color: !showListView ? 'white' : secondaryTextColor }]}>Map</Text>
          </Pressable>
          <Pressable style={[styles.toggleBtn, showListView && styles.toggleBtnActive]} onPress={openListView}>
            <Text style={[styles.toggleText, showListView && styles.toggleTextActive, { color: showListView ? 'white' : secondaryTextColor }]}>Trips</Text>
          </Pressable>
        </View>
      )}

      {isGlassAvailable ? (
        <GlassView
          style={styles.fab}
          glassEffectStyle="regular"
          isInteractive={true}
        >
          <Link href="/modal" asChild>
            <Pressable style={styles.fabPressable}>
              <Text style={styles.fabText}>Add Trip</Text>
            </Pressable>
          </Link>
        </GlassView>
      ) : (
        <Link href="/modal" asChild>
          <Pressable style={styles.fab}>
            <Text style={styles.fabText}>Add Trip</Text>
          </Pressable>
        </Link>
      )}

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
            {isGlassAvailable ? (
              <GlassView
                style={[styles.listModal, { backgroundColor: 'transparent' }]}
                glassEffectStyle="regular"
                isInteractive={true}
              >
                <View style={[styles.listHeader, { borderBottomColor: borderColor }]}>
                  <View>
                    <Text style={[styles.listTitle, { color: textColor }]}>
                      {selectedTripId ? `Photos from ${selectedTrip?.name}` : 'Your Trips'}
                    </Text>
                    {selectedTripId && (
                      <Text style={[styles.listSubtitle, { color: secondaryTextColor }]}>
                        Showing only photos from this trip
                      </Text>
                    )}
                  </View>
                  <Pressable onPress={closeListView} style={[styles.closeBtn, { backgroundColor: theme.colors.backgroundTertiary }]}>
                    <Text style={[styles.closeText, { color: secondaryTextColor }]}>×</Text>
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
                          { backgroundColor: selectedTripId === trip.id ? selectedCardBackgroundColor : cardBackgroundColor },
                          selectedTripId === trip.id && dynamicStyles.tripCardSelected
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
                              <View style={[styles.tripImage, styles.tripImagePlaceholder, { backgroundColor: theme.colors.backgroundTertiary }]}>
                                <Text style={styles.placeholderText}>📷</Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.tripInfo}>
                            <Text style={[styles.tripName, { color: textColor }]}>{trip.name}</Text>
                            {tripDates && (
                              <Text style={[styles.tripDate, { color: secondaryTextColor }]}>
                                {tripDates.start.toLocaleDateString()} – {tripDates.end.toLocaleDateString()}
                              </Text>
                            )}
                            <Text style={dynamicStyles.tripCount}>{tripMedia.length} photos</Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  }}
                  contentContainerStyle={styles.listContent}
                />
              </GlassView>
            ) : (
              <View style={[styles.listModal, { backgroundColor }]}>
                <View style={[styles.listHeader, { borderBottomColor: borderColor }]}>
                  <View>
                    <Text style={[styles.listTitle, { color: textColor }]}>
                      {selectedTripId ? `Photos from ${selectedTrip?.name}` : 'Your Trips'}
                    </Text>
                    {selectedTripId && (
                      <Text style={[styles.listSubtitle, { color: secondaryTextColor }]}>
                        Showing only photos from this trip
                      </Text>
                    )}
                  </View>
                  <Pressable onPress={closeListView} style={[styles.closeBtn, { backgroundColor: theme.colors.backgroundTertiary }]}>
                    <Text style={[styles.closeText, { color: secondaryTextColor }]}>×</Text>
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
                          { backgroundColor: selectedTripId === trip.id ? selectedCardBackgroundColor : cardBackgroundColor },
                          selectedTripId === trip.id && dynamicStyles.tripCardSelected
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
                              <View style={[styles.tripImage, styles.tripImagePlaceholder, { backgroundColor: theme.colors.backgroundTertiary }]}>
                                <Text style={styles.placeholderText}>📷</Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.tripInfo}>
                            <Text style={[styles.tripName, { color: textColor }]}>{trip.name}</Text>
                            {tripDates && (
                              <Text style={[styles.tripDate, { color: secondaryTextColor }]}>
                                {tripDates.start.toLocaleDateString()} – {tripDates.end.toLocaleDateString()}
                              </Text>
                            )}
                            <Text style={dynamicStyles.tripCount}>{tripMedia.length} photos</Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  }}
                  contentContainerStyle={styles.listContent}
                />
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>

      {/* Diaporama Modal */}
      <DiaporamaModal
        visible={showDiaporama}
        onClose={closeDiaporama}
        media={diaporamaMedia}
      />

      {/* Trip Edit Modal */}
      <Modal
        visible={showTripEdit}
        transparent={true}
        animationType="fade"
        onRequestClose={closeTripEdit}
      >
        <View style={styles.modalOverlay}>
          {selectedTrip && (
            <>
              {isGlassAvailable ? (
                <GlassView
                  style={styles.tripEditModal}
                  glassEffectStyle="regular"
                  isInteractive={true}
                >
                  <View style={styles.tripEditHeader}>
                    <View>
                      <Text style={[styles.tripEditTitle, { color: textColor }]}>{selectedTrip.name}</Text>
                      {selectedTripDates && (
                        <Text style={[styles.tripEditSubtitle, { color: secondaryTextColor }]}>
                          {selectedTripDates.start.toLocaleDateString()} – {selectedTripDates.end.toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                    <Pressable onPress={closeTripEdit} style={styles.tripEditCloseBtn}>
                      <Text style={[styles.tripEditCloseText, { color: textColor }]}>×</Text>
                    </Pressable>
                  </View>

                  <View style={styles.tripEditActions}>
                    <GlassView
                      style={[styles.tripEditActionBtn, dynamicStyles.primary]}
                      glassEffectStyle="regular"
                      isInteractive={true}
                    >
                      <Pressable onPress={addPhotosToTrip} style={styles.tripEditActionPressable}>
                        <Text style={styles.primaryText}>Add Photos</Text>
                      </Pressable>
                    </GlassView>

                    <GlassView
                      style={[styles.tripEditActionBtn, dynamicStyles.danger]}
                      glassEffectStyle="regular"
                      isInteractive={true}
                    >
                      <Pressable onPress={handleDeleteTrip} style={styles.tripEditActionPressable}>
                        <Text style={styles.dangerText}>Delete Trip</Text>
                      </Pressable>
                    </GlassView>
                  </View>

                  <FlatList
                    data={media.filter(m => selectedTrip.mediaIds.includes(m.id))}
                    keyExtractor={(i) => i.id}
                    numColumns={3}
                    columnWrapperStyle={{ gap: 8 }}
                    contentContainerStyle={{ gap: 8, padding: 12 }}
                    renderItem={({ item }) => (
                      <View style={dynamicStyles.tripEditGridItem}>
                        <Image source={{ uri: item.uri }} style={styles.tripEditGridPhoto} contentFit="cover" />
                        <Pressable onPress={() => removePhotoFromTrip(item.id)} style={styles.tripEditRemoveBadge}>
                          <Text style={styles.tripEditRemoveText}>×</Text>
                        </Pressable>
                      </View>
                    )}
                  />
                </GlassView>
              ) : (
                <View style={[styles.tripEditModal, { backgroundColor }]}>
                  <View style={styles.tripEditHeader}>
                    <View>
                      <Text style={[styles.tripEditTitle, { color: textColor }]}>{selectedTrip.name}</Text>
                      {selectedTripDates && (
                        <Text style={[styles.tripEditSubtitle, { color: secondaryTextColor }]}>
                          {selectedTripDates.start.toLocaleDateString()} – {selectedTripDates.end.toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                    <Pressable onPress={closeTripEdit} style={styles.tripEditCloseBtn}>
                      <Text style={[styles.tripEditCloseText, { color: textColor }]}>×</Text>
                    </Pressable>
                  </View>

                  <View style={styles.tripEditActions}>
                    <Pressable onPress={addPhotosToTrip} style={[styles.tripEditActionBtn, dynamicStyles.primary]}>
                      <Text style={styles.primaryText}>Add Photos</Text>
                    </Pressable>

                    <Pressable onPress={handleDeleteTrip} style={[styles.tripEditActionBtn, dynamicStyles.danger]}>
                      <Text style={styles.dangerText}>Delete Trip</Text>
                    </Pressable>
                  </View>

                  <FlatList
                    data={media.filter(m => selectedTrip.mediaIds.includes(m.id))}
                    keyExtractor={(i) => i.id}
                    numColumns={3}
                    columnWrapperStyle={{ gap: 8 }}
                    contentContainerStyle={{ gap: 8, padding: 12 }}
                    renderItem={({ item }) => (
                      <View style={dynamicStyles.tripEditGridItem}>
                        <Image source={{ uri: item.uri }} style={styles.tripEditGridPhoto} contentFit="cover" />
                        <Pressable onPress={() => removePhotoFromTrip(item.id)} style={styles.tripEditRemoveBadge}>
                          <Text style={styles.tripEditRemoveText}>×</Text>
                        </Pressable>
                      </View>
                    )}
                  />
                </View>
              )}
            </>
          )}
        </View>
      </Modal>
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
  fabPressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: 'white', fontWeight: '700' },
  tripHeader: {
    position: 'absolute',
    top: 100,
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
  },
  tripTitle: { fontWeight: '700', fontSize: 16 },
  tripSubtitle: { marginTop: 2 },
  tripActions: {
    flexDirection: 'row',
    gap: 8,
  },
  tripEditBtn: { backgroundColor: '#1e88e5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  tripEditPressable: { borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tripEditText: { color: 'white', fontWeight: '700' },
  tripClearBtn: { backgroundColor: '#666', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  tripClearPressable: { borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tripClearText: { color: 'white', fontWeight: '700' },
  // Toggle buttons
  toggleContainer: {
    position: 'absolute',
    top: 60,
    left: 16,
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  toggleBtnActive: {
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
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
    paddingTop: 60,
    borderBottomWidth: 1,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  listSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 18,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
  },
  tripCard: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  tripCardSelected: {
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
    marginBottom: 2,
  },
  tripCount: {
    fontSize: 12,
    color: '#1e88e5',
    fontWeight: '600',
  },
  // Trip edit modal
  tripEditModal: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    bottom: 100,
    borderRadius: 16,
    overflow: 'hidden',
  },
  tripEditHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 20,
  },
  tripEditTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  tripEditSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  tripEditCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  tripEditCloseText: {
    fontSize: 18,
    fontWeight: '700',
  },
  tripEditActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  tripEditActionBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripEditActionPressable: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: '#1e88e5' },
  primaryText: { color: 'white', fontWeight: '700' },
  danger: { backgroundColor: '#ff4444' },
  dangerText: { color: 'white', fontWeight: '700' },
  tripEditGridItem: {
    position: 'relative',
    width: '32%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f2f2f2',
  },
  tripEditGridPhoto: {
    width: '100%',
    height: '100%',
  },
  tripEditRemoveBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripEditRemoveText: {
    color: 'white',
    fontWeight: '700',
  },
});