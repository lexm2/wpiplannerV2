# Mock Cloud Provider Guide

## Overview

The Mock Cloud Provider is a development tool that simulates cloud sync functionality without requiring real cloud API credentials. It's designed for both **manual testing in the browser** and **automated testing** in the test suite.

### Key Features

- ✅ **localStorage persistence** - Data survives page reloads
- ✅ **Multi-device simulation** - Test conflicts between "Device A", "Device B", etc.
- ✅ **Browser-based UI** - Control panel for manual testing
- ✅ **Configurable behavior** - Simulate failures, delays, and corruption
- ✅ **Zero impact on production** - Only loads in development mode
- ✅ **Compatible with automated tests** - Works with existing test suite

---

## Quick Start

### Enable Mock Provider

There are three ways to enable the mock provider:

#### 1. URL Parameter (Recommended)

```bash
# Start dev server with mock enabled
bun dev

# Navigate to:
http://localhost:3000/wpiplannerV2/?mock
```

#### 2. Console Command

```javascript
// In browser console, run:
toggleMockProvider()

// Then reload the page
```

#### 3. localStorage Flag

```javascript
// In browser console:
localStorage.setItem('use-mock-provider', 'true');

// Then reload the page
```

### Toggle Control Panel

Once enabled, press **Ctrl+Shift+M** to show/hide the control panel.

---

## Manual Testing Workflow

### Testing Basic Sync

1. **Enable mock provider** with `?mock` URL parameter
2. **Press Ctrl+Shift+M** to open control panel
3. **Sign in** using the "Sign In" button
4. **Create a schedule** in the app
5. **Add some courses** to the schedule
6. **Push data** using the "Push Data" button
7. **Reload the page** - your data persists!
8. **Pull data** using the "Pull Data" button

### Testing Multi-Device Conflicts

This is the primary use case for the mock provider!

#### Step 1: Setup Device A

1. Open browser tab
2. Navigate to `http://localhost:3000/wpiplannerV2/?mock`
3. Press **Ctrl+Shift+M** to open control panel
4. Select **"Device A"** from dropdown
5. Click **"Sign In"**
6. Create a schedule called "Spring 2025"
7. Add courses: CS 1101, CS 2102, CS 2303
8. Click **"Push Data"**
9. **Note the checksum** shown in the Cloud Storage section

#### Step 2: Setup Device B

1. Open **new browser tab** (or incognito window)
2. Navigate to `http://localhost:3000/wpiplannerV2/?mock`
3. Press **Ctrl+Shift+M**
4. Select **"Device B"** from dropdown
5. Click **"Sign In"**
6. Notice: Cloud Storage shows data from Device A!
7. Click **"Pull Data"** to load it
8. **Modify the schedule** (add or remove courses)
9. Click **"Push Data"**

#### Step 3: Trigger Conflict on Device A

1. Go back to **Device A tab**
2. **Don't pull data yet!**
3. **Modify the schedule differently** from Device B
4. Click **"Push Data"** or just wait for auto-sync
5. **Conflict detected!** The conflict resolution modal appears
6. Choose **"Keep Local"** or **"Use Cloud"**
7. Verify the resolution worked correctly

### Testing Conflict Injection

For quickly testing conflict resolution UI:

1. Enable mock provider and sign in
2. Create and push some data
3. Click **"Inject Conflict"** button
4. Try to pull data or wait for auto-sync
5. Conflict resolution modal should appear

---

## Control Panel Reference

### Device Control Section

- **Device Selector**: Switch between Device A, B, and C
- **Sign In/Out Button**: Authenticate/de-authenticate
- **Status Indicator**: Shows authentication status

### Cloud Storage Section

Shows information about current cloud data:
- **Last Update**: How long ago data was pushed
- **Checksum**: First 12 characters of data checksum
- **Schedules**: Number of schedules in cloud
- **Version**: Data version number

Actions:
- **View Data**: Logs cloud data to browser console
- **Clear Cloud**: Removes all cloud data (keeps device state)

### Actions Section

- **Push Data**: Manually trigger push to cloud
- **Pull Data**: Manually fetch data from cloud
- **Inject Conflict**: Modify cloud data to create conflict
- **Clear All Storage**: Remove all mock data (all devices + cloud)

### Operation Log

Shows last 10 operations with:
- ✓ Success indicator (green)
- ✗ Error indicator (red)
- Operation name (e.g., `pushData`, `signIn`)
- Time ago

### Devices Section

Lists all devices that have data in localStorage.

---

## API Reference

### MockProviderConfig

```typescript
interface MockProviderConfig {
    // Multi-device simulation
    deviceId?: string;                    // Device identifier (default: 'device-a')
    useLocalStorage?: boolean;            // Persist to localStorage (default: false)
    localStoragePrefix?: string;          // Storage key prefix (default: 'mock-cloud')

    // Behavior simulation
    authSucceeds?: boolean;               // Auth success/failure (default: true)
    networkDelay?: number;                // Network delay in ms (default: 0)
    pushFails?: boolean;                  // Simulate push failures (default: false)
    pullFails?: boolean;                  // Simulate pull failures (default: false)
    errorToThrow?: Error;                 // Custom error to throw (default: generic error)

    // Data validation
    validateData?: boolean;               // Validate with Zod schemas (default: true)
    verifyChecksums?: boolean;            // Verify checksums on pull (default: true)
    corruptChecksum?: boolean;            // Corrupt checksums (default: false)
}
```

### MockCloudProvider Methods

```typescript
class MockCloudProvider implements CloudProvider {
    // Standard CloudProvider interface
    initialize(): Promise<void>;
    dispose(): void;
    signIn(): Promise<void>;
    signOut(): Promise<void>;
    isAuthenticated(): boolean;
    pushData(data: SyncData): Promise<void>;
    pullData(): Promise<SyncData | null>;

    // Test helper methods
    setCloudData(data: SyncData | null): void;
    getCloudData(): SyncData | null;
    setConfig(config: Partial<MockProviderConfig>): void;
    resetCallHistory(): void;
    reset(): void;

    // Multi-device methods
    getSharedCloudData(): SyncData | null;
    setDeviceId(deviceId: string): void;
    clearAllMockStorage(): void;
    getAllMockDevices(): string[];
    getDeviceId(): string;
}
```

---

## Testing Scenarios

### Scenario 1: Basic Sync Flow

**Goal**: Verify data syncs correctly

```
1. Enable mock provider (?mock)
2. Sign in
3. Create schedule
4. Push data
5. Reload page
6. Pull data
7. Verify schedule is restored
```

**Expected**: Schedule persists and restores correctly

---

### Scenario 2: Multi-Device Conflict (Same Checksum)

**Goal**: Verify no conflict when data is identical

```
Device A:
1. Sign in
2. Create schedule "Test"
3. Push data

Device B:
1. Sign in
2. Pull data (should get Device A's data)
3. Don't modify anything
4. Push data

Device A:
5. Pull data (should succeed with no conflict)
```

**Expected**: No conflict, data is identical

---

### Scenario 3: Multi-Device Conflict (Different Data)

**Goal**: Test conflict resolution

```
Device A:
1. Sign in
2. Create schedule "Test" with CS 1101
3. Push data

Device B:
1. Sign in
2. Pull data
3. Add CS 2102 to schedule
4. Push data

Device A:
5. Add CS 2303 to schedule (different from Device B!)
6. Push data or wait for auto-sync
7. Conflict modal appears
8. Choose resolution (Local or Cloud)
```

**Expected**: Conflict detected and resolved correctly

---

### Scenario 4: Network Failure

**Goal**: Test error handling

```
1. Enable mock provider with slow network preset
2. Sign in
3. Push data
4. Observe loading states
5. Verify error handling if push fails
```

**Expected**: Loading states shown, errors handled gracefully

---

### Scenario 5: Authentication Failure

**Goal**: Test auth error handling

```
1. Configure mock provider with authSucceeds: false
2. Try to sign in
3. Verify error message shown
4. Verify app doesn't crash
```

**Expected**: Auth fails gracefully with error message

---

## Presets

Use pre-configured scenarios from `tests/helpers/mock-provider-presets.ts`:

```typescript
import { MockProviderPresets } from './tests/helpers/mock-provider-presets';

// Manual testing
const mockProvider = new MockCloudProvider(MockProviderPresets.MANUAL_TESTING);

// Multi-device testing
const deviceA = new MockCloudProvider(MockProviderPresets.DEVICE_A);
const deviceB = new MockCloudProvider(MockProviderPresets.DEVICE_B);

// Network simulation
const slowNetwork = new MockCloudProvider(MockProviderPresets.SLOW_NETWORK);

// Failure scenarios
const authFailure = new MockCloudProvider(MockProviderPresets.AUTH_FAILURE);
const pushFailure = new MockCloudProvider(MockProviderPresets.PUSH_FAILURE);

// Automated testing
const fastTest = new MockCloudProvider(MockProviderPresets.AUTOMATED_TEST);
```

Available presets:
- `MANUAL_TESTING` - Default for manual browser testing
- `DEVICE_A`, `DEVICE_B`, `DEVICE_C` - Multi-device scenarios
- `SLOW_NETWORK`, `VERY_SLOW_NETWORK`, `FAST_NETWORK` - Network speeds
- `AUTH_FAILURE`, `PUSH_FAILURE`, `PULL_FAILURE` - Failure scenarios
- `CORRUPTED_DATA` - Data corruption simulation
- `AUTOMATED_TEST` - Fast, in-memory testing
- `FAST_TEST` - Minimal validation for speed
- `STRICT_VALIDATION` - Maximum validation

---

## localStorage Keys

The mock provider uses these localStorage keys:

- `mock-cloud-device-{deviceId}` - Device-specific state (auth, etc.)
- `mock-cloud-cloud` - Shared cloud storage (SyncData)
- `mock-device-id` - Current active device ID
- `use-mock-provider` - Flag to enable mock provider

To clear all mock data:

```javascript
// In browser console:
localStorage.removeItem('mock-cloud-device-device-a');
localStorage.removeItem('mock-cloud-device-device-b');
localStorage.removeItem('mock-cloud-device-device-c');
localStorage.removeItem('mock-cloud-cloud');
localStorage.removeItem('mock-device-id');
```

Or use the "Clear All Storage" button in the control panel.

---

## Troubleshooting

### Control panel not appearing

- Make sure you're in dev mode (not production build)
- Check that `?mock` is in URL or localStorage flag is set
- Try pressing **Ctrl+Shift+M**
- Check browser console for errors

### Data not persisting

- Verify `useLocalStorage: true` in config
- Check localStorage isn't full or disabled
- Open DevTools → Application → Local Storage
- Look for keys starting with `mock-cloud-`

### Conflicts not triggering

- Verify both devices are pushing different data
- Check that checksums are different (shown in control panel)
- Try using "Inject Conflict" button for quick testing
- Check browser console for conflict events

### Changes not syncing

- Verify you're authenticated (green indicator)
- Check Operation Log for errors
- Try manual "Push Data" and "Pull Data"
- Check network delay setting (might just be slow)

---

## Advanced Usage

### Programmatic Control

```typescript
// Access mock provider from console
window.__mockProvider.setDeviceId('device-b');
window.__mockProvider.getSharedCloudData();
window.__mockProvider.clearAllMockStorage();

// Access UI
window.__mockProviderUI.toggle();
```

### Custom Configuration

```typescript
import { createCustomPreset } from './tests/helpers/mock-provider-presets';

const customConfig = createCustomPreset(MockProviderPresets.DEVICE_A, {
    networkDelay: 1500,
    corruptChecksum: true
});

const mockProvider = new MockCloudProvider(customConfig);
```

### Debugging

```typescript
// Enable sync event bus debugging
syncEventBus.setDebugEnabled(true);

// View operation history
window.__mockProvider.callHistory;

// View cloud data
console.log(window.__mockProvider.getSharedCloudData());

// View all devices
console.log(window.__mockProvider.getAllMockDevices());
```

---

## Best Practices

### For Manual Testing

1. **Always use `?mock` URL parameter** for easy enable/disable
2. **Use Control Panel** instead of console commands
3. **Test in incognito** for clean slate
4. **Clear storage** between major test scenarios
5. **Check Operation Log** for debugging

### For Automated Testing

1. **Use presets** instead of manual config
2. **Use `AUTOMATED_TEST` preset** for fast, isolated tests
3. **Don't use localStorage** in automated tests (keeps tests isolated)
4. **Use `networkDelay: 0`** for fast tests
5. **Reset provider** between tests with `mockProvider.reset()`

### For Multi-Device Testing

1. **Use different browser tabs** for each device
2. **Use incognito windows** for complete isolation
3. **Switch devices via UI** instead of localStorage
4. **Check checksum** to verify data differences
5. **Use "Inject Conflict"** for quick conflict testing

---

## Examples

### Example 1: Basic Manual Test

```bash
# 1. Start dev server
bun dev

# 2. Open browser
http://localhost:3000/wpiplannerV2/?mock

# 3. Press Ctrl+Shift+M
# 4. Click "Sign In"
# 5. Create schedule
# 6. Click "Push Data"
# 7. Reload page
# 8. Data persists!
```

### Example 2: Multi-Device Conflict Test

```bash
# Tab 1 (Device A):
1. http://localhost:3000/wpiplannerV2/?mock
2. Ctrl+Shift+M
3. Select "Device A"
4. Sign In
5. Create schedule with CS 1101
6. Push Data

# Tab 2 (Device B):
1. http://localhost:3000/wpiplannerV2/?mock
2. Ctrl+Shift+M
3. Select "Device B"
4. Sign In
5. Pull Data (gets Device A's data)
6. Add CS 2102
7. Push Data

# Back to Tab 1 (Device A):
8. Add CS 2303 (different from Device B!)
9. Push Data
10. Conflict modal appears!
11. Choose resolution
```

### Example 3: Automated Test

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MockCloudProvider } from './tests/mocks/MockCloudProvider';
import { MockProviderPresets } from './tests/helpers/mock-provider-presets';

describe('Cloud Sync', () => {
    let mockProvider: MockCloudProvider;

    beforeEach(async () => {
        mockProvider = new MockCloudProvider(MockProviderPresets.AUTOMATED_TEST);
        await mockProvider.initialize();
    });

    afterEach(() => {
        mockProvider.reset();
    });

    it('should sync data successfully', async () => {
        await mockProvider.signIn();

        const data = await createSyncData();
        await mockProvider.pushData(data);

        const pulled = await mockProvider.pullData();
        expect(pulled).toEqual(data);
    });
});
```

---

## FAQ

**Q: Will the mock provider affect production builds?**
A: No, it only loads in development mode (`import.meta.env.DEV`).

**Q: Can I use this with real cloud providers?**
A: No, you should disable mock provider before testing real providers.

**Q: How do I switch back to real cloud providers?**
A: Remove `?mock` from URL or run `toggleMockProvider()` in console, then reload.

**Q: Can I use mock provider in automated tests?**
A: Yes! Use `MockProviderPresets.AUTOMATED_TEST` for fast, isolated tests.

**Q: How many devices can I simulate?**
A: The UI supports A/B/C, but you can add more by editing localStorage directly.

**Q: Does data sync between tabs automatically?**
A: No, you must manually push/pull. This is intentional for testing conflicts.

**Q: Can I test offline mode?**
A: Yes, sign out or use `authSucceeds: false` in config.

---

## Summary

The Mock Cloud Provider is a powerful tool for:
- ✅ Manual testing without cloud credentials
- ✅ Multi-device conflict simulation
- ✅ Automated testing with configurable scenarios
- ✅ Network failure and error handling testing
- ✅ Data persistence across page reloads

**Quick Start**: `http://localhost:3000/wpiplannerV2/?mock` → **Ctrl+Shift+M**

For questions or issues, check the troubleshooting section or browser console.
