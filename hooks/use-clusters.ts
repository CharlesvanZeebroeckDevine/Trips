import { useEffect, useRef, useState } from 'react';
import Supercluster from 'supercluster';
import type { MediaItem } from '@/components/types';
import type { Region } from 'react-native-maps';

export type ClusterPoint = {
    id: number | string;
    latitude: number;
    longitude: number;
    isCluster: boolean;
    count: number;
    media?: MediaItem;
};

type Params = {
    media: MediaItem[];
    region: Region | null;
    zoom: number;
    radiusPx?: number; // cluster radius in pixels
    minPoints?: number; // min points to form cluster
};

type GeoFeature = {
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: { media: MediaItem };
};

export function useClusters({ media, region, zoom, radiusPx = 60, minPoints = 2 }: Params) {
    const indexRef = useRef<Supercluster<{ media: MediaItem }> | null>(null);
    const [clusters, setClusters] = useState<ClusterPoint[]>([]);

    // build supercluster index when media changes
    useEffect(() => {
        // Group media by trip first
        const mediaByTrip = new Map<string, MediaItem[]>();
        media
            .filter((m) => m.latitude != null && m.longitude != null && m.tripId)
            .forEach((m) => {
                const tripId = m.tripId!;
                if (!mediaByTrip.has(tripId)) {
                    mediaByTrip.set(tripId, []);
                }
                mediaByTrip.get(tripId)!.push(m);
            });

        // Create separate supercluster instances for each trip
        const tripClusters = new Map<string, Supercluster<{ media: MediaItem }>>();

        mediaByTrip.forEach((tripMedia, tripId) => {
            const points: GeoFeature[] = tripMedia.map((m) => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [m.longitude as number, m.latitude as number] },
                properties: { media: m },
            }));

            if (points.length > 0) {
                const tripCluster = new Supercluster<{ media: MediaItem }>({
                    radius: radiusPx,
                    maxZoom: 20,
                    minPoints,
                }).load(points);

                tripClusters.set(tripId, tripCluster);
            }
        });

        // Store the trip clusters for later use
        (indexRef as any).current = tripClusters;
    }, [media, radiusPx, minPoints]);

    // recompute clusters for the current viewport
    useEffect(() => {
        if (!indexRef.current || !region) {
            setClusters([]);
            return;
        }

        const west = region.longitude - region.longitudeDelta / 2;
        const east = region.longitude + region.longitudeDelta / 2;
        const north = region.latitude + region.latitudeDelta / 2;
        const south = region.latitude - region.latitudeDelta / 2;
        const bounds = [west, south, east, north] as [number, number, number, number];
        const zoomLevel = Math.round(zoom);

        const allClusters: ClusterPoint[] = [];
        const tripClusters = (indexRef as any).current as Map<string, Supercluster<{ media: MediaItem }>>;

        // Process each trip's clusters separately
        tripClusters.forEach((tripCluster, tripId) => {
            const raw = tripCluster.getClusters(bounds, zoomLevel);
            const mapped: ClusterPoint[] = raw.map((f: any) => {
                const [lng, lat] = f.geometry.coordinates as [number, number];
                if (f.properties.cluster) {
                    return {
                        id: `${tripId}-${f.id}`,
                        latitude: lat,
                        longitude: lng,
                        isCluster: true,
                        count: f.properties.point_count as number,
                    };
                }
                const mediaItem: MediaItem | undefined = f.properties?.media as MediaItem | undefined;
                return {
                    id: mediaItem?.id ?? `${tripId}-${lng},${lat}`,
                    latitude: lat,
                    longitude: lng,
                    isCluster: false,
                    count: 1,
                    media: mediaItem,
                };
            });
            allClusters.push(...mapped);
        });

        setClusters(allClusters);
    }, [region, zoom]);

    // Return the trip clusters map for compatibility
    const tripClusters = (indexRef as any).current as Map<string, Supercluster<{ media: MediaItem }>> | null;

    return { clusters, supercluster: tripClusters } as const;
}


