import type { Section, Course } from './types';

export interface SectionData {
  courseCode: string;
  courseName: string;
  section: Section;
  course: Course;
  courseId: string;
  currentColor: string;
  onColorChange?: (color: string) => void;
}
