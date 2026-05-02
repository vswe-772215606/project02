# Phase 03-mobile / 01 — PIN login polish

**Goal:** harden the login experience. Auto-clear after wrong PIN. Lockout countdown displayed. Logout flow. Splash handling.

**Prerequisites:** `03-mobile/00-scaffolding.md`. PIN login already works at the basic level — this phase polishes it before building order flows.

If your PIN login is already solid from phase 00, this phase is short and you can mostly skip to phase 02.

## Tasks

### 1. PIN entry UX

In `LoginScreen.tsx`:

- After 4 digits entered, **auto-submit** without requiring "Tasdiqlash" tap. Faster UX during shift starts.
- On wrong PIN, **clear the entered digits and shake** the dot row briefly (use `react-native-reanimated` if available, or a simple opacity flash if not). Show error message below for ~3 seconds.
- Show only the dots filled in so far; never display the actual digits.

### 2. Lockout countdown

When server returns `LOCKED` (HTTP 423), it includes `details: { until: ISO date }` per `errors.ts`. In the UI:

- Disable PIN buttons.
- Show "Hisob bloklangan. Yana kirish: HH:MM:SS" with a live-updating countdown.
- When countdown reaches zero, re-enable buttons.

### 3. Logout flow

In `HomeScreen.tsx` (placeholder for now), the logout button:

- Confirms via `Alert.alert` ("Chiqishni xohlaysizmi?").
- Calls `authApi.logout()`.
- Calls `auth.clearAuth()` regardless of success.
- Returns to LoginScreen automatically (auth state change triggers AppNavigator re-render).

### 4. Session expiry handling

In the `client.ts` fetch wrapper, if any request returns 401:

- Call `auth.clearAuth()`.
- Surface a one-time toast/alert "Sessiya tugadi, qaytadan kiring".

### 5. Splash + hydration

Keep splash visible until `hydrate()` completes. Use `expo-splash-screen` if needed:

```sh
cd apps/mobile
npx expo install expo-splash-screen
cd ../..
```

In `App.tsx`:

```tsx
import * as SplashScreen from 'expo-splash-screen';
SplashScreen.preventAutoHideAsync();

// in App component:
useEffect(() => {
  void (async () => {
    await hydrate();
    await SplashScreen.hideAsync();
  })();
}, []);
```

### 6. Handle "single device" disconnection

If the waiter logs in on a second device, the first device's token is invalidated (server-side single-device rule). On the first device, the next API call returns 401. The 401-handler from step 4 already covers this — verify it works:

1. Device A: log in.
2. Device B (or another phone): log in with same PIN.
3. Device A: try any action. Should bounce to login with a message.

## Verification

### V1. Auto-submit

Enter 4 digits. PIN submits automatically. No "Tasdiqlash" needed.

### V2. Wrong PIN clears

Enter wrong PIN. Dots clear. Error shown. Try again immediately.

### V3. Lockout countdown

Enter wrong PIN 5 times. 6th attempt locks. UI shows countdown. After 5 minutes, re-enable.

### V4. Logout

From home, tap logout, confirm. Return to login screen. Token cleared from AsyncStorage.

### V5. Session expiry

Log in. Manually delete the session row from PG (`DELETE FROM "Session" WHERE userId = ...`). Trigger any action. App returns to login with a "Sessiya tugadi" message.

### V6. Single device

Two phones, same PIN. Second login kicks first off.

## Definition of done

- [ ] Auto-submit on 4 digits.
- [ ] Wrong PIN clears + shake.
- [ ] Lockout countdown shown.
- [ ] Logout works.
- [ ] 401 handler returns to login.
- [ ] Single-device kick works.
- [ ] Splash handled cleanly.

Move to `03-mobile/02-order-flow.md`.
