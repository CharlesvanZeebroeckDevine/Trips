import { create } from 'zustand';
import type { MediaItem } from '@/components/types';

type MediaStore = {
    items: MediaItem[];
    upsertMany: (newItems: MediaItem[]) => void;
    removeMedia: (mediaId: string) => void;
    clear: () => void;
};

export const useMediaStore = create<MediaStore>((set, get) => ({
    items: [],
    upsertMany: (newItems: MediaItem[]) => {
        if (!newItems?.length) return;
        const existing = get().items;
        const byId = new Map(existing.map((i) => [i.id, i] as const));
        for (const it of newItems) {
            const prev = byId.get(it.id);
            byId.set(it.id, { ...prev, ...it });
        }
        set({ items: Array.from(byId.values()) });
    },
    removeMedia: (mediaId: string) => {
        set({
            items: get().items.filter((item) => item.id !== mediaId),
        });
    },
    clear: () => set({ items: [] }),
}));


