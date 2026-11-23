import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';

const SETTINGS_KEY = 'newsline_settings_v1';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ReadingTextSize = 'small' | 'medium' | 'large';

export type AppSettings = {
  theme: ThemePreference;
  textSize: ReadingTextSize;
  notificationsEnabled: boolean;
  breakingNews: boolean;
  majorNews: boolean;
  localNews: boolean;
  preferredCategories: number[];
  preferredLGA: string;
  dataSaver: boolean;
  autoplayVideos: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  textSize: 'medium',
  notificationsEnabled: false,
  breakingNews: true,
  majorNews: true,
  localNews: true,
  preferredCategories: [],
  preferredLGA: 'all',
  dataSaver: false,
  autoplayVideos: true,
};

export type ThemeColors = {
  background: string;
  surface: string;
  canvas: string;
  text: string;
  muted: string;
  divider: string;
  chip: string;
};

const LIGHT_COLORS: ThemeColors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  canvas: '#F5F5F5',
  text: '#171717',
  muted: '#777777',
  divider: '#EAEAEA',
  chip: '#F5F5F5',
};

const DARK_COLORS: ThemeColors = {
  background: '#111111',
  surface: '#1B1B1B',
  canvas: '#111111',
  text: '#F5F5F5',
  muted: '#AAAAAA',
  divider: '#303030',
  chip: '#292929',
};

type SettingsContextValue = {
  settings: AppSettings;
  isLoading: boolean;
  saveError: string;
  isDark: boolean;
  colors: ThemeColors;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function parseSettings(value: string | null): AppSettings {
  if (!value) return DEFAULT_SETTINGS;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object') return DEFAULT_SETTINGS;
  const stored = parsed as Partial<AppSettings>;
  return {
    theme: stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : 'system',
    textSize:
      stored.textSize === 'small' || stored.textSize === 'large' ? stored.textSize : 'medium',
    notificationsEnabled:
      typeof stored.notificationsEnabled === 'boolean'
        ? stored.notificationsEnabled
        : DEFAULT_SETTINGS.notificationsEnabled,
    breakingNews: typeof stored.breakingNews === 'boolean' ? stored.breakingNews : true,
    majorNews: typeof stored.majorNews === 'boolean' ? stored.majorNews : true,
    localNews: typeof stored.localNews === 'boolean' ? stored.localNews : true,
    preferredCategories: Array.isArray(stored.preferredCategories)
      ? stored.preferredCategories.filter(
          (category): category is number => Number.isInteger(category) && category > 0,
        )
      : [],
    preferredLGA:
      typeof stored.preferredLGA === 'string' ? stored.preferredLGA : DEFAULT_SETTINGS.preferredLGA,
    dataSaver: typeof stored.dataSaver === 'boolean' ? stored.dataSaver : false,
    autoplayVideos: typeof stored.autoplayVideos === 'boolean' ? stored.autoplayVideos : true,
  };
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const deviceScheme = useColorScheme();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [saveError, setSaveError] = useState('');
  const settingsRef = useRef(settings);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((storedValue) => {
        if (!active) return;
        const loaded = parseSettings(storedValue);
        settingsRef.current = loaded;
        setSettings(loaded);
      })
      .catch(() => {
        if (active) setSaveError('Settings could not be loaded from this device.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const updateSettings = useCallback(async (updates: Partial<AppSettings>) => {
    const next = { ...settingsRef.current, ...updates };
    if (JSON.stringify(next) === JSON.stringify(settingsRef.current)) return;
    settingsRef.current = next;
    setSettings(next);
    setSaveError('');
    const serialized = JSON.stringify(next);
    const write = writeQueue.current.catch(() => undefined).then(() =>
      AsyncStorage.setItem(SETTINGS_KEY, serialized),
    );
    writeQueue.current = write;
    try {
      await write;
    } catch (error) {
      setSaveError('Settings could not be saved. Check available device storage and try again.');
      throw error;
    }
  }, []);

  const resetSettings = useCallback(() => updateSettings(DEFAULT_SETTINGS), [updateSettings]);
  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && deviceScheme === 'dark');
  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      isLoading,
      saveError,
      isDark,
      colors: isDark ? DARK_COLORS : LIGHT_COLORS,
      updateSettings,
      resetSettings,
    }),
    [settings, isLoading, saveError, isDark, updateSettings, resetSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider.');
  return context;
}
