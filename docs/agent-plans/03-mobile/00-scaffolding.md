# Phase 03-mobile / 00 — Mobile scaffolding

**Goal:** create the waiter mobile app via Expo. Monorepo wiring works (Metro resolves shared packages). Placeholder home screen renders. Connection to master from a phone on the same Wi-Fi works.

**Prerequisites:** master + kitchen apps running. Expo CLI installed (`npx expo` works). Phone on the same Wi-Fi as the dev machine.

## ✅ COMPLETED — verified 2026-05-03

App boots in Expo Go. PIN 5678 logs in. "Test API" shows "menyuda 5 ta kategoriya bor".

---

## Critical: pnpm + Expo monorepo gotchas

This setup took significant debugging. Do not diverge from these choices without understanding why each one exists.

### 1. Root `.npmrc` — must use hoisted layout

**`~/.../chayxana/.npmrc`** (workspace root):

```ini
node-linker=hoisted
shamefully-hoist=true
```

**Why:** pnpm's default symlinked layout breaks Expo's module resolution. `expo/AppEntry.js` does `import App from '../../App'` — in the default pnpm tree, that path resolves to the workspace root, not `apps/mobile/`. `node-linker=hoisted` makes pnpm build a flat `node_modules` (like npm/yarn), so all packages are available where Expo expects them.

After adding `.npmrc`, always do a full wipe + reinstall:
```sh
rm -rf node_modules apps/master/node_modules apps/kitchen/node_modules apps/mobile/node_modules
rm -f pnpm-lock.yaml
pnpm install
# Regenerate Prisma client (wiped with node_modules):
cd apps/master && pnpm prisma generate && cd ../..
```

### 2. Custom entry file — do NOT use `expo/AppEntry`

**`apps/mobile/index.js`:**

```js
import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);
```

**`apps/mobile/package.json`** `main` field:

```json
"main": "./index.js"
```

**Why:** Even with hoisted layout, `expo/AppEntry.js` lives in the root `node_modules/expo/` and does `import App from '../../App'`, which resolves to the workspace root (no `App.tsx` there). The custom `index.js` inside `apps/mobile/` does `import App from './App'` — relative to its own directory — which correctly finds `apps/mobile/App.tsx`.

### 3. Metro config — must pin React with `extraNodeModules`

**`apps/mobile/metro.config.js`:**

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

// Force single canonical path for React packages so Metro never bundles two copies.
// Without this, Metro can resolve 'react' from two different path strings that
// both point to the same physical file — causing "Invalid hook call" runtime crashes.
config.resolver.extraNodeModules = {
  react: path.resolve(workspaceRoot, 'node_modules/react'),
  'react-native': path.resolve(workspaceRoot, 'node_modules/react-native'),
  'react-dom': path.resolve(workspaceRoot, 'node_modules/react-dom'),
};

config.resolver.disableHierarchicalLookup = false;
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
```

**Why:** Without `extraNodeModules`, Metro can resolve `react` via two different string paths (one from `nodeModulesPaths`, one from normal Node traversal). Even though both resolve to the same physical file, Metro treats them as separate module instances. This causes "Warning: Invalid hook call / Cannot read property 'useRef' of null" at runtime. `extraNodeModules` pins each key to an absolute path, guaranteeing a single instance.

### 4. Development: use `--tunnel` if LAN doesn't work

If `exp://192.168.1.50:8081` fails on the phone with a network error, the router likely has **AP isolation** (client devices can't talk to each other). Fix:

```sh
# Install once globally:
npm install -g @expo/ngrok@^4.1.0

# Then start with tunnel:
cd apps/mobile
npx expo start --tunnel --clear
```

The tunnel routes through ngrok's servers so the phone doesn't need LAN access to the dev machine.

---

## Actual working configuration

### Package versions (what actually works together)

```json
"expo": "~54.0.34",
"react": "19.1.0",
"react-native": "0.81.5",
"react-dom": "19.1.0",
"@react-native-async-storage/async-storage": "2.2.0",
"@react-navigation/native": "^6.1.17",
"@react-navigation/native-stack": "^6.9.26",
"@tanstack/react-query": "^5.51.0",
"expo-asset": "~12.0.13",
"expo-constants": "~18.0.13",
"expo-status-bar": "~3.0.9",
"lucide-react-native": "^0.400.0",
"react-hook-form": "^7.52.0",
"react-native-gesture-handler": "~2.28.0",
"react-native-safe-area-context": "5.6.2",
"react-native-screens": "~4.16.0",
"react-native-web": "^0.21.0",
"react-native-svg": "(installed, required by lucide-react-native)",
"socket.io-client": "^4.7.5",
"zod": "^3.23.0",
"zustand": "^4.5.0"
```

---

## Folder structure (as built)

```
apps/mobile/
├── index.js                       # custom entry — see gotcha #2 above
├── App.tsx                        # providers + navigation root
├── app.json                       # includes extra.MASTER_URL
├── metro.config.js                # monorepo config — see gotcha #3 above
├── src/
│   ├── api/
│   │   ├── client.ts              # fetch wrapper with bearer auth
│   │   └── auth.ts                # loginPin, logout, me
│   ├── stores/
│   │   ├── auth.store.ts          # zustand + AsyncStorage
│   │   └── connection.store.ts    # online/offline status
│   ├── hooks/
│   │   └── useSocket.ts           # socket.io connection, waiter events
│   ├── navigation/
│   │   └── AppNavigator.tsx       # NavigationContainer, Login/Home stack
│   ├── screens/
│   │   ├── LoginScreen.tsx        # 4-digit PIN pad
│   │   └── HomeScreen.tsx         # placeholder + Test API button
│   ├── components/
│   │   └── ConnectionBanner.tsx   # red bar when offline
│   └── lib/
│       └── env.ts                 # MASTER_URL from app.json extra
└── assets/
```

## Env config

**`apps/mobile/app.json`** extra field:

```json
"extra": {
  "MASTER_URL": "http://192.168.1.50:4000"
}
```

Dev machine LAN IP is `192.168.1.50`. Master backend listens on port `4000`.

## Scripts

Root `package.json` should include:

```json
"dev:mobile": "pnpm --filter @chayxana/mobile start"
```

Run with: `pnpm dev:mobile` or `cd apps/mobile && npx expo start --tunnel --clear`

## Verification (all passed)

- [x] Expo app boots in Expo Go on Android phone
- [x] PIN `5678` (Botir) logs in, home screen shows "Salom, Botir"
- [x] "Test API" button calls `GET /api/menu`, shows category count ("menyuda 5 ta kategoriya bor")
- [x] Connection banner visible when master is offline
- [x] Monorepo Metro resolution works (no "Unable to resolve module" errors)
- [x] No duplicate React instances (no "Invalid hook call" errors)

## Definition of done

- [x] Expo app boots in Expo Go.
- [x] Monorepo Metro resolution works.
- [x] PIN login works.
- [x] AsyncStorage persistence works.
- [x] Connection banner reflects status.
- [x] Master sees the mobile socket connection.

Move to `03-mobile/01-pin-login.md` (PIN polish + lockout + logout) or `03-mobile/02-order-flow.md`.
