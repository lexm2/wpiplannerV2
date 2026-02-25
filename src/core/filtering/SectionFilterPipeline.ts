import type { Course, Section, LectureGroup } from '../../types/types';
import { SectionType } from '../../types/types';
import type { FilterableSection } from '../../types/filterableUnit';
import { FilterPriorityQueue } from './FilterPriorityQueue';

export interface SectionBasedFilter {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly priority: number;

    apply(sections: FilterableSection[], criteria: any, activeFilters?: Map<string, any>): FilterableSection[];
    isValidCriteria(criteria: any): boolean;
    getDisplayValue(criteria: any): string;
}

type ActiveSectionFilter = {
    id: string;
    filter: SectionBasedFilter;
    criteria: any;
};

export class SectionFilterPipeline {
    private registeredFilters = new Map<string, SectionBasedFilter>();

    registerFilter(filter: SectionBasedFilter): void {
        this.registeredFilters.set(filter.id, filter);
    }

    unregisterFilter(filterId: string): void {
        this.registeredFilters.delete(filterId);
    }

    flattenCoursesToSections(courses: Course[]): FilterableSection[] {
        const sections: FilterableSection[] = [];

        for (const course of courses) {
            if (course.lectures && course.lectures.length > 0) {
                for (const lectureGroup of course.lectures) {
                    sections.push({
                        course,
                        section: lectureGroup.section,
                        lectureGroup,
                        sectionType: SectionType.LECTURE
                    });

                    for (const discussion of lectureGroup.compatibleDiscussions) {
                        sections.push({
                            course,
                            section: discussion,
                            lectureGroup,
                            sectionType: SectionType.DISCUSSION
                        });
                    }

                    for (const lab of lectureGroup.compatibleLabs) {
                        sections.push({
                            course,
                            section: lab,
                            lectureGroup,
                            sectionType: SectionType.LAB
                        });
                    }
                }
            }

            if (course.standaloneLabs && course.standaloneLabs.length > 0) {
                for (const lab of course.standaloneLabs) {
                    sections.push({
                        course,
                        section: lab,
                        sectionType: SectionType.STANDALONE_LAB
                    });
                }
            }
        }

        return sections;
    }

    reconstructCourses(filteredSections: FilterableSection[]): Course[] {
        const courseMap = new Map<string, {
            course: Course,
            lectureGroups: Map<string, {
                section: Section,
                discussions: Section[],
                labs: Section[]
            }>,
            standaloneLabs: Section[]
        }>();

        for (const fs of filteredSections) {
            const courseId = fs.course.id;

            if (!courseMap.has(courseId)) {
                courseMap.set(courseId, {
                    course: fs.course,
                    lectureGroups: new Map(),
                    standaloneLabs: []
                });
            }

            const courseData = courseMap.get(courseId);
            if (!courseData) continue;

            if (fs.sectionType === SectionType.LECTURE) {
                const lectureCrn = String(fs.section.crn);
                if (!courseData.lectureGroups.has(lectureCrn)) {
                    courseData.lectureGroups.set(lectureCrn, {
                        section: fs.section,
                        discussions: [],
                        labs: []
                    });
                }
            } else if (fs.sectionType === SectionType.DISCUSSION && fs.lectureGroup) {
                const lectureCrn = String(fs.lectureGroup.section.crn);
                if (!courseData.lectureGroups.has(lectureCrn)) {
                    courseData.lectureGroups.set(lectureCrn, {
                        section: fs.lectureGroup.section,
                        discussions: [],
                        labs: []
                    });
                }
                const lectureData = courseData.lectureGroups.get(lectureCrn);
                if (lectureData && !lectureData.discussions.find(d => d.crn === fs.section.crn)) {
                    lectureData.discussions.push(fs.section);
                }
            } else if (fs.sectionType === SectionType.LAB && fs.lectureGroup) {
                const lectureCrn = String(fs.lectureGroup.section.crn);
                if (!courseData.lectureGroups.has(lectureCrn)) {
                    courseData.lectureGroups.set(lectureCrn, {
                        section: fs.lectureGroup.section,
                        discussions: [],
                        labs: []
                    });
                }
                const lectureData = courseData.lectureGroups.get(lectureCrn);
                if (lectureData && !lectureData.labs.find(l => l.crn === fs.section.crn)) {
                    lectureData.labs.push(fs.section);
                }
            } else if (fs.sectionType === SectionType.STANDALONE_LAB) {
                if (!courseData.standaloneLabs.find(l => l.crn === fs.section.crn)) {
                    courseData.standaloneLabs.push(fs.section);
                }
            }
        }

        const reconstructedCourses: Course[] = [];

        for (const courseData of courseMap.values()) {
            const lectures: LectureGroup[] = Array.from(courseData.lectureGroups.values()).map(lg => ({
                section: lg.section,
                compatibleDiscussions: lg.discussions,
                compatibleLabs: lg.labs
            }));

            reconstructedCourses.push({
                ...courseData.course,
                lectures: lectures.length > 0 ? lectures : undefined,
                standaloneLabs: courseData.standaloneLabs.length > 0 ? courseData.standaloneLabs : undefined
            });
        }

        return reconstructedCourses;
    }

    filterCourses(
        courses: Course[],
        activeFilters: Map<string, any>
    ): Course[] {
        const sections = this.flattenCoursesToSections(courses);

        const filtersToApply: ActiveSectionFilter[] = [];

        for (const [filterId, criteria] of activeFilters.entries()) {
            const filter = this.registeredFilters.get(filterId);
            if (filter && filter.isValidCriteria(criteria)) {
                filtersToApply.push({ id: filterId, filter, criteria });
            }
        }

        const priorityQueue = new FilterPriorityQueue<ActiveSectionFilter>();
        for (const activeFilter of filtersToApply) {
            priorityQueue.insert(activeFilter, activeFilter.filter.priority);
        }

        let filteredSections = sections;
        const criteriaMap = activeFilters;

        while (!priorityQueue.isEmpty()) {
            const activeFilter = priorityQueue.extractMin();
            if (!activeFilter) break;
            filteredSections = activeFilter.filter.apply(filteredSections, activeFilter.criteria, criteriaMap);
        }

        return this.reconstructCourses(filteredSections);
    }
}
