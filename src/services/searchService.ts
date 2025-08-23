import { Course, Department, Section, Period } from '../types/types'
import { SearchFilter } from '../types/ui'

export class SearchService {
    private courses: Course[] = [];
    private departments: Department[] = [];

    setCourseData(departments: Department[]): void {
        this.departments = departments;
        this.courses = [];
        
        for (const dept of departments) {
            this.courses.push(...dept.courses);
        }
    }

    searchCourses(query: string, filters?: SearchFilter): Course[] {
        let results = this.courses;

        // Apply text search
        if (query.trim()) {
            results = this.performTextSearch(results, query.trim());
        }

        // Apply filters
        if (filters) {
            results = this.applyFilters(results, filters);
        }

        return this.rankResults(results, query);
    }

    private performTextSearch(courses: Course[], query: string): Course[] {
        const queryLower = query.toLowerCase();
        
        return courses.filter(course => {
            // Search in course ID, name, and description
            const courseText = [
                course.id,
                course.name,
                course.description,
                course.department.abbreviation,
                course.department.name,
                course.number
            ].join(' ').toLowerCase();

            return courseText.includes(queryLower);
        });
    }

    private applyFilters(courses: Course[], filters: SearchFilter): Course[] {
        return courses.filter(course => {
            // Department filter
            if (filters.departments.length > 0 && 
                !filters.departments.includes(course.department.abbreviation.toLowerCase())) {
                return false;
            }

            // Credit range filter
            if (filters.creditRange) {
                const { min, max } = filters.creditRange;
                if (course.maxCredits < min || course.minCredits > max) {
                    return false;
                }
            }

            // Availability filter
            if (filters.availabilityOnly) {
                const hasAvailableSeats = course.sections.some(section => section.seatsAvailable > 0);
                if (!hasAvailableSeats) {
                    return false;
                }
            }

            // Time slot filter
            if (filters.timeSlots.length > 0) {
                const matchesTimeSlot = course.sections.some(section =>
                    section.periods.some(period =>
                        filters.timeSlots.some(timeSlot =>
                            this.periodsOverlap(period, timeSlot)
                        )
                    )
                );
                if (!matchesTimeSlot) {
                    return false;
                }
            }

            // Professor filter
            if (filters.professors.length > 0) {
                const hasProfessor = course.sections.some(section =>
                    section.periods.some(period =>
                        filters.professors.some(prof =>
                            period.professor.toLowerCase().includes(prof.toLowerCase())
                        )
                    )
                );
                if (!hasProfessor) {
                    return false;
                }
            }

            return true;
        });
    }

    private periodsOverlap(period: Period, timeSlot: any): boolean {
        const periodStart = period.startTime.hours * 60 + period.startTime.minutes;
        const periodEnd = period.endTime.hours * 60 + period.endTime.minutes;
        const slotStart = timeSlot.startTime.hours * 60 + timeSlot.startTime.minutes;
        const slotEnd = timeSlot.endTime.hours * 60 + timeSlot.endTime.minutes;

        // Check for time overlap
        const timeOverlaps = periodStart < slotEnd && slotStart < periodEnd;
        
        // Check for day overlap
        const dayOverlaps = timeSlot.days.some((day: string) => period.days.has(day));

        return timeOverlaps && dayOverlaps;
    }

    private rankResults(courses: Course[], query: string): Course[] {
        if (!query.trim()) return courses;

        const queryLower = query.toLowerCase();
        
        return courses.sort((a, b) => {
            const scoreA = this.calculateRelevanceScore(a, queryLower);
            const scoreB = this.calculateRelevanceScore(b, queryLower);
            return scoreB - scoreA;
        });
    }

    private calculateRelevanceScore(course: Course, query: string): number {
        let score = 0;

        // Exact matches get highest score
        if (course.id.toLowerCase() === query) score += 100;
        if (course.name.toLowerCase() === query) score += 90;

        // Prefix matches
        if (course.id.toLowerCase().startsWith(query)) score += 80;
        if (course.name.toLowerCase().startsWith(query)) score += 70;
        if (course.department.abbreviation.toLowerCase().startsWith(query)) score += 60;

        // Contains matches
        if (course.id.toLowerCase().includes(query)) score += 40;
        if (course.name.toLowerCase().includes(query)) score += 30;
        if (course.description.toLowerCase().includes(query)) score += 10;

        // Boost popular/available courses
        const totalSeats = course.sections.reduce((sum, section) => sum + section.seats, 0);
        const availableSeats = course.sections.reduce((sum, section) => sum + section.seatsAvailable, 0);
        
        if (availableSeats > 0) score += 5;
        if (totalSeats > 100) score += 2; // Large courses might be more popular

        return score;
    }

    getDepartments(): Department[] {
        return this.departments;
    }

    getCoursesByDepartment(departmentAbbr: string): Course[] {
        const dept = this.departments.find(d => 
            d.abbreviation.toLowerCase() === departmentAbbr.toLowerCase()
        );
        return dept ? dept.courses : [];
    }

    getAvailableProfessors(): string[] {
        const professors = new Set<string>();
        
        this.courses.forEach(course => {
            course.sections.forEach(section => {
                section.periods.forEach(period => {
                    if (period.professor && period.professor !== 'TBA') {
                        professors.add(period.professor);
                    }
                });
            });
        });

        return Array.from(professors).sort();
    }

    getAvailableBuildings(): string[] {
        const buildings = new Set<string>();
        
        this.courses.forEach(course => {
            course.sections.forEach(section => {
                section.periods.forEach(period => {
                    if (period.building) {
                        buildings.add(period.building);
                    }
                });
            });
        });

        return Array.from(buildings).sort();
    }

    getCreditRanges(): Array<{ min: number; max: number; label: string }> {
        return [
            { min: 1, max: 1, label: '1 Credit' },
            { min: 2, max: 2, label: '2 Credits' },
            { min: 3, max: 3, label: '3 Credits' },
            { min: 4, max: 4, label: '4 Credits' },
            { min: 1, max: 2, label: '1-2 Credits' },
            { min: 3, max: 4, label: '3-4 Credits' },
            { min: 1, max: 4, label: 'Any Credits' }
        ];
    }
}