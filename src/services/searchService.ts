import { Course, Department, Section, Period, DayOfWeek } from '../types/types'
import { SearchFilter, TimeSlot } from '../types/ui'

export class SearchService {
    private courses: Course[] = [];
    private departments: Department[] = [];
    private searchIndex: Map<string, Set<Course>> = new Map();
    private professorCache: string[] | null = null;
    private buildingCache: string[] | null = null;
    private timeSlotMappings: Map<string, Course[]> = new Map();

    setCourseData(departments: Department[]): void {
        this.departments = departments;
        this.courses = [];
        
        for (const dept of departments) {
            this.courses.push(...dept.courses);
        }
        
        // Clear caches and rebuild indexes
        this.clearCaches();
        this.buildSearchIndex();
        this.buildTimeSlotMappings();
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
        
        // Try to use search index first for better performance
        const indexedResults = this.searchFromIndex(queryLower);
        if (indexedResults.length > 0) {
            // Filter indexed results against the current course set
            return courses.filter(course => indexedResults.includes(course));
        }
        
        // Fallback to original linear search with fuzzy matching
        return courses.filter(course => {
            const courseCode = `${course.department.abbreviation}${course.number}`;
            const courseText = [
                course.id,
                course.name,
                course.description,
                course.department.abbreviation,
                course.department.name,
                course.number,
                courseCode
            ].join(' ').toLowerCase();

            return this.fuzzyMatch(courseText, queryLower);
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

    private periodsOverlap(period: Period, timeSlot: TimeSlot): boolean {
        const periodStart = period.startTime.hours * 60 + period.startTime.minutes;
        const periodEnd = period.endTime.hours * 60 + period.endTime.minutes;
        const slotStart = timeSlot.startTime.hours * 60 + timeSlot.startTime.minutes;
        const slotEnd = timeSlot.endTime.hours * 60 + timeSlot.endTime.minutes;

        // Check for time overlap
        const timeOverlaps = periodStart < slotEnd && slotStart < periodEnd;
        
        // Check for day overlap
        const dayOverlaps = timeSlot.days.some((day: string) => period.days.has(day as DayOfWeek));

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
        const courseCode = `${course.department.abbreviation}${course.number}`.toLowerCase();

        // Exact matches get highest score
        if (courseCode === query) score += 110; // Highest priority for exact course code match
        if (course.id.toLowerCase() === query) score += 100;
        if (course.name.toLowerCase() === query) score += 90;

        // Prefix matches
        if (courseCode.startsWith(query)) score += 85; // High priority for course code prefix
        if (course.id.toLowerCase().startsWith(query)) score += 80;
        if (course.name.toLowerCase().startsWith(query)) score += 70;
        if (course.department.abbreviation.toLowerCase().startsWith(query)) score += 60;

        // Contains matches
        if (courseCode.includes(query)) score += 45; // Higher than other contains matches
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
        if (this.professorCache) {
            return this.professorCache;
        }
        
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

        this.professorCache = Array.from(professors).sort();
        return this.professorCache;
    }

    getAvailableBuildings(): string[] {
        if (this.buildingCache) {
            return this.buildingCache;
        }
        
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

        this.buildingCache = Array.from(buildings).sort();
        return this.buildingCache;
    }

    private clearCaches(): void {
        this.professorCache = null;
        this.buildingCache = null;
        this.searchIndex.clear();
        this.timeSlotMappings.clear();
    }

    private buildSearchIndex(): void {
        this.courses.forEach(course => {
            const keywords = this.extractKeywords(course);
            keywords.forEach(keyword => {
                if (!this.searchIndex.has(keyword)) {
                    this.searchIndex.set(keyword, new Set());
                }
                this.searchIndex.get(keyword)!.add(course);
            });
        });
    }

    private extractKeywords(course: Course): string[] {
        const courseCode = `${course.department.abbreviation}${course.number}`.toLowerCase();
        const keywords = [
            course.id.toLowerCase(),
            course.name.toLowerCase(),
            course.number.toLowerCase(),
            course.department.abbreviation.toLowerCase(),
            course.department.name.toLowerCase(),
            courseCode,
            ...course.description.toLowerCase().split(/\s+/)
        ];
        
        // Add partial keywords for better matching
        keywords.forEach(keyword => {
            if (keyword.length > 3) {
                for (let i = 0; i < keyword.length - 2; i++) {
                    keywords.push(keyword.substring(i, i + 3));
                }
            }
        });
        
        return keywords.filter(k => k.length > 1);
    }

    private searchFromIndex(query: string): Course[] {
        const results = new Set<Course>();
        
        // Direct keyword match
        if (this.searchIndex.has(query)) {
            this.searchIndex.get(query)!.forEach(course => results.add(course));
        }
        
        // Partial matches
        for (const [keyword, courses] of this.searchIndex.entries()) {
            if (keyword.includes(query) || query.includes(keyword)) {
                courses.forEach(course => results.add(course));
            }
        }
        
        return Array.from(results);
    }

    private fuzzyMatch(text: string, query: string): boolean {
        // Simple fuzzy matching - exact match or contains
        if (text.includes(query)) {
            return true;
        }
        
        // Allow for one character difference in short queries
        if (query.length <= 3) {
            return text.includes(query);
        }
        
        // For longer queries, check if most characters match
        const words = query.split(/\s+/);
        return words.every(word => {
            if (word.length <= 2) return text.includes(word);
            
            // Allow partial matches for longer words
            const partial = word.substring(0, Math.floor(word.length * 0.8));
            return text.includes(partial);
        });
    }

    private buildTimeSlotMappings(): void {
        this.courses.forEach(course => {
            course.sections.forEach(section => {
                section.periods.forEach(period => {
                    const timeKey = this.getTimeSlotKey(period);
                    if (!this.timeSlotMappings.has(timeKey)) {
                        this.timeSlotMappings.set(timeKey, []);
                    }
                    if (!this.timeSlotMappings.get(timeKey)!.includes(course)) {
                        this.timeSlotMappings.get(timeKey)!.push(course);
                    }
                });
            });
        });
    }

    private getTimeSlotKey(period: Period): string {
        const startMinutes = period.startTime.hours * 60 + period.startTime.minutes;
        const endMinutes = period.endTime.hours * 60 + period.endTime.minutes;
        const days = Array.from(period.days).sort().join('');
        return `${days}-${startMinutes}-${endMinutes}`;
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