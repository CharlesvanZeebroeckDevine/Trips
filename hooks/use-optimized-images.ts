import { useState, useCallback } from 'react';
import { Image } from 'expo-image';

export type OptimizedImageProps = {
    uri: string;
    width?: number;
    height?: number;
    style?: any;
    contentFit?: 'cover' | 'contain' | 'fill' | 'scale-down' | 'none';
    placeholder?: string;
    onLoad?: () => void;
    onError?: () => void;
};

export function useOptimizedImages() {
    const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
    const [errorImages, setErrorImages] = useState<Set<string>>(new Set());

    const generateThumbnailUri = useCallback((uri: string, size: number = 128): string => {
        // For now, return original URI - in production, you'd generate actual thumbnails
        // This could be done with expo-image-manipulator or a native module
        return uri;
    }, []);

    const isImageLoading = useCallback((uri: string) => {
        return loadingImages.has(uri);
    }, [loadingImages]);

    const isImageError = useCallback((uri: string) => {
        return errorImages.has(uri);
    }, [errorImages]);

    const markImageLoading = useCallback((uri: string) => {
        setLoadingImages(prev => new Set(prev).add(uri));
    }, []);

    const markImageLoaded = useCallback((uri: string) => {
        setLoadingImages(prev => {
            const newSet = new Set(prev);
            newSet.delete(uri);
            return newSet;
        });
        setErrorImages(prev => {
            const newSet = new Set(prev);
            newSet.delete(uri);
            return newSet;
        });
    }, []);

    const markImageError = useCallback((uri: string) => {
        setLoadingImages(prev => {
            const newSet = new Set(prev);
            newSet.delete(uri);
            return newSet;
        });
        setErrorImages(prev => new Set(prev).add(uri));
    }, []);

    return {
        generateThumbnailUri,
        isImageLoading,
        isImageError,
        markImageLoading,
        markImageLoaded,
        markImageError,
        loadingImages,
        errorImages,
    };
}