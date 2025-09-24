import { create } from 'zustand';

export type Trip = {
    id: string;
    name: string;
    mediaIds: string[];
    createdAt: number;
};

type TripStore = {
    trips: Trip[];
    addTrip: (trip: Trip) => void;
    addMediaToTrip: (tripId: string, mediaIds: string[]) => void;
    removeMediaFromTrip: (tripId: string, mediaId: string) => void;
};

export const useTripStore = create<TripStore>((set, get) => ({
    trips: [],
    addTrip: (trip: Trip) => {
        set({ trips: [trip, ...get().trips] });
    },
    addMediaToTrip: (tripId, mediaIds) => {
        set({
            trips: get().trips.map((t) => t.id === tripId ? { ...t, mediaIds: Array.from(new Set([...t.mediaIds, ...mediaIds])) } : t),
        });
    },
    removeMediaFromTrip: (tripId, mediaId) => {
        set({
            trips: get().trips.map((t) => t.id === tripId ? { ...t, mediaIds: t.mediaIds.filter((id) => id !== mediaId) } : t),
        });
    },
}));


