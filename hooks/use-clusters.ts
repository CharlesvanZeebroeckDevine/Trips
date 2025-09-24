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
        const points: GeoFeature[] = media
            .filter((m) => m.latitude != null && m.longitude != null)
            .map((m) => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [m.longitude as number, m.latitude as number] },
                properties: { media: m },
            }));

        indexRef.current = new Supercluster<{ media: MediaItem }>({
            radius: radiusPx,
            maxZoom: 20,
            minPoints,
        }).load(points);
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

        const raw = indexRef.current.getClusters([west, south, east, north], Math.round(zoom));
        const mapped: ClusterPoint[] = raw.map((f: any) => {
            const [lng, lat] = f.geometry.coordinates as [number, number];
            if (f.properties.cluster) {
                return {
                    id: f.id as number,
                    latitude: lat,
                    longitude: lng,
                    isCluster: true,
                    count: f.properties.point_count as number,
                };
            }
            const mediaItem: MediaItem | undefined = f.properties?.media as MediaItem | undefined;
            return {
                id: mediaItem?.id ?? `${lng},${lat}`,
                latitude: lat,
                longitude: lng,
                isCluster: false,
                count: 1,
                media: mediaItem,
            };
        });
        setClusters(mapped);
    }, [region, zoom]);

    const supercluster = indexRef.current;

    return { clusters, supercluster } as const;
}


