import type { Course, Section, Period, LectureGroup, SectionType } from './types';

export type FilterableSection = {
    course: Course;
    section: Section;
    lectureGroup?: LectureGroup;
    sectionType: SectionType;
};
