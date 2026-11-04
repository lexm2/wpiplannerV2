/**
 * Marks course meetings in this planner's .ics export so a later import can
 * skip them, even after a calendar service rewrites the UIDs. Shared by the
 * exporter (main bundle) and the importer (lazy chunk), so it has no imports.
 */

/** X- property on every exported course meeting. */
export const PLANNER_KIND_PROPERTY = 'X-WPIPLANNER-KIND';
export const PLANNER_KIND_COURSE = 'course';

/** Last line of every exported course meeting's description. */
export const PLANNER_NOTE = 'Added by WPI Course Planner';

const COURSE_UID = /^wpi-.+@wpiplannerv2$/i;

export interface PlannerEventFields {
  uid?: string | null;
  description?: string | null;
  /** Value of the X-WPIPLANNER-KIND property. */
  kind?: string | null;
}

/** Whether the description has the note as its own line (HTML tolerated). */
function hasNoteLine(description: string): boolean {
  const text = description
    .replace(/<\s*(br|\/p|\/div|\/li|p|div|li)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ');
  const note = PLANNER_NOTE.toLowerCase();
  return text.split(/\r\n|\r|\n/).some(l => l.trim().toLowerCase() === note);
}

/** True for a course meeting this planner exported. */
export function isPlannerCourseEvent(fields: PlannerEventFields): boolean {
  if (fields.uid && COURSE_UID.test(fields.uid.trim())) return true;
  if (fields.kind?.trim().toLowerCase() === PLANNER_KIND_COURSE) return true;
  return !!fields.description && hasNoteLine(fields.description);
}
