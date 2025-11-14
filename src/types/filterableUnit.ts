import type { Course, Section, Period, LectureGroup } from './types';

export type FilterableSection = {
    course: Course;
    section: Section;
    lectureGroup?: LectureGroup;
    sectionType: 'lecture' | 'standaloneLab' | 'discussion' | 'lab';
};

export type FilterablePeriod = {
    course: Course;
    section: Section;
    period: Period;
    lectureGroup?: LectureGroup;
};
