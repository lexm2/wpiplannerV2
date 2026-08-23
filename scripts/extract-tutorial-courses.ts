import { readFileSync, writeFileSync } from 'fs';

const data = JSON.parse(
  readFileSync('./public/course-data-constructed.json', 'utf8'),
);

const targetIds = [
  'RBE-2001-2026',
  'RBE-2002-2026',
  'ETR-1100-2026',
  'ES-2501-2026',
  'RBE-2020-2026',
  'RBE-3001-2026',
  'CS-3733-2026',
  'HU-3900-2026',
  'RBE-3002-2026',
  'ES-3001-2026',
  'RBE-3100-2026',
  'ES-3011-2026',
];

const result: Record<string, unknown> = {};

for (const dept of data.departments) {
  for (const course of dept.courses) {
    if (!targetIds.includes(course.id)) continue;

    const sections: unknown[] = [];

    for (const group of course.lectures ?? []) {
      const lec = group.section;
      sections.push({
        role: 'lecture',
        crn: lec.crn,
        number: lec.number,
        term: lec.computedTerm,
        periods: lec.periods.map((p: Record<string, unknown>) => ({
          type: p.type,
          days: p.days,
          start: p.startTime,
          end: p.endTime,
          professor: p.professor,
        })),
      });

      for (const disc of group.compatibleDiscussions ?? []) {
        sections.push({
          role: 'discussion',
          crn: disc.crn,
          number: disc.number,
          term: disc.computedTerm,
          periods: disc.periods.map((p: Record<string, unknown>) => ({
            type: p.type,
            days: p.days,
            start: p.startTime,
            end: p.endTime,
            professor: p.professor,
          })),
        });
      }

      for (const lab of group.compatibleLabs ?? []) {
        sections.push({
          role: 'lab',
          crn: lab.crn,
          number: lab.number,
          term: lab.computedTerm,
          periods: lab.periods.map((p: Record<string, unknown>) => ({
            type: p.type,
            days: p.days,
            start: p.startTime,
            end: p.endTime,
            professor: p.professor,
          })),
        });
      }
    }

    for (const lab of course.standaloneLabs ?? []) {
      sections.push({
        role: 'standalone-lab',
        crn: lab.crn,
        number: lab.number,
        term: lab.computedTerm,
        periods: lab.periods.map((p: Record<string, unknown>) => ({
          type: p.type,
          days: p.days,
          start: p.startTime,
          end: p.endTime,
          professor: p.professor,
        })),
      });
    }

    result[course.id] = { name: course.name, sections };
  }
}

writeFileSync(
  './tutorial-course-sections.json',
  JSON.stringify(result, null, 2),
);
console.log('Written to tutorial-course-sections.json');
