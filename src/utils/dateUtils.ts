export class DateUtils {
    static getCurrentAcademicYear(): number {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        
        // Academic year starts in August (month 7, 0-indexed)
        return currentMonth >= 7 ? currentYear : currentYear - 1;
    }

    static getAcademicYearRange(startYear: number): string {
        return `${startYear}-${startYear + 1}`;
    }

    static getCurrentSemester(): 'fall' | 'spring' | 'summer' {
        const now = new Date();
        const month = now.getMonth(); // 0-indexed
        
        if (month >= 7 && month <= 11) {
            return 'fall';
        } else if (month >= 0 && month <= 4) {
            return 'spring';
        } else {
            return 'summer';
        }
    }

    static getSemesterDateRange(year: number, semester: 'fall' | 'spring' | 'summer'): { start: Date; end: Date } {
        switch (semester) {
            case 'fall':
                return {
                    start: new Date(year, 8, 1), // September 1
                    end: new Date(year, 11, 31)  // December 31
                };
            case 'spring':
                return {
                    start: new Date(year + 1, 0, 1), // January 1 of next year
                    end: new Date(year + 1, 4, 31)   // May 31 of next year
                };
            case 'summer':
                return {
                    start: new Date(year + 1, 5, 1), // June 1 of next year
                    end: new Date(year + 1, 7, 31)   // August 31 of next year
                };
        }
    }

    static formatTime(hours: number, minutes: number): string {
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
        const displayMinutes = minutes.toString().padStart(2, '0');
        return `${displayHours}:${displayMinutes} ${period}`;
    }

    static parseTime(timeStr: string): { hours: number; minutes: number } | null {
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!match) return null;

        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const period = match[3].toUpperCase();

        if (period === 'PM' && hours !== 12) {
            hours += 12;
        } else if (period === 'AM' && hours === 12) {
            hours = 0;
        }

        return { hours, minutes };
    }

    static isWeekday(date: Date): boolean {
        const day = date.getDay();
        return day >= 1 && day <= 5; // Monday (1) to Friday (5)
    }

    static getDayName(dayIndex: number): string {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[dayIndex] || '';
    }

    static getDayAbbreviation(dayIndex: number): string {
        const abbrevs = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        return abbrevs[dayIndex] || '';
    }
}