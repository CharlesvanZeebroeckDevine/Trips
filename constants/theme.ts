/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    // Text colors
    text: '#11181C',
    textSecondary: '#666666',
    textTertiary: '#999999',

    // Background colors
    background: '#FFFFFF',
    backgroundSecondary: '#F8F9FA',
    backgroundTertiary: '#F0F0F0',

    // Brand colors
    primary: '#1e88e5',
    primaryLight: '#8CC2F0',
    primaryDark: '#1565C0',

    // Status colors
    success: '#4CAF50',
    warning: '#FF9800',
    danger: '#F44336',
    info: '#2196F3',

    // UI colors
    border: '#E0E0E0',
    borderLight: '#F0F0F0',
    shadow: '#000000',

    // Glass effect colors
    glassBackground: 'rgba(255,255,255,0.95)',
    glassBorder: 'rgba(255,255,255,0.2)',

    // Legacy colors for compatibility
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    // Text colors
    text: '#ECEDEE',
    textSecondary: '#B0B0B0',
    textTertiary: '#808080',

    // Background colors
    background: '#151718',
    backgroundSecondary: '#2A2A2A',
    backgroundTertiary: '#333333',

    // Brand colors
    primary: '#1e88e5',
    primaryLight: '#64B5F6',
    primaryDark: '#0D47A1',

    // Status colors
    success: '#66BB6A',
    warning: '#FFB74D',
    danger: '#EF5350',
    info: '#42A5F5',

    // UI colors
    border: '#404040',
    borderLight: '#333333',
    shadow: '#000000',

    // Glass effect colors
    glassBackground: 'rgba(42,42,42,0.95)',
    glassBorder: 'rgba(255,255,255,0.1)',

    // Legacy colors for compatibility
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
