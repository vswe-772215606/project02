# Phase 03-mobile / 00 — Mobile scaffolding

**Goal:** create the waiter mobile app via Expo. Monorepo wiring works (Metro resolves shared packages). Placeholder home screen renders. Connection to master from a phone on the same Wi-Fi works.

**Prerequisites:** master + kitchen apps running. Expo CLI installed (`npx expo` works). Phone on the same Wi-Fi as the dev machine.

## Read first

- `00-shared/decisions.md`, `00-shared/api-contract.md`, `00-shared/conventions.md`

## Tasks

### 1. Create the Expo app

From the repo root:

```sh
cd apps
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
# Remove default git init since we're in a monorepo
rm -rf .git
cd ../..
```

### 2. Configure for monorepo

**`apps/mobile/package.json`**: rename to `@chayxana/mobile`, add scripts:

```json
{
  "name": "@chayxana/mobile",
  "version": "0.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "typecheck": "tsc --noEmit",
    "lint": "echo 'no lint'"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.9.0",
    "@react-native-async-storage/async-storage": "1.23.1",
    "@react-navigation/native": "^6.1.0",
    "@react-navigation/native-stack": "^6.10.0",
    "@tanstack/react-query": "^5.51.0",
    "expo": "~51.0.0",
    "expo-status-bar": "~1.12.0",
    "react": "18.2.0",
    "react-hook-form": "^7.52.0",
    "react-native": "0.74.0",
    "react-native-gesture-handler": "~2.16.0",
    "react-native-safe-area-context": "4.10.0",
    "react-native-screens": "~3.31.0",
    "socket.io-client": "^4.7.5",
    "zod": "^3.23.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/react": "~18.2.45",
    "typescript": "^5.5.0"
  }
}
```

Pin Expo dependency versions to whatever Expo SDK 51 (or the latest stable) requires — exact versions come from `npx expo install` not `npm install`. The agent should use `expo install` to add Expo packages to keep them aligned.

### 3. Configure Metro for monorepo

**`apps/mobile/metro.config.js`** (Expo's official monorepo recipe, simplified):

```js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
```

### 4. Configure tsconfig

**`apps/mobile/tsconfig.json`**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "jsx": "react-jsx"
  },
  "include": ["src/**/*", "App.tsx"]
}
```

### 5. App.json basics

**`apps/mobile/app.json`** — tweak from default:

```json
{
  "expo": {
    "name": "Chayxana Ofitsiant",
    "slug": "chayxana-waiter",
    "version": "0.1.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.chayxana.waiter"
    },
    "web": { "favicon": "./assets/favicon.png" }
  }
}
```

### 6. Folder structure

```
apps/mobile/
├── App.tsx                        # entry, providers + navigation root
├── src/
│   ├── api/
│   │   ├── client.ts              # fetch wrapper
│   │   ├── auth.ts
│   │   ├── menu.ts
│   │   ├── tables.ts
│   │   ├── orders.ts
│   │   └── stock.ts
│   ├── stores/
│   │   ├── auth.store.ts
│   │   └── connection.store.ts
│   ├── hooks/
│   │   └── useSocket.ts
│   ├── navigation/
│   │   └── AppNavigator.tsx
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── HomeScreen.tsx          # placeholder for now
│   │   └── (more in next phases)
│   ├── components/
│   │   └── ConnectionBanner.tsx
│   └── lib/
│       ├── env.ts
│       └── format.ts
└── assets/                        # default Expo assets
```

### 7. Env config

**`apps/mobile/src/lib/env.ts`**

```ts
import Constants from 'expo-constants';

// Read from app.json's "extra" or env, with a default for local dev
export const MASTER_URL =
  (Constants.expoConfig?.extra?.MASTER_URL as string | undefined) ||
  // For local dev, the dev machine's LAN IP is needed since Expo runs in Metro
  // and the phone connects to the dev machine, not localhost.
  // Default to a known LAN IP — override via app.json's `extra` for installations.
  'http://192.168.1.10:4000';
```

To override during dev: edit `app.json` to add:

```json
"expo": {
  ...,
  "extra": {
    "MASTER_URL": "http://<your-laptop-lan-ip>:4000"
  }
}
```

### 8. API client and auth client

Adapt master/kitchen patterns to React Native:

**`apps/mobile/src/api/client.ts`**

Same shape as kitchen's. Token from auth store, fetch with bearer header.

**`apps/mobile/src/api/auth.ts`**

```ts
import { api } from './client';

export const authApi = {
  loginPin: (pin: string) =>
    api.post<{ token: string; user: { id: string; role: string; fullName: string } }>(
      '/api/auth/login-pin',
      { pin },
    ),
  logout: () => api.post<{ ok: true }>('/api/auth/logout'),
  me: () => api.get<{ user: { id: string; role: string; fullName: string } }>('/api/auth/me'),
};
```

Other endpoint files: stubs for now. Will be filled in next mobile phases.

### 9. Auth store with AsyncStorage

**`apps/mobile/src/stores/auth.store.ts`**

Same shape as Electron, but uses `AsyncStorage` instead of `localStorage`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { setAuthToken } from '../api/client';

type User = { id: string; role: string; fullName: string };

type State = {
  user: User | null;
  token: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setAuth: (token: string, user: User) => Promise<void>;
  clearAuth: () => Promise<void>;
};

export const useAuthStore = create<State>((set) => ({
  user: null,
  token: null,
  hydrated: false,

  hydrate: async () => {
    const [t, u] = await Promise.all([
      AsyncStorage.getItem('auth_token'),
      AsyncStorage.getItem('auth_user'),
    ]);
    if (t && u) {
      setAuthToken(t);
      set({ token: t, user: JSON.parse(u), hydrated: true });
    } else {
      set({ hydrated: true });
    }
  },

  setAuth: async (token, user) => {
    setAuthToken(token);
    await AsyncStorage.setItem('auth_token', token);
    await AsyncStorage.setItem('auth_user', JSON.stringify(user));
    set({ token, user });
  },

  clearAuth: async () => {
    setAuthToken(null);
    await AsyncStorage.multiRemove(['auth_token', 'auth_user']);
    set({ token: null, user: null });
  },
}));
```

### 10. Socket hook

**`apps/mobile/src/hooks/useSocket.ts`** — same shape as Electron version. Subscribe to events relevant to the waiter (ticket status changes for their orders, menu availability, stock changes, order:approved/closed/walkout/transferred).

### 11. Connection banner

A small bar at the top of the screen, red when offline:

**`apps/mobile/src/components/ConnectionBanner.tsx`**

```tsx
import { useConnectionStore } from '../stores/connection.store';
import { Text, View } from 'react-native';

export function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);
  if (status === 'online') return null;
  return (
    <View style={{
      backgroundColor: status === 'offline' ? '#dc2626' : '#f59e0b',
      padding: 8,
    }}>
      <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
        {status === 'offline' ? 'Aloqada uzilish' : 'Ulanmoqda...'}
      </Text>
    </View>
  );
}
```

### 12. Login screen with PIN pad

**`apps/mobile/src/screens/LoginScreen.tsx`**

Big numeric PIN pad. 4 dots for entered digits. Buttons 0-9, plus backspace and "Tasdiqlash" (Confirm).

PIN pad layout (rough):

```
[1] [2] [3]
[4] [5] [6]
[7] [8] [9]
[<] [0] [✓]
```

Each button at least 80×80 px, font-size 28+. On 4-digit entry + Confirm tap, calls `authApi.loginPin(pin)`. On success, `setAuth(token, user)`. On error, show Uzbek message ("Noto'g'ri PIN" / "Hisob bloklangan").

### 13. Placeholder home screen

**`apps/mobile/src/screens/HomeScreen.tsx`**

Top: greeting "Salom, [name]". Logout button. Connection banner.
Body: text "Buyurtmalar bu yerda paydo bo'ladi" + a "Test API" button that calls `GET /api/menu` and shows the count of returned categories.

### 14. AppNavigator

**`apps/mobile/src/navigation/AppNavigator.tsx`**

```tsx
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/auth.store';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';

const Stack = createNativeStackNavigator();

export function AppNavigator() {
  const user = useAuthStore((s) => s.user);
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Home" component={HomeScreen} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

### 15. App.tsx

```tsx
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from './src/stores/auth.store';
import { useSocket } from './src/hooks/useSocket';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ConnectionBanner } from './src/components/ConnectionBanner';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Inner() {
  useSocket();
  return (
    <>
      <ConnectionBanner />
      <AppNavigator />
    </>
  );
}

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) return null; // splash handled by Expo

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <Inner />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

### 16. Update root scripts

```json
"scripts": {
  ...,
  "dev:mobile": "pnpm --filter @chayxana/mobile start",
  ...
}
```

### 17. Install + run

```sh
pnpm install
cd apps/mobile
npx expo install --fix    # ensure Expo deps are aligned
cd ../..
pnpm dev:mobile
```

Scan QR with Expo Go (or use a dev client build). The app loads on the phone.

## Constraints

- No real order screens yet. Placeholder home screen only.
- No offline queue. Hard-fail per `decisions.md`.
- Don't `expo prebuild` / eject. Stay in managed workflow.
- Don't store anything except the auth token and user in AsyncStorage. No drafts cached locally.
- The phone must be on the same Wi-Fi as the master. Document this.

## Verification

### V1. Typecheck

```sh
pnpm typecheck
```

### V2. App boots on phone

`pnpm dev:mobile`. Scan QR. App opens. Login screen renders.

### V3. Login as waiter

Enter PIN `5678` (seeded waiter Botir). Confirm. Home screen renders showing "Salom, Waiter Botir".

### V4. API connectivity

Tap "Test API". Shows count of menu categories from master.

### V5. Connection banner

Stop master. Banner turns red. Restart master. Banner green.

### V6. Persistence

Force-close the app. Reopen. Still logged in (auth token persisted in AsyncStorage).

### V7. Wrong PIN

Enter `0000`. Server rejects (trivial PINs are rejected at hash time, but `0000` was never hashed → returns generic auth fail). Show Uzbek error.

Lock test: enter wrong PIN 5 times. 6th attempt shows "Hisob bloklangan" / "Account locked".

## Definition of done

- [ ] Expo app boots in Expo Go.
- [ ] Monorepo Metro resolution works.
- [ ] PIN login works.
- [ ] AsyncStorage persistence works.
- [ ] Connection banner reflects status.
- [ ] Master sees the mobile socket connection.
- [ ] Typecheck passes (across all packages).

Move to `03-mobile/01-pin-login.md` (polish + edge cases) or directly to `03-mobile/02-order-flow.md` if PIN login already feels solid.
