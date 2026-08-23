/**
 * Extracts real course sections for the tutorial department and writes them to
 * public/tutorial-courses.json. Run with: bun run scripts/build-tutorial-courses.ts
 */
import { readFileSync, writeFileSync } from 'fs';

const data = JSON.parse(
  readFileSync('./public/course-data-constructed.json', 'utf8'),
);

const targetMap: Record<
  string,
  { id: string; number: string; name: string; professor: string }
> = {
  'RBE-2001-2026': {
    id: 'TUT-2001',
    number: '2001',
    name: 'Introduction to Robot Wrangling',
    professor: 'Dr. Ty Murray',
  },
  'RBE-2002-2026': {
    id: 'TUT-2002',
    number: '2002',
    name: 'Advanced Robot Wrangling',
    professor: 'Dr. Ty Murray',
  },
  'ETR-1100-2026': {
    id: 'TUT-2003',
    number: '2003',
    name: 'How to Get Investors',
    professor: 'Prof. Cash Moneybags',
  },
  'ES-2501-2026': {
    id: 'TUT-2004',
    number: '2004',
    name: "Why Things Don't Fall Over",
    professor: 'Dr. Isaac Newt',
  },
  'RBE-2020-2026': {
    id: 'TUT-2005',
    number: '2005',
    name: 'Blinking LEDs 101',
    professor: 'Prof. Kirchhoff',
  },
  'RBE-3001-2026': {
    id: 'TUT-2006',
    number: '2006',
    name: 'Robots with Feelings',
    professor: 'Prof. Hans Moravec',
  },
  'CS-3733-2026': {
    id: 'TUT-2007',
    number: '2007',
    name: 'How to Write Code Good',
    professor: 'Prof. Stack Overflow',
  },
  'HU-3900-2026': {
    id: 'TUT-2008',
    number: '2008',
    name: 'History: The Prequel',
    professor: 'Dr. Harold Bloom',
  },
  'RBE-3002-2026': {
    id: 'TUT-2009',
    number: '2009',
    name: 'Applied Robot Geometry',
    professor: 'Dr. Russ Tedrake',
  },
  'ES-3001-2026': {
    id: 'TUT-2010',
    number: '2010',
    name: 'Why Everything Gets Hot',
    professor: 'Dr. Fourier',
  },
  'RBE-3100-2026': {
    id: 'TUT-2011',
    number: '2011',
    name: 'Should We Even Be Doing This?',
    professor: 'Dr. Alan Turing',
  },
  'ES-3011-2026': {
    id: 'TUT-2012',
    number: '2012',
    name: 'Making Things Go Where You Want',
    professor: 'Dr. Rudolf Kalman',
  },
};

// Remap CRNs to avoid collisions with real courses (start at 100000)
let crnCounter = 100000;
const crnMap = new Map<number, number>();
const remap = (crn: number) => {
  if (!crnMap.has(crn)) crnMap.set(crn, crnCounter++);
  return crnMap.get(crn)!;
};

const isCancelled = (s: Record<string, unknown>) =>
  /^X\s/i.test((s.number as string) ?? '') ||
  /cancel/i.test((s.number as string) ?? '');

const remapSection = (s: Record<string, unknown>, professor: string) => ({
  ...s,
  crn: remap(s.crn as number),
  number: 'T' + (s.number as string),
  periods: ((s.periods as Record<string, unknown>[]) ?? []).map(p => ({
    ...p,
    professor,
  })),
});

const courses = [];

for (const dept of data.departments) {
  for (const course of dept.courses) {
    const mapping = targetMap[course.id];
    if (!mapping) continue;

    courses.push({
      ...course,
      id: mapping.id,
      number: mapping.number,
      name: mapping.name,
      description: '',
      departmentAbbr: 'TUT',
      departmentName: 'Tutorial',
      transient: true,
      lectures: (course.lectures ?? [])
        .filter(
          (g: Record<string, unknown>) =>
            !isCancelled(g.section as Record<string, unknown>),
        )
        .map((g: Record<string, unknown>) => ({
          section: remapSection(
            g.section as Record<string, unknown>,
            mapping.professor,
          ),
          compatibleDiscussions: ((g.compatibleDiscussions as unknown[]) ?? [])
            .filter(s => !isCancelled(s as Record<string, unknown>))
            .map(s =>
              remapSection(s as Record<string, unknown>, mapping.professor),
            ),
          compatibleLabs: ((g.compatibleLabs as unknown[]) ?? [])
            .filter(s => !isCancelled(s as Record<string, unknown>))
            .map(s =>
              remapSection(s as Record<string, unknown>, mapping.professor),
            ),
        })),
      standaloneLabs: (course.standaloneLabs ?? [])
        .filter((s: Record<string, unknown>) => !isCancelled(s))
        .map((s: Record<string, unknown>) =>
          remapSection(s, mapping.professor),
        ),
    });
  }
}

writeFileSync(
  './public/tutorial-courses.json',
  JSON.stringify({ courses }, null, 2),
);
console.log(
  `Wrote ${courses.length} courses, ${crnCounter - 100000} CRNs remapped`,
);
