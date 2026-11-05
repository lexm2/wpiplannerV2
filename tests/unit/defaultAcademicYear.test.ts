/**
 * The planner's default academic year: the current year, or the next once it
 * lists enough courses to count as published (the API's rule).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ProfileStateManager } from '../../src/core/state/ProfileStateManager';
import { TermBoundsService } from '../../src/utils/termBounds';
import type { TransactionalStorageManager } from '../../src/core/storage/TransactionalStorageManager';
import type { Department } from '../../src/types/types';

function managerWith(counts: Record<number, number>): ProfileStateManager {
  const Ctor = ProfileStateManager as unknown as new (
    s: TransactionalStorageManager,
  ) => ProfileStateManager;
  const psm = new Ctor({
    subscribe: () => () => undefined,
  } as unknown as TransactionalStorageManager);
  const courses = Object.entries(counts).flatMap(([year, n]) =>
    Array.from({ length: n }, () => ({ academicYear: Number(year) })),
  );
  (psm as unknown as { allDepartments: Department[] }).allDepartments = [
    { courses } as unknown as Department,
  ];
  return psm;
}

function currentYearIs(year: number | null): void {
  vi.spyOn(
    TermBoundsService.getInstance(),
    'getCurrentAcademicYear',
  ).mockReturnValue(year);
}

afterEach(() => vi.restoreAllMocks());

describe('getDefaultAcademicYear', () => {
  it('stays on the current year while the next lists a handful of courses', () => {
    currentYearIs(2026);
    expect(managerWith({ 2026: 1000, 2027: 2 }).getDefaultAcademicYear()).toBe(
      2026,
    );
  });

  it('moves to the next year once it lists a quarter of the current one', () => {
    currentYearIs(2026);
    expect(
      managerWith({ 2026: 1000, 2027: 250 }).getDefaultAcademicYear(),
    ).toBe(2027);
  });

  it('falls back to the newest year when the current one has no data', () => {
    currentYearIs(2028);
    expect(managerWith({ 2026: 10, 2027: 10 }).getDefaultAcademicYear()).toBe(
      2027,
    );
  });

  it('has no default without courses', () => {
    currentYearIs(2026);
    expect(managerWith({}).getDefaultAcademicYear()).toBeUndefined();
  });
});
