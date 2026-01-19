import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { TermBoundsService } from '../../../src/services/data/TermBoundsService';
import type { TermBoundsData } from '../../../src/services/calendar/types';

describe('TermBoundsService', () => {
    let service: TermBoundsService;

    beforeEach(() => {
        service = TermBoundsService.getInstance();
        service._resetForTesting();
    });

    describe('Singleton Pattern', () => {
        it('should return the same instance', () => {
            const instance1 = TermBoundsService.getInstance();
            const instance2 = TermBoundsService.getInstance();
            expect(instance1).toBe(instance2);
        });
    });

    describe('loadTermBounds', () => {
        const mockTermBoundsData: TermBoundsData = {
            academicYear: '2025-2026',
            generated: '2025-01-01T00:00:00.000Z',
            terms: {
                A: {
                    startDate: '2025-08-21',
                    endDate: '2025-10-10',
                    offeringPeriod: '202501',
                    sampleSize: 814
                },
                B: {
                    startDate: '2025-10-20',
                    endDate: '2025-12-12',
                    offeringPeriod: '202502',
                    sampleSize: 835
                },
                C: {
                    startDate: '2026-01-14',
                    endDate: '2026-03-06',
                    offeringPeriod: '202503',
                    sampleSize: 768
                },
                D: {
                    startDate: '2026-03-16',
                    endDate: '2026-05-06',
                    offeringPeriod: '202504',
                    sampleSize: 698
                }
            }
        };

        it('should successfully load term bounds from JSON', async () => {
            const mockFetch = mock(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockTermBoundsData)
                } as Response)
            );

            global.fetch = mockFetch as any;

            await service.loadTermBounds();

            expect(service.isLoaded()).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith('/term-bounds.json');
        });

        it('should handle fetch failure gracefully', async () => {
            const mockFetch = mock(() =>
                Promise.resolve({
                    ok: false,
                    statusText: 'Not Found'
                } as Response)
            );

            global.fetch = mockFetch as any;

            await service.loadTermBounds();

            expect(service.isLoaded()).toBe(false);
        });

        it('should handle invalid JSON gracefully', async () => {
            const mockFetch = mock(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ invalid: 'data' })
                } as Response)
            );

            global.fetch = mockFetch as any;

            await service.loadTermBounds();

            expect(service.isLoaded()).toBe(false);
        });

        it('should handle network errors gracefully', async () => {
            const mockFetch = mock(() =>
                Promise.reject(new Error('Network error'))
            );

            global.fetch = mockFetch as any;

            await service.loadTermBounds();

            expect(service.isLoaded()).toBe(false);
        });
    });

    describe('getTermDates', () => {
        const mockTermBoundsData: TermBoundsData = {
            academicYear: '2025-2026',
            generated: '2025-01-01T00:00:00.000Z',
            terms: {
                A: {
                    startDate: '2025-08-21',
                    endDate: '2025-10-10',
                    offeringPeriod: '202501',
                    sampleSize: 814
                },
                B: {
                    startDate: '2025-10-20',
                    endDate: '2025-12-12',
                    offeringPeriod: '202502',
                    sampleSize: 835
                },
                C: {
                    startDate: '2026-01-14',
                    endDate: '2026-03-06',
                    offeringPeriod: '202503',
                    sampleSize: 768
                },
                D: {
                    startDate: '2026-03-16',
                    endDate: '2026-05-06',
                    offeringPeriod: '202504',
                    sampleSize: 698
                }
            }
        };

        beforeEach(async () => {
            const mockFetch = mock(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockTermBoundsData)
                } as Response)
            );

            global.fetch = mockFetch as any;
            await service.loadTermBounds();
        });

        it('should return correct dates for Term A', () => {
            const dates = service.getTermDates('A');
            expect(dates).not.toBeNull();
            expect(dates!.start).toEqual(new Date('2025-08-21'));
            expect(dates!.end).toEqual(new Date('2025-10-10'));
        });

        it('should return correct dates for Term B', () => {
            const dates = service.getTermDates('B');
            expect(dates).not.toBeNull();
            expect(dates!.start).toEqual(new Date('2025-10-20'));
            expect(dates!.end).toEqual(new Date('2025-12-12'));
        });

        it('should return correct dates for Term C', () => {
            const dates = service.getTermDates('C');
            expect(dates).not.toBeNull();
            expect(dates!.start).toEqual(new Date('2026-01-14'));
            expect(dates!.end).toEqual(new Date('2026-03-06'));
        });

        it('should return correct dates for Term D', () => {
            const dates = service.getTermDates('D');
            expect(dates).not.toBeNull();
            expect(dates!.start).toEqual(new Date('2026-03-16'));
            expect(dates!.end).toEqual(new Date('2026-05-06'));
        });

        it('should handle year transitions correctly', () => {
            const termA = service.getTermDates('A');
            const termC = service.getTermDates('C');

            expect(termA!.start.getFullYear()).toBe(2025);
            expect(termC!.start.getFullYear()).toBe(2026);
        });
    });

    describe('getTermDates when not loaded', () => {
        beforeEach(async () => {
            const mockFetch = mock(() =>
                Promise.resolve({
                    ok: false,
                    statusText: 'Not Found'
                } as Response)
            );

            global.fetch = mockFetch as any;
            await service.loadTermBounds();
        });

        it('should return null when term bounds not loaded', () => {
            expect(service.getTermDates('A')).toBeNull();
            expect(service.getTermDates('B')).toBeNull();
            expect(service.getTermDates('C')).toBeNull();
            expect(service.getTermDates('D')).toBeNull();
        });
    });

    describe('getTermBoundsData', () => {
        const mockTermBoundsData: TermBoundsData = {
            academicYear: '2025-2026',
            generated: '2025-01-01T00:00:00.000Z',
            terms: {
                A: {
                    startDate: '2025-08-21',
                    endDate: '2025-10-10',
                    offeringPeriod: '202501',
                    sampleSize: 814
                },
                B: {
                    startDate: '2025-10-20',
                    endDate: '2025-12-12',
                    offeringPeriod: '202502',
                    sampleSize: 835
                },
                C: {
                    startDate: '2026-01-14',
                    endDate: '2026-03-06',
                    offeringPeriod: '202503',
                    sampleSize: 768
                },
                D: {
                    startDate: '2026-03-16',
                    endDate: '2026-05-06',
                    offeringPeriod: '202504',
                    sampleSize: 698
                }
            }
        };

        it('should return full term bounds data when loaded', async () => {
            const mockFetch = mock(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockTermBoundsData)
                } as Response)
            );

            global.fetch = mockFetch as any;
            await service.loadTermBounds();

            const data = service.getTermBoundsData();
            expect(data).not.toBeNull();
            expect(data!.academicYear).toBe('2025-2026');
            expect(data!.terms.A.sampleSize).toBe(814);
        });

        it('should return null when not loaded', async () => {
            const mockFetch = mock(() =>
                Promise.resolve({
                    ok: false,
                    statusText: 'Not Found'
                } as Response)
            );

            global.fetch = mockFetch as any;
            await service.loadTermBounds();

            const data = service.getTermBoundsData();
            expect(data).toBeNull();
        });
    });

    describe('isLoaded', () => {
        it('should return true when data is loaded', async () => {
            const mockFetch = mock(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        academicYear: '2025-2026',
                        generated: '2025-01-01T00:00:00.000Z',
                        terms: {
                            A: { startDate: '2025-08-21', endDate: '2025-10-10', offeringPeriod: '202501', sampleSize: 814 },
                            B: { startDate: '2025-10-20', endDate: '2025-12-12', offeringPeriod: '202502', sampleSize: 835 },
                            C: { startDate: '2026-01-14', endDate: '2026-03-06', offeringPeriod: '202503', sampleSize: 768 },
                            D: { startDate: '2026-03-16', endDate: '2026-05-06', offeringPeriod: '202504', sampleSize: 698 }
                        }
                    })
                } as Response)
            );

            global.fetch = mockFetch as any;
            await service.loadTermBounds();

            expect(service.isLoaded()).toBe(true);
        });

        it('should return false when data fails to load', async () => {
            const mockFetch = mock(() =>
                Promise.resolve({
                    ok: false,
                    statusText: 'Not Found'
                } as Response)
            );

            global.fetch = mockFetch as any;
            await service.loadTermBounds();

            expect(service.isLoaded()).toBe(false);
        });
    });
});
