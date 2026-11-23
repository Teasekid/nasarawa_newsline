import type { ExpoConfig } from 'expo/config';
import appJson from './app.json';

const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const base = appJson.expo as ExpoConfig;
const existingEas = base.extra?.eas as Record<string, unknown> | undefined;
const eas = projectId ? { ...existingEas, projectId } : existingEas;
const config = { ...base, ...(eas ? { extra: { ...base.extra, eas } } : {}) } as ExpoConfig;
export default { expo: config };
