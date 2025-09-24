import { useEffect, useRef, useState, useMemo } from 'react';
import { useClusters } from './use-clusters';
import type { MediaItem } from '@/components/types';
import type { Region } from 'react-native-maps';

type Params = {
    media: MediaItem[];
    region: Region | null;
    zoom: number;
    radiusPx?: number;
    minPoints?: number;
    debounceMs?: number;
};

export function useDebouncedClusters({
    media,
    region,
    zoom,
    radiusPx = 60,
    minPoints = 2,
    debounceMs = 300
}: Params) {
    const [debouncedRegion, setDebouncedRegion] = useState<Region | null>(region);
    const [debouncedZoom, setDebouncedZoom] = useState(zoom);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounce region and zoom changes
    useEffect(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            setDebouncedRegion(region);
            setDebouncedZoom(zoom);
        }, debounceMs);

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [region, zoom, debounceMs]);

    // Memoize media to prevent unnecessary re-clustering
    const memoizedMedia = useMemo(() => media, [media.length, media.map(m => m.id).join(',')]);

    const { clusters, supercluster } = useClusters({
        media: memoizedMedia,
        region: debouncedRegion,
        zoom: debouncedZoom,
        radiusPx,
        minPoints
    });

    return { clusters, supercluster };
}