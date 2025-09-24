import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Pressable,
    Dimensions,
    Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import type { MediaItem } from './types';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface DiaporamaModalProps {
    visible: boolean;
    onClose: () => void;
    media: MediaItem[];
    startIndex?: number;
}

export function DiaporamaModal({ visible, onClose, media, startIndex = 0 }: DiaporamaModalProps) {
    const [currentIndex, setCurrentIndex] = useState(startIndex);
    const [isPlaying, setIsPlaying] = useState(true);
    const progressAnim = useRef(new Animated.Value(0)).current;
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const currentMedia = media[currentIndex];

    // Reset timer function
    const resetTimer = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        if (visible && isPlaying && media.length > 0) {
            intervalRef.current = setInterval(() => {
                setCurrentIndex((prev) => {
                    if (prev >= media.length - 1) {
                        onClose();
                        return prev;
                    }
                    return prev + 1;
                });
            }, 3000); // 3 seconds per photo
        }
    }, [visible, isPlaying, media.length, onClose]);

    // Auto-advance timer
    useEffect(() => {
        resetTimer();
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [resetTimer]);

    // Reset timer when index changes manually
    useEffect(() => {
        if (visible && isPlaying) {
            resetTimer();
        }
    }, [currentIndex, visible, isPlaying, resetTimer]);

    // Progress animation
    useEffect(() => {
        if (visible) {
            // Reset progress to 0 when index changes
            progressAnim.setValue(0);

            // Animate to current progress
            Animated.timing(progressAnim, {
                toValue: 100,
                duration: 3000,
                useNativeDriver: false,
            }).start();
        } else {
            progressAnim.setValue(0);
        }
    }, [visible, currentIndex, progressAnim]);

    // Reset when modal opens
    useEffect(() => {
        if (visible) {
            setCurrentIndex(startIndex);
            setIsPlaying(true);
            progressAnim.setValue(0);
        }
    }, [visible, startIndex, progressAnim]);

    const handleTap = (event: any) => {
        const { locationX } = event.nativeEvent;
        const screenCenter = screenWidth / 2;

        if (locationX < screenCenter) {
            // Left side tap - go to previous
            if (currentIndex > 0) {
                setCurrentIndex(currentIndex - 1);
            }
        } else {
            // Right side tap - go to next
            if (currentIndex < media.length - 1) {
                setCurrentIndex(currentIndex + 1);
            } else {
                onClose();
            }
        }
    };

    const handleLongPress = () => {
        setIsPlaying(!isPlaying);
    };

    const handleSwipeLeft = useCallback(() => {
        if (currentIndex < media.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    }, [currentIndex, media.length]);

    const handleSwipeRight = useCallback(() => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        }
    }, [currentIndex]);

    const handleSwipeDown = useCallback(() => {
        onClose();
    }, [onClose]);

    // Create gesture configuration using the new API
    const panGesture = React.useMemo(() =>
        Gesture.Pan()
            .onEnd((event) => {
                const { translationX, translationY } = event;

                if (Math.abs(translationY) > Math.abs(translationX)) {
                    // Vertical swipe
                    if (translationY > 50) {
                        handleSwipeDown();
                    }
                } else {
                    // Horizontal swipe
                    if (translationX > 50) {
                        handleSwipeRight();
                    } else if (translationX < -50) {
                        handleSwipeLeft();
                    }
                }
            }),
        [handleSwipeDown, handleSwipeRight, handleSwipeLeft]
    );

    if (!visible || !currentMedia) return null;

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                {/* Progress bars */}
                <View style={styles.progressContainer}>
                    {media.map((_, index) => (
                        <View key={index} style={styles.progressBar}>
                            <Animated.View
                                style={[
                                    styles.progressFill,
                                    {
                                        width: index === currentIndex
                                            ? progressAnim.interpolate({
                                                inputRange: [0, 100],
                                                outputRange: ['0%', '100%'],
                                            })
                                            : index < currentIndex ? '100%' : '0%',
                                    },
                                ]}
                            />
                        </View>
                    ))}
                </View>

                {/* Media content */}
                <GestureDetector gesture={panGesture}>
                    <Pressable style={styles.mediaContainer} onPress={handleTap} onLongPress={handleLongPress}>
                        <Image
                            source={{ uri: currentMedia.uri }}
                            style={styles.mediaImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                        />

                        {/* Media info overlay */}
                        <View style={styles.infoOverlay}>
                            <Text style={styles.mediaCount}>
                                {currentIndex + 1} / {media.length}
                            </Text>
                            {currentMedia.creationTime && (
                                <Text style={styles.mediaDate}>
                                    {new Date(currentMedia.creationTime).toLocaleDateString()}
                                </Text>
                            )}
                        </View>
                    </Pressable>
                </GestureDetector>

                {/* Close button */}
                <Pressable style={styles.closeButton} onPress={onClose}>
                    <Text style={styles.closeButtonText}>×</Text>
                </Pressable>

                {/* Play/Pause indicator */}
                {!isPlaying && (
                    <View style={styles.pauseIndicator}>
                        <Text style={styles.pauseText}>⏸️</Text>
                    </View>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'black',
    },
    progressContainer: {
        position: 'absolute',
        top: 50,
        left: 16,
        right: 16,
        flexDirection: 'row',
        zIndex: 10,
    },
    progressBar: {
        flex: 1,
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.3)',
        marginHorizontal: 2,
        borderRadius: 1.5,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: 'white',
    },
    mediaContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mediaImage: {
        width: screenWidth,
        height: screenHeight,
    },
    infoOverlay: {
        position: 'absolute',
        bottom: 100,
        left: 16,
        right: 16,
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 12,
        borderRadius: 8,
    },
    mediaCount: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    mediaDate: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
    },
    closeButton: {
        position: 'absolute',
        top: 50,
        right: 16,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    closeButtonText: {
        color: 'white',
        fontSize: 24,
        fontWeight: 'bold',
    },
    pauseIndicator: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: [{ translateX: -25 }, { translateY: -25 }],
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pauseText: {
        fontSize: 24,
    },
});
