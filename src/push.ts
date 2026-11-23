import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { AppSettings } from './settings';

Notifications.setNotificationHandler({ handleNotification: async () => ({
  shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
}) });
const TOKEN_KEY = 'newsline_expo_push_token_v1';
export const PUSH_API_URL = process.env.EXPO_PUBLIC_NOTIFICATION_API_URL?.replace(/\/$/, '') || '';
export const EAS_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || Constants.easConfig?.projectId || '';
export const pushDeliveryConfigured = Boolean(PUSH_API_URL && EAS_PROJECT_ID);

export async function syncNotificationPreferences(settings: AppSettings): Promise<void> {
  if (!PUSH_API_URL) return;
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;
  const response = await fetch(`${PUSH_API_URL}/preferences`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, enabled: settings.notificationsEnabled, breaking: settings.breakingNews,
      major: settings.majorNews, local: settings.localNews, categories: settings.preferredCategories, lga: settings.preferredLGA }) });
  if (!response.ok) throw new Error(`Notification preferences could not sync (${response.status}).`);
}

export async function registerForPush(settings: AppSettings): Promise<string> {
  if (!Device.isDevice) throw new Error('Push notifications need a physical device and an EAS development or production build.');
  if (!PUSH_API_URL) throw new Error('Push delivery is not configured yet. Set EXPO_PUBLIC_NOTIFICATION_API_URL after deploying the Newsline notification service.');
  if (!EAS_PROJECT_ID) throw new Error('Push delivery needs the EAS project ID configured in EXPO_PUBLIC_EAS_PROJECT_ID.');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('news', { name: 'News alerts', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250], lightColor: '#B82025' });
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Notification permission was not granted. You can enable it in Android Settings.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })).data;
  const response = await fetch(`${PUSH_API_URL}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform: Platform.OS, ...preferences(settings) }) });
  if (!response.ok) throw new Error(`Device registration failed (${response.status}).`);
  await AsyncStorage.setItem(TOKEN_KEY, token);
  return token;
}
function preferences(settings: AppSettings) { return { enabled: settings.notificationsEnabled, breaking: settings.breakingNews,
  major: settings.majorNews, local: settings.localNews, categories: settings.preferredCategories, lga: settings.preferredLGA }; }

export function notificationArticleId(response: Notifications.NotificationResponse): number | null {
  const data = response.notification.request.content.data as { articleId?: unknown; article_id?: unknown };
  const id = Number(data.articleId ?? data.article_id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
