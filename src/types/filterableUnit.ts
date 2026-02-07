import type { Course, Section, Period, LectureGroup, SectionType } from './types';

export type FilterableSection = {
    course: Course;
    section: Section;
    lectureGroup?: LectureGroup;
    sectionType: SectionType;
};

export type FilterablePeriod = {
    course: Course;
    section: Section;
    period: Period;
    lectureGroup?: LectureGroup;
};
