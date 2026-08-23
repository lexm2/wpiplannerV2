import type { Requirement, RequirementStatus } from '../../types/degree';

/**
 * Live completion state of a requirement, recomputed from the courses *currently
 * placed* in it: the completed/transfer courses (earned) plus the planned and
 * schedule-overlay tiles sitting in it after any drag re-bucketing (in progress).
 * As the user moves tiles around, status / percent / remaining update.
 *
 * Kept separate from academicProgressParser so the UI can import it without
 * pulling the parser (and fflate) into the main bundle.
 *
 * The status is anchored to Workday's imported status - it can only improve
 * (e.g. not_satisfied → in_progress → satisfied), never regress, since our
 * credit accounting doesn't model every Workday combination rule.
 */

/** Minimal shape of a placed tile that contributes to progress. */
export interface ProgressTile {
  code: string;
  credits: number;
  kind: 'planned' | 'schedule';
}

/** Progress-bar segment widths (each 0..1), cumulatively clamped to sum ≤ 1. */
export interface ProgressSegments {
  earned: number;
  planned: number;
  schedule: number;
}

export interface EffectiveProgress {
  status: RequirementStatus;
  /** Total filled fraction (earned + planned + schedule), or null with no numeric target. */
  fraction: number | null;
  segments: ProgressSegments;
  creditsRemaining: number | null;
  coursesRemaining: number | null;
  /** How many empty "Course needed" slots to render. */
  emptySlots: number;
}

const RANK: Record<RequirementStatus, number> = {
  not_satisfied: 0,
  in_progress: 1,
  satisfied: 2,
};
const EMPTY_CAP = 12;
const EMPTY_SEGMENTS: ProgressSegments = { earned: 0, planned: 0, schedule: 0 };

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Pick the better of the computed status and Workday's imported status. */
function anchor(
  computed: RequirementStatus,
  base: RequirementStatus,
): RequirementStatus {
  return RANK[computed] >= RANK[base] ? computed : base;
}

/**
 * Dedupe placed tiles by code into planned vs schedule buckets. A course in both
 * (the Enrolled schedule is built from the plan) counts once and as `planned`,
 * keeping its transcript credits.
 */
function bucketTiles(tiles: ProgressTile[]): {
  planned: number;
  plannedCount: number;
  schedule: number;
  scheduleCount: number;
} {
  const byCode = new Map<
    string,
    { kind: 'planned' | 'schedule'; credits: number }
  >();
  for (const t of tiles) {
    const cur = byCode.get(t.code);
    if (!cur) byCode.set(t.code, { kind: t.kind, credits: t.credits });
    else if (cur.kind === 'schedule' && t.kind === 'planned')
      byCode.set(t.code, { kind: 'planned', credits: t.credits });
  }
  let planned = 0,
    plannedCount = 0,
    schedule = 0,
    scheduleCount = 0;
  for (const v of byCode.values()) {
    if (v.kind === 'planned') {
      planned += v.credits;
      plannedCount++;
    } else {
      schedule += v.credits;
      scheduleCount++;
    }
  }
  return { planned, plannedCount, schedule, scheduleCount };
}

/** Cumulatively-clamped segment widths; when satisfied, fill the bar by topping up `earned`. */
function makeSegments(
  earned: number,
  planned: number,
  schedule: number,
  total: number,
  satisfied: boolean,
): ProgressSegments {
  if (total <= 0) return EMPTY_SEGMENTS;
  const ew = Math.min(earned / total, 1);
  const pw = Math.min(planned / total, Math.max(0, 1 - ew));
  const sw = Math.min(schedule / total, Math.max(0, 1 - ew - pw));
  return {
    earned: satisfied ? Math.max(ew, 1 - pw - sw) : ew,
    planned: pw,
    schedule: sw,
  };
}

export function effectiveProgress(
  req: Requirement,
  tiles: ProgressTile[],
): EffectiveProgress {
  const earnedCredits = req.appliedCourses
    .filter(c => !c.isInProgress)
    .reduce((s, c) => s + c.credits, 0);
  const completedCount = req.appliedCourses.filter(c => !c.isInProgress).length;
  const { planned, plannedCount, schedule, scheduleCount } = bucketTiles(tiles);

  const required = req.creditsRequired;

  // Credit-based requirement.
  if (required != null && required > 0) {
    const covered = earnedCredits + planned + schedule;
    const computed: RequirementStatus =
      covered >= required
        ? 'satisfied'
        : covered > 0
          ? 'in_progress'
          : 'not_satisfied';
    const status = anchor(computed, req.status);
    const creditsRemaining = round2(Math.max(0, required - covered));
    const segments = makeSegments(
      earnedCredits,
      planned,
      schedule,
      required,
      status === 'satisfied',
    );
    return {
      status,
      fraction: segments.earned + segments.planned + segments.schedule,
      segments,
      creditsRemaining,
      coursesRemaining: null,
      emptySlots:
        status === 'satisfied'
          ? 0
          : Math.min(EMPTY_CAP, Math.max(1, Math.ceil(creditsRemaining / 3))),
    };
  }

  // Course-count requirement.
  if (req.coursesRemaining != null) {
    const requiredCourses = completedCount + req.coursesRemaining; // total needed (as of import)
    const have = completedCount + plannedCount + scheduleCount;
    const computed: RequirementStatus =
      requiredCourses > 0 && have >= requiredCourses
        ? 'satisfied'
        : have > 0
          ? 'in_progress'
          : 'not_satisfied';
    const status = anchor(computed, req.status);
    const coursesRemaining = Math.max(0, requiredCourses - have);
    const segments = makeSegments(
      completedCount,
      plannedCount,
      scheduleCount,
      requiredCourses,
      status === 'satisfied',
    );
    return {
      status,
      fraction:
        requiredCourses > 0
          ? segments.earned + segments.planned + segments.schedule
          : null,
      segments,
      creditsRemaining: null,
      coursesRemaining,
      emptySlots:
        status === 'satisfied' ? 0 : Math.min(EMPTY_CAP, coursesRemaining),
    };
  }

  // No numeric target (e.g. "Minimum Combination Required").
  const computed: RequirementStatus =
    plannedCount + scheduleCount > 0 ? 'in_progress' : req.status;
  const status = anchor(computed, req.status);
  return {
    status,
    fraction: status === 'satisfied' ? 1 : null,
    segments:
      status === 'satisfied'
        ? { earned: 1, planned: 0, schedule: 0 }
        : EMPTY_SEGMENTS,
    creditsRemaining: null,
    coursesRemaining: null,
    emptySlots:
      status === 'satisfied'
        ? 0
        : req.appliedCourses.length || plannedCount + scheduleCount
          ? 0
          : 1,
  };
}
