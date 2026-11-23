# Nasarawa Newsline Mobile

Expo SDK 58 / React Native application for the Nasarawa Newsline WordPress site.

## Requirements and run

- Node.js LTS and npm
- Expo Go for ordinary UI and feed work; an Android development build for remote push notifications

```bash
npm install
npx expo start
```

The Android app uses the WordPress REST API at `https://nasarawanewsline.com.ng/wp-json/wp/v2`.

## Offline reading

`src/offline.ts` stores article snapshots and metadata in `expo-sqlite` (`newsline_offline.db`, schema version 1) and featured images in the app documents directory. A failed/missing image leaves the text article available with a placeholder. Saving a story means downloading it for offline reading. The Offline tab lists downloads and supports removal; Settings also offers a remove-all action. Existing downloads are reused, concurrent attempts for one story are coalesced, and removal only deletes files in the app's offline image folder. Downloaded article links and remote inline images are disabled/omitted in the offline reader.

## Push notifications

Push delivery requires a physical device, an EAS development or production build, an EAS project ID, and the separately deployed Node service. Remote push is not supported by Expo Go on Android; use an EAS development build on the Galaxy S24. Notification permission is requested after the reader opts in in Settings, and new installs default to off. Android alerts use the `news` channel. Tapping an alert opens the target article, preferring its local download if present.

The mobile app reads these **public configuration values** at build/runtime:

- `EXPO_PUBLIC_EAS_PROJECT_ID` — your EAS project UUID
- `EXPO_PUBLIC_NOTIFICATION_API_URL` — HTTPS base URL of the deployed service, without a trailing slash

Copy `.env.example` to `.env` for local development. Configure the same values as EAS environment variables for cloud builds. These are endpoint identifiers, not secrets. Never add the newsroom admin token or Expo access token to the app or an `EXPO_PUBLIC_` variable.

### Node service and newsroom alerts

`backend/server.mjs` is a small Node 20+ HTTP service. It stores device tokens and preferences in a JSON file on a persistent volume, accepts token registration/preferences, sends Expo Push API batches, removes invalid tokens from tickets and receipts, and offers a guarded newsroom alert endpoint. Put it behind HTTPS, configure a persistent writable `STATE_FILE`, and keep the admin token in the host's secret manager. Its in-process rate limit is a basic guard; a public/high-volume deployment should also use host-level rate limiting and persistent database storage.

1. Deploy `backend/server.mjs` to a Node host with persistent storage; configure `backend/.env.example` values. Generate `NEWSROOM_ADMIN_TOKEN` as a long random secret (at least 32 characters). `EXPO_ACCESS_TOKEN` is optional and belongs only on the server.
2. Set the mobile EAS project ID and HTTPS service URL. Run `eas init` once if this app is not yet linked, then use that project's UUID as `EXPO_PUBLIC_EAS_PROJECT_ID`. Configure Android FCM v1 push credentials in EAS (`eas credentials`) before sending production push; download or upload the Firebase service-account key through EAS and never commit it.
3. Build and install the development client as described below. Open Settings and opt into notifications. The client registers its Expo push token and syncs category, local area, and alert toggles.
4. The newsroom explicitly authorizes each alert by calling the backend. There is no alert for every WordPress post:

```bash
curl -X POST "$NEWSLINE_PUSH_URL/newsroom/alert" \
  -H "Authorization: Bearer $NEWSROOM_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"kind":"breaking","articleId":123,"title":"Breaking headline","body":"Short summary","categoryId":7}'
```

Allowed `kind` values are `breaking`, `major`, and `local`. Local alerts require an `lga` field matching the user's saved LGA. The optional category ID filters out readers who selected other categories. Validate newsroom staff access and audit the trigger in the hosting or newsroom workflow before granting the bearer secret. The WordPress host and publishing credentials were not available here, so this standalone service is the integration; it does not automatically publish or trigger from WordPress.

The service has `GET /health`, `POST /register`, `PUT /preferences`, and authenticated `POST /newsroom/alert` routes. Alert requests validate IDs and fields; registration accepts Expo token identifiers, and only the newsroom alert route requires the admin secret. A first deployment needs persistent storage and HTTPS.

## Android development and release builds

Install EAS CLI (if needed), link the EAS project, and create the development APK:

```bash
npm install --global eas-cli
eas login
eas init
eas build --platform android --profile development
```

Install that APK on the Galaxy S24, then run `npx expo start --dev-client` and open the installed development app. Keep the phone online for registration and delivery tests. For store and direct distribution builds:

```bash
eas build --platform android --profile preview       # installable APK
eas build --platform android --profile production    # Play Store AAB
```

## Checks

```bash
npm run typecheck
npx expo install --check
```

No device QA, live backend deployment, production push receipt, or EAS build has been run from this workspace. Configure the service and EAS project before presenting push toggles as active; until then Settings labels delivery as not configured.
