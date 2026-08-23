/**
 * Parses the matrix produced by xlsxReader (a WPI "View My Academic Progress"
 * export) into a structured StudentRecord. See academic_progress_parser_plan.md
 * for the full spec; the helpers below are exported for unit testing.
 */
import type {
  AcademicPeriod,
  AppliedCourse,
  CreditTotals,
  Requirement,
  RequirementCategory,
  RequirementStatus,
  StudentRecord,
} from '../../types/degree';
import { DEGREE_SCHEMA_VERSION } from '../../types/degree';

// Column order in the export.
const COL = {
  requirement: 0,
  status: 1,
  remaining: 2,
  course: 3,
  period: 4,
  credits: 5,
  grade: 6,
} as const;

export function parseStatus(raw: string): RequirementStatus {
  const v = raw.trim().toLowerCase();
  if (v === 'satisfied') return 'satisfied';
  if (v === 'in progress') return 'in_progress';
  return 'not_satisfied';
}

/** "2025 Fall A Term" / "2025 Fall Semester" / "" → AcademicPeriod | null. */
export function parseAcademicPeriod(raw: string): AcademicPeriod | null {
  const s = raw?.trim();
  if (!s || s.toLowerCase() === 'none') return null;

  const term = /^(\d{4})\s+(Fall|Spring)\s+([A-E])\s+Term$/.exec(s);
  if (term) {
    return {
      year: parseInt(term[1], 10),
      season: term[2] as 'Fall' | 'Spring',
      term: term[3],
      raw: s,
    };
  }
  const sem = /^(\d{4})\s+(Fall|Spring)\s+Semester$/.exec(s);
  if (sem) {
    return {
      year: parseInt(sem[1], 10),
      season: sem[2] as 'Fall' | 'Spring',
      term: null,
      raw: s,
    };
  }
  // Unknown shape - keep the raw text but don't guess structured fields.
  return { year: NaN, season: 'Fall', term: null, raw: s };
}

/** "Minimum 35.25 Credit(s)" / "Minimum 1 Course(s)" / "Minimum Combination Required" / "None". */
export function parseRemaining(raw: string): {
  creditsRemaining: number | null;
  coursesRemaining: number | null;
} {
  const s = raw?.trim() ?? '';
  const credit = /^Minimum\s+([\d.]+)\s+Credit\(s\)$/i.exec(s);
  if (credit)
    return { creditsRemaining: parseFloat(credit[1]), coursesRemaining: null };
  const course = /^Minimum\s+(\d+)\s+Course\(s\)$/i.exec(s);
  if (course)
    return {
      creditsRemaining: null,
      coursesRemaining: parseInt(course[1], 10),
    };
  return { creditsRemaining: null, coursesRemaining: null };
}

/**
 * "CS 3041 - Human-Computer Interaction (In Progress)" /
 * "MA 1021 - Calculus I (Transfer Credit)" /
 * "CS 2022/ MA 2201 - Discrete Mathematics" (cross-listed).
 */
export function parseCourseString(
  raw: string,
  period: AcademicPeriod | null,
  credits: number,
  grade: string | null,
): AppliedCourse | null {
  let s = raw?.trim();
  if (!s) return null;

  const isInProgress = /\(In Progress\)\s*$/i.test(s);
  s = s.replace(/\s*\(In Progress\)\s*$/i, '');
  const isTransfer = /\(Transfer Credit\)\s*$/i.test(s);
  s = s.replace(/\s*\(Transfer Credit\)\s*$/i, '');
  s = s.trim();

  const sep = s.indexOf(' - ');
  const codePart = (sep >= 0 ? s.slice(0, sep) : s).trim();
  const title = (sep >= 0 ? s.slice(sep + 3) : '').trim();

  // department/number from the first listed code (handles cross-listed codes).
  const codeMatch = /^([A-Za-z]+)\s+([A-Za-z0-9]+)/.exec(codePart);
  const department = codeMatch ? codeMatch[1].toUpperCase() : '';
  const number = codeMatch ? codeMatch[2] : '';

  return {
    code: codePart,
    department,
    number,
    title,
    credits,
    grade,
    isTransfer,
    isInProgress,
    period,
    satisfies: [],
  };
}

export function classifyCategory(rawName: string): RequirementCategory {
  const n = rawName;
  if (/Total Credits Required/i.test(n)) return 'total_credits';
  if (/Residency/i.test(n)) return 'residency';
  if (/Major Qualifying Project Completion/i.test(n)) return 'mqp_completion';
  if (/Major Qualifying Project/i.test(n)) return 'mqp';
  if (/Interactive Qualifying Project Completion/i.test(n))
    return 'iqp_completion';
  if (/Interactive Qualifying Project/i.test(n)) return 'iqp';
  if (/Humanities and Arts Completion/i.test(n)) return 'hua_completion';
  if (/Humanities and Arts/i.test(n)) return 'hua';
  if (/Social Science/i.test(n)) return 'social_science';
  if (/Physical Education/i.test(n)) return 'physical_education';
  if (/Free Electives/i.test(n)) return 'free_electives';
  if (/Unused Courses/i.test(n)) return 'unused';
  return 'major_specific';
}

/** Parse scope / short name / required credits out of a requirement's full name. */
export function parseRequirementName(rawName: string): {
  scope: string;
  name: string;
  creditsRequired: number | null;
} {
  // Match "<n> Credits" or "<n> or <m> Credits", taking the lower bound.
  const creditMatch =
    /(\d+(?:\.\d+)?)(?:\s+or\s+\d+(?:\.\d+)?)?\s+Credits?/i.exec(rawName);
  const creditsRequired = creditMatch ? parseFloat(creditMatch[1]) : null;

  // Prefix = everything before " - Undergraduate" (falls back to whole name).
  const prefix = rawName.split(/\s+-\s+Undergraduate/i)[0].trim();

  if (/^WPI\s+/i.test(prefix)) {
    return {
      scope: 'WPI',
      name: prefix.replace(/^WPI\s+/i, '').trim(),
      creditsRequired,
    };
  }
  // Major-specific: "Computer Science - Core Requirement" or "Computer Science Free Electives Requirement".
  const dashIdx = prefix.indexOf(' - ');
  if (dashIdx >= 0) {
    return {
      scope: prefix.slice(0, dashIdx).trim(),
      name: prefix.slice(dashIdx + 3).trim(),
      creditsRequired,
    };
  }
  return { scope: prefix, name: prefix, creditsRequired };
}

/** Derive "Computer Science" / "BS" from the MQP requirement's parenthetical. */
function deriveMajorDegree(requirements: Requirement[]): {
  major: string;
  degree: string;
} {
  for (const req of requirements) {
    const m = /\(([^)]+?)\s+(B[A-Za-z]+)\)/.exec(req.rawName);
    if (m) return { major: m[1].trim(), degree: m[2].trim() };
  }
  // Fallback: most common non-WPI scope.
  const counts = new Map<string, number>();
  for (const req of requirements) {
    if (req.scope && req.scope !== 'WPI')
      counts.set(req.scope, (counts.get(req.scope) ?? 0) + 1);
  }
  let major = '';
  let best = 0;
  for (const [scope, c] of counts)
    if (c > best) {
      best = c;
      major = scope;
    }
  return { major, degree: '' };
}

function toCredits(raw: string): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function parseAcademicProgress(rows: string[][]): StudentRecord {
  // Locate the header row by its first cell rather than hardcoding an index.
  let headerRow = rows.findIndex(
    r => (r[COL.requirement] ?? '').trim() === 'Requirement',
  );
  if (headerRow < 0) headerRow = 0;

  const byName = new Map<string, Requirement>();
  const order: string[] = [];

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rawName = (row[COL.requirement] ?? '').trim();
    if (!rawName) continue;

    let req = byName.get(rawName);
    if (!req) {
      const parsed = parseRequirementName(rawName);
      const remaining = parseRemaining(row[COL.remaining] ?? '');
      req = {
        rawName,
        category: classifyCategory(rawName),
        scope: parsed.scope,
        name: parsed.name,
        status: parseStatus(row[COL.status] ?? ''),
        creditsRequired: parsed.creditsRequired,
        creditsRemaining: remaining.creditsRemaining,
        coursesRemaining: remaining.coursesRemaining,
        appliedCourses: [],
      };
      byName.set(rawName, req);
      order.push(rawName);
    }

    const courseStr = (row[COL.course] ?? '').trim();
    if (courseStr && courseStr.toLowerCase() !== 'none') {
      const period = parseAcademicPeriod(row[COL.period] ?? '');
      const credits = toCredits(row[COL.credits] ?? '');
      const grade = (row[COL.grade] ?? '').trim();
      const course = parseCourseString(
        courseStr,
        period,
        credits,
        grade && grade.toLowerCase() !== 'none' ? grade : null,
      );
      if (course) req.appliedCourses.push(course);
    }
  }

  const requirements = order.map(n => byName.get(n)!);

  // Deduplicate courses across requirements into a master list, aggregating
  // the set of requirements each course satisfies. Requirement.appliedCourses
  // is rewritten to reference the shared (deduped) course objects.
  const master = new Map<string, AppliedCourse>();
  for (const req of requirements) {
    const deduped: AppliedCourse[] = [];
    for (const c of req.appliedCourses) {
      const key = `${c.department} ${c.number}|${c.period?.raw ?? 'transfer'}`;
      let m = master.get(key);
      if (!m) {
        m = c;
        m.satisfies = [];
        master.set(key, m);
      }
      if (!m.satisfies.includes(req.rawName)) m.satisfies.push(req.rawName);
      deduped.push(m);
    }
    req.appliedCourses = deduped;
  }
  const courses = [...master.values()];

  const { major, degree } = deriveMajorDegree(requirements);

  const wpiCourseYears = courses
    .filter(c => !c.isTransfer && c.period && Number.isFinite(c.period.year))
    .map(c => c.period!.year);
  const startYear = wpiCourseYears.length ? Math.min(...wpiCourseYears) : null;

  const required =
    requirements.find(r => r.category === 'total_credits')?.creditsRequired ??
    null;
  const credits: CreditTotals = {
    earned: round2(
      courses.filter(c => !c.isInProgress).reduce((s, c) => s + c.credits, 0),
    ),
    inProgress: round2(
      courses.filter(c => c.isInProgress).reduce((s, c) => s + c.credits, 0),
    ),
    transfer: round2(
      courses.filter(c => c.isTransfer).reduce((s, c) => s + c.credits, 0),
    ),
    required,
  };

  return {
    schemaVersion: DEGREE_SCHEMA_VERSION,
    major,
    degree,
    startYear,
    importedAt: new Date().toISOString(),
    requirements,
    courses,
    credits,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- Validation (used to guard persisted records on load) ------------------

/**
 * Lightweight structural guard for a persisted record. Keeps the module
 * dependency-free; the stored blob is our own output, so a shape + version
 * check is enough to reject stale/incompatible data on load.
 */
export function isValidStudentRecord(data: unknown): data is StudentRecord {
  if (!data || typeof data !== 'object') return false;
  const r = data as Record<string, unknown>;
  return (
    r.schemaVersion === DEGREE_SCHEMA_VERSION &&
    typeof r.major === 'string' &&
    typeof r.degree === 'string' &&
    Array.isArray(r.requirements) &&
    Array.isArray(r.courses) &&
    typeof r.credits === 'object' &&
    r.credits !== null
  );
}
