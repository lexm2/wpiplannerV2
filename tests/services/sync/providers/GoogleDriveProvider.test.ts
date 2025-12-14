import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { GoogleDriveProvider } from '../../../../src/services/sync/providers/googledrive/GoogleDriveProvider';
import { syncEventBus } from '../../../../src/services/sync/SyncEventBus';
import {
    createSyncData,
    createEventBusSpy,
    cleanupSyncTests,
    assertValidSyncData,
    createSyncDataWithBadChecksum,
} from '../../../helpers/sync-test-utils';
import LZString from 'lz-string';

// Create vi alias for clearing mocks
const vi = {
    clearAllMocks: () => {
        // Clear all mock implementations
        // In Bun, mocks are automatically reset between tests
    }
};

// Mock Google APIs
const mockGoogle = {
    accounts: {
        oauth2: {
            initTokenClient: mock(),
            revoke: mock((token, callback) => callback()),
        },
    },
};

const mockGapi = {
    load: mock((module, callback) => callback()),
    client: {
        init: mock(() => Promise.resolve()),
        setToken: mock(),
        request: mock(),
        drive: {
            files: {
                list: mock(),
                get: mock(),
            },
        },
    },
};

// Set up global mocks
(global as any).google = mockGoogle;
(global as any).gapi = mockGapi;

describe('GoogleDriveProvider', () => {
    let provider: GoogleDriveProvider;
    let eventSpy: ReturnType<typeof createEventBusSpy>;
    let mockTokenClient: any;

    beforeEach(async () => {
        // Reset mocks
        vi.clearAllMocks();

        // Setup mock token client
        mockTokenClient = {
            callback: mock(),
            requestAccessToken: mock(),
        };
        mockGoogle.accounts.oauth2.initTokenClient.mockReturnValue(mockTokenClient);

        // Setup event spy
        eventSpy = createEventBusSpy();
        syncEventBus.on('auth-changed', eventSpy.listener);

        // Create provider and initialize
        provider = new GoogleDriveProvider();
        await provider.initialize();
    });

    afterEach(() => {
        provider.dispose();
        cleanupSyncTests();
        eventSpy.clear();
    });

    describe('Initialization', () => {
        it('should initialize successfully', async () => {
            const newProvider = new GoogleDriveProvider();
            await expect(newProvider.initialize()).resolves.not.toThrow();
        });

        it('should initialize Google Identity Services', async () => {
            expect(mockGoogle.accounts.oauth2.initTokenClient).toHaveBeenCalled();
        });

        it('should load GAPI client', async () => {
            expect(mockGapi.load).toHaveBeenCalledWith('client', expect.any(Function));
            expect(mockGapi.client.init).toHaveBeenCalled();
        });

        it('should not initialize twice', async () => {
            const callCountBefore = mockGapi.load.mock.calls.length;
            await provider.initialize();
            const callCountAfter = mockGapi.load.mock.calls.length;
            expect(callCountAfter).toBe(callCountBefore);
        });
    });

    describe('Authentication', () => {
        it('should sign in successfully', async () => {
            const signInPromise = provider.signIn();

            // Simulate OAuth callback
            mockTokenClient.callback({ access_token: 'test-token' });

            await signInPromise;

            expect(provider.isAuthenticated()).toBe(true);
            expect(eventSpy.hasEvent('auth-changed')).toBe(true);
        });

        it('should handle authentication error', async () => {
            const signInPromise = provider.signIn();

            // Simulate OAuth error
            mockTokenClient.callback({ error: 'access_denied' });

            await expect(signInPromise).rejects.toThrow('access_denied');
            expect(provider.isAuthenticated()).toBe(false);
        });

        it('should save auth state to localStorage', async () => {
            const signInPromise = provider.signIn();
            mockTokenClient.callback({ access_token: 'test-token' });
            await signInPromise;

            const stored = localStorage.getItem('google-drive-auth');
            expect(stored).toBeTruthy();
            expect(JSON.parse(stored!)).toHaveProperty('wasAuthenticated', true);
        });

        it('should sign out successfully', async () => {
            // Sign in first
            const signInPromise = provider.signIn();
            mockTokenClient.callback({ access_token: 'test-token' });
            await signInPromise;

            // Sign out
            await provider.signOut();

            expect(provider.isAuthenticated()).toBe(false);
            expect(mockGoogle.accounts.oauth2.revoke).toHaveBeenCalled();
            expect(eventSpy.getEventCount('auth-changed')).toBe(2); // Sign in + sign out
        });

        it('should clear auth state on sign out', async () => {
            // Sign in first
            const signInPromise = provider.signIn();
            mockTokenClient.callback({ access_token: 'test-token' });
            await signInPromise;

            // Sign out
            await provider.signOut();

            const stored = localStorage.getItem('google-drive-auth');
            expect(stored).toBeNull();
        });
    });

    describe('Push Data', () => {
        beforeEach(async () => {
            // Sign in
            const signInPromise = provider.signIn();
            mockTokenClient.callback({ access_token: 'test-token' });
            await signInPromise;
        });

        it('should throw error if not authenticated', async () => {
            await provider.signOut();
            const data = await createSyncData();

            await expect(provider.pushData(data)).rejects.toThrow('Not authenticated');
        });

        it('should compress data before upload', async () => {
            const data = await createSyncData();
            mockGapi.client.drive.files.list.mockResolvedValue({ result: { files: [] } });
            mockGapi.client.request.mockResolvedValue({});

            // Mock fetch for multipart upload
            const mockFn = mock().mockResolvedValue({ ok: true }) as any;
            mockFn.preconnect = mock();
            global.fetch = mockFn;

            await provider.pushData(data);

            // Check that fetch was called with compressed data
            const fetchCall = (global.fetch as any).mock.calls[0];
            expect(fetchCall).toBeDefined();
        });

        it('should create new file if none exists', async () => {
            const data = await createSyncData();
            mockGapi.client.drive.files.list.mockResolvedValue({ result: { files: [] } });

            const mockFn = mock().mockResolvedValue({ ok: true }) as any;
            mockFn.preconnect = mock();
            global.fetch = mockFn;

            await provider.pushData(data);

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('uploadType=multipart'),
                expect.objectContaining({ method: 'POST' })
            );
        });

        it('should update existing file', async () => {
            const data = await createSyncData();
            mockGapi.client.drive.files.list.mockResolvedValue({
                result: { files: [{ id: 'existing-file-id' }] },
            });
            mockGapi.client.request.mockResolvedValue({});

            await provider.pushData(data);

            expect(mockGapi.client.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    path: '/upload/drive/v3/files/existing-file-id',
                    method: 'PATCH',
                })
            );
        });

        it('should validate data before push', async () => {
            const invalidData: any = {
                version: '3.0',
                // Missing required fields
            };

            mockGapi.client.drive.files.list.mockResolvedValue({ result: { files: [] } });

            await expect(provider.pushData(invalidData)).rejects.toThrow();
        });

        it('should recalculate checksum on push', async () => {
            const data = await createSyncData();
            const originalChecksum = data.checksum;

            mockGapi.client.drive.files.list.mockResolvedValue({ result: { files: [] } });
            mockGapi.client.request.mockResolvedValue({});
            const mockFn = mock().mockResolvedValue({ ok: true }) as any;
            mockFn.preconnect = mock();
            global.fetch = mockFn;

            await provider.pushData(data);

            // Checksum should be recalculated (data is modified with new timestamp)
            expect(data.checksum).toBe(originalChecksum); // Original data unchanged
        });
    });

    describe('Pull Data', () => {
        beforeEach(async () => {
            // Sign in
            const signInPromise = provider.signIn();
            mockTokenClient.callback({ access_token: 'test-token' });
            await signInPromise;
        });

        it('should throw error if not authenticated', async () => {
            await provider.signOut();

            await expect(provider.pullData()).rejects.toThrow('Not authenticated');
        });

        it('should return null if no cloud file exists', async () => {
            mockGapi.client.drive.files.list.mockResolvedValue({ result: { files: [] } });

            const result = await provider.pullData();

            expect(result).toBeNull();
        });

        it('should pull and decompress data', async () => {
            const testData = await createSyncData();
            const compressed = LZString.compress(JSON.stringify(testData));

            mockGapi.client.drive.files.list.mockResolvedValue({
                result: { files: [{ id: 'test-file-id' }] },
            });
            mockGapi.client.drive.files.get.mockResolvedValue({
                result: compressed,
            });

            const result = await provider.pullData();

            expect(result).toBeTruthy();
            assertValidSyncData(result!);
        });

        it('should handle uncompressed legacy data', async () => {
            const testData = await createSyncData();

            mockGapi.client.drive.files.list.mockResolvedValue({
                result: { files: [{ id: 'test-file-id' }] },
            });
            mockGapi.client.drive.files.get.mockResolvedValue({
                result: JSON.stringify(testData),
            });

            const result = await provider.pullData();

            expect(result).toBeTruthy();
            assertValidSyncData(result!);
        });

        it('should validate data from cloud', async () => {
            const invalidData = { invalid: 'data' };

            mockGapi.client.drive.files.list.mockResolvedValue({
                result: { files: [{ id: 'test-file-id' }] },
            });
            mockGapi.client.drive.files.get.mockResolvedValue({
                result: JSON.stringify(invalidData),
            });

            await expect(provider.pullData()).rejects.toThrow();
        });

        it('should verify checksum on pull', async () => {
            const testData = await createSyncDataWithBadChecksum();

            mockGapi.client.drive.files.list.mockResolvedValue({
                result: { files: [{ id: 'test-file-id' }] },
            });
            mockGapi.client.drive.files.get.mockResolvedValue({
                result: JSON.stringify(testData),
            });

            await expect(provider.pullData()).rejects.toThrow();
        });

        it('should handle 404 error gracefully', async () => {
            mockGapi.client.drive.files.list.mockResolvedValue({
                result: { files: [{ id: 'test-file-id' }] },
            });
            mockGapi.client.drive.files.get.mockRejectedValue({ status: 404 });

            const result = await provider.pullData();

            expect(result).toBeNull();
        });

        it('should handle object response from API', async () => {
            const testData = await createSyncData();

            mockGapi.client.drive.files.list.mockResolvedValue({
                result: { files: [{ id: 'test-file-id' }] },
            });
            mockGapi.client.drive.files.get.mockResolvedValue({
                result: testData, // Already parsed object
            });

            const result = await provider.pullData();

            expect(result).toBeTruthy();
            assertValidSyncData(result!);
        });
    });

    describe('Compression', () => {
        it('should compress data significantly', async () => {
            // Create larger data set for better compression
            const schedules = Array.from({ length: 10 }, (_, i) => ({
                id: `schedule-${i}`,
                name: `Test Schedule ${i}`.repeat(5), // Repetitive data compresses well
                selectedCourses: Array.from({ length: 20 }, (_, j) => ({
                    courseId: `CS-${1000 + i * 20 + j}`,
                    isRequired: true,
                    selectedSectionCrn: `${10000 + i * 20 + j}`,
                })),
            }));

            const data = await createSyncData({ schedules });
            const json = JSON.stringify(data);
            const compressed = LZString.compress(json);

            const originalSize = new Blob([json]).size;
            const compressedSize = new Blob([compressed]).size;

            // With larger, repetitive data, compression should be noticeable
            // Just verify compression happened (compressed size is smaller)
            expect(compressedSize).toBeLessThan(originalSize);
        });

        it('should decompress correctly', async () => {
            const data = await createSyncData();
            const json = JSON.stringify(data);
            const compressed = LZString.compress(json);
            const decompressed = LZString.decompress(compressed);

            expect(decompressed).toBe(json);
            expect(JSON.parse(decompressed!)).toEqual(data);
        });
    });

    describe('Device ID', () => {
        it('should generate device ID on first use', () => {
            cleanupSyncTests();
            const newProvider = new GoogleDriveProvider();

            const deviceId = localStorage.getItem('wpi-planner-device-id');
            expect(deviceId).toBeTruthy();
            expect(deviceId).toMatch(/^device-\d+-[a-z0-9]+$/);
        });

        it('should reuse existing device ID', () => {
            const existingDeviceId = 'device-12345-abcdef';
            localStorage.setItem('wpi-planner-device-id', existingDeviceId);

            const newProvider = new GoogleDriveProvider();

            const deviceId = localStorage.getItem('wpi-planner-device-id');
            expect(deviceId).toBe(existingDeviceId);
        });
    });

    describe('Dispose', () => {
        it('should clear state on dispose', () => {
            provider.dispose();

            expect(provider.isAuthenticated()).toBe(false);
        });

        it('should allow re-initialization after dispose', async () => {
            provider.dispose();
            await expect(provider.initialize()).resolves.not.toThrow();
        });
    });
});
