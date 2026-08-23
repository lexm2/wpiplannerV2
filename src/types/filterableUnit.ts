import type { Course, Section, LectureGroup, SectionType } from './types';

export type FilterableSection = {
  course: Course;
  section: Section;
  lectureGroup?: LectureGroup;
  sectionType: SectionType;
};
