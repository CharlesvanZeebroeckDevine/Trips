import { useMemo } from 'react';
import { useThemeColor } from './use-theme-color';

export function useAppTheme() {
    return useMemo(() => ({
        colors: {
            // Text colors
            text: useThemeColor({}, 'text'),
            textSecondary: useThemeColor({}, 'textSecondary'),
            textTertiary: useThemeColor({}, 'textTertiary'),

            // Background colors
            background: useThemeColor({}, 'background'),
            backgroundSecondary: useThemeColor({}, 'backgroundSecondary'),
            backgroundTertiary: useThemeColor({}, 'backgroundTertiary'),

            // Brand colors
            primary: useThemeColor({}, 'primary'),
            primaryLight: useThemeColor({}, 'primaryLight'),
            primaryDark: useThemeColor({}, 'primaryDark'),

            // Status colors
            success: useThemeColor({}, 'success'),
            warning: useThemeColor({}, 'warning'),
            danger: useThemeColor({}, 'danger'),
            info: useThemeColor({}, 'info'),

            // UI colors
            border: useThemeColor({}, 'border'),
            borderLight: useThemeColor({}, 'borderLight'),
            shadow: useThemeColor({}, 'shadow'),

            // Glass effect colors
            glassBackground: useThemeColor({}, 'glassBackground'),
            glassBorder: useThemeColor({}, 'glassBorder'),
        },
        spacing: {
            xs: 4,
            sm: 8,
            md: 16,
            lg: 24,
            xl: 32,
            xxl: 48,
        },
        typography: {
            h1: { fontSize: 32, fontWeight: 'bold' as const },
            h2: { fontSize: 24, fontWeight: 'bold' as const },
            h3: { fontSize: 20, fontWeight: '600' as const },
            body: { fontSize: 16, lineHeight: 24 },
            caption: { fontSize: 12, lineHeight: 16 },
            button: { fontSize: 16, fontWeight: '600' as const },
        },
        borderRadius: {
            sm: 4,
            md: 8,
            lg: 12,
            xl: 16,
            full: 9999,
        },
    }), []);
}
