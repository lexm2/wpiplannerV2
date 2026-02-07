/**
 * High-performance full-text search engine with indexing, ranking, and schedule-aware filtering for course discovery
 */
import { Course, Department, Period, DayOfWeek, TimeSlot } from '../../types/types'
import { SearchFilter } from '../../types/ui'
import { getAllSections } from '../../utils/courseUtils'

export class SearchService {
    private courses: Course[] = [];
    private departments: Department[] = [];
    private searchIndex: Map<string, Set<Course>> = new Map();
    private professorCache: string[] | null = null;
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

        // PHASE 1: Search ID/Name/Number only (no descriptions)
        const phase1Results = courses.filter(course => {
            const courseCode = `${course.department.abbreviation}${course.number}`;
            const courseTextNoDesc = [
                course.id,
                course.name,
                course.department.abbreviation,
                course.department.name,
                course.number,
                courseCode
            ].join(' ').toLowerCase();

            return this.fuzzyMatch(courseTextNoDesc, queryLower);
        });

        // If we found results without searching descriptions, return early
        if (phase1Results.length > 0) {
            return phase1Results;
        }

        // PHASE 2: Fallback to description search only if no ID/name matches
        return courses.filter(course => {
            const descriptionText = course.description.toLowerCase();
            return this.fuzzyMatch(descriptionText, queryLower);
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
                const sections = getAllSections(course);
                const hasAvailableSeats = sections.some(section => section.seatsAvailable > 0);
                if (!hasAvailableSeats) {
                    return false;
                }
            }

            // Time slot filter
            if (filters.timeSlots.length > 0) {
                const sections = getAllSections(course);
                const matchesTimeSlot = sections.some(section =>
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
                const sections = getAllSections(course);
                const hasProfessor = sections.some(section =>
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
        const dayOverlaps = timeSlot.days.some((day: DayOfWeek) => period.days.has(day));

        return timeOverlaps && dayOverlaps;
    }

    public rankCoursesByRelevance(courses: Course[], query: string): Course[] {
        if (!query.trim()) return courses;

        const queryLower = query.toLowerCase();

        return courses.sort((a, b) => {
            const scoreA = this.calculateRelevanceScore(a, queryLower);
            const scoreB = this.calculateRelevanceScore(b, queryLower);
            return scoreB - scoreA;
        });
    }

    private rankResults(courses: Course[], query: string): Course[] {
        return this.rankCoursesByRelevance(courses, query);
    }

    private calculateRelevanceScore(course: Course, query: string): number {
        let score = 0;

        const queryLower = query.toLowerCase();
        const normalizedQuery = query.replace(/[-\s]/g, '').toLowerCase();
        const courseCode = `${course.department.abbreviation}${course.number}`.toLowerCase().replace(/[-\s]/g, '');
        const normalizedId = course.id.toLowerCase().replace(/[-\s]/g, '');
        const courseName = course.name.toLowerCase();
        const courseDescription = course.description.toLowerCase();

        // TIER 1: Exact ID/Code matches (1000+ points)
        if (courseCode === normalizedQuery) score += 1000;
        if (normalizedId === normalizedQuery) score += 950;
        if (course.number.toLowerCase() === normalizedQuery) score += 900;

        // TIER 2: Exact name matches (800+ points) - check both normalized and original
        if (courseName === queryLower) score += 850;
        if (courseName === normalizedQuery) score += 840;

        // TIER 3: Prefix matches for ID/Code (700+ points)
        if (courseCode.startsWith(normalizedQuery)) score += 750;
        if (normalizedId.startsWith(normalizedQuery)) score += 700;
        if (course.number.toLowerCase().startsWith(normalizedQuery)) score += 650;

        // TIER 4: Prefix matches for name (600+ points)
        if (courseName.startsWith(queryLower)) score += 600;

        // TIER 5: Contains matches for ID/Code (500+ points)
        if (courseCode.includes(normalizedQuery)) score += 500;
        if (normalizedId.includes(normalizedQuery)) score += 450;

        // TIER 6: Contains matches for name (400+ points)
        if (courseName.includes(queryLower)) score += 400;

        // TIER 7: Department matches (300+ points)
        if (course.department.abbreviation.toLowerCase() === normalizedQuery) score += 350;
        if (course.department.abbreviation.toLowerCase().startsWith(normalizedQuery)) score += 300;

        // TIER 8: Description matches (1 point only)
        if (courseDescription.includes(queryLower)) score += 1;

        // Small boost for availability (doesn't override tier system)
        const sections = getAllSections(course);
        const availableSeats = sections.reduce((sum, section) => sum + section.seatsAvailable, 0);
        if (availableSeats > 0) score += 0.5;

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
            const sections = getAllSections(course);
            sections.forEach(section => {
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


    private clearCaches(): void {
        this.professorCache = null;
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
            const sections = getAllSections(course);
            sections.forEach(section => {
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