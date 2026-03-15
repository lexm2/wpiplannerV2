import { SimpleTime } from '../types/types';
import type { DateRange } from '../types/common';

export class DateUtils {
    private static readonly AUGUST_MONTH = 7;
    private static readonly NOVEMBER_MONTH = 11;
    private static readonly APRIL_MONTH = 4;
    private static readonly SEPTEMBER_MONTH = 8;
    private static readonly DECEMBER_MONTH = 11;
    private static readonly JANUARY_MONTH = 0;
    private static readonly MAY_MONTH = 4;
    private static readonly JUNE_MONTH = 5;
    private static readonly FIRST_DAY = 1;
    private static readonly LAST_DAY_31 = 31;
    private static readonly NOON_HOUR = 12;
    private static readonly MIDNIGHT_HOUR = 0;
    private static readonly HOURS_IN_HALF_DAY = 12;
    private static readonly MONDAY = 1;
    private static readonly FRIDAY = 5;
    private static readonly MINUTES_PER_HOUR = 60;

    static getCurrentAcademicYear(): number {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        return currentMonth >= DateUtils.AUGUST_MONTH ? currentYear : currentYear - 1;
    }

    static getAcademicYearRange(startYear: number): string {
        return `${startYear}-${startYear + 1}`;
    }

    static getCurrentSemester(): 'fall' | 'spring' | 'summer' {
        const now = new Date();
        const month = now.getMonth();

        if (month >= DateUtils.AUGUST_MONTH && month <= DateUtils.NOVEMBER_MONTH) {
            return 'fall';
        } else if (month >= DateUtils.JANUARY_MONTH && month <= DateUtils.APRIL_MONTH) {
            return 'spring';
        } else {
            return 'summer';
        }
    }

    static getSemesterDateRange(year: number, semester: 'fall' | 'spring' | 'summer'): DateRange {
        switch (semester) {
            case 'fall':
                return {
                    start: new Date(year, DateUtils.SEPTEMBER_MONTH, DateUtils.FIRST_DAY),
                    end: new Date(year, DateUtils.DECEMBER_MONTH, DateUtils.LAST_DAY_31)
                };
            case 'spring':
                return {
                    start: new Date(year + 1, DateUtils.JANUARY_MONTH, DateUtils.FIRST_DAY),
                    end: new Date(year + 1, DateUtils.MAY_MONTH, DateUtils.LAST_DAY_31)
                };
            case 'summer':
                return {
                    start: new Date(year + 1, DateUtils.JUNE_MONTH, DateUtils.FIRST_DAY),
                    end: new Date(year + 1, DateUtils.AUGUST_MONTH, DateUtils.LAST_DAY_31)
                };
        }
    }

    static formatTime(hours: number, minutes: number): string {
        const period = hours >= DateUtils.NOON_HOUR ? 'PM' : 'AM';
        const displayHours = hours > DateUtils.NOON_HOUR ? hours - DateUtils.HOURS_IN_HALF_DAY : (hours === DateUtils.MIDNIGHT_HOUR ? DateUtils.NOON_HOUR : hours);
        const displayMinutes = minutes.toString().padStart(2, '0');
        return `${displayHours}:${displayMinutes} ${period}`;
    }

    static parseTime(timeStr: string): SimpleTime | null {
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!match) return null;

        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const period = match[3].toUpperCase();

        if (period === 'PM' && hours !== DateUtils.NOON_HOUR) {
            hours += DateUtils.HOURS_IN_HALF_DAY;
        } else if (period === 'AM' && hours === DateUtils.NOON_HOUR) {
            hours = DateUtils.MIDNIGHT_HOUR;
        }

        return { hours, minutes };
    }

    static isWeekday(date: Date): boolean {
        const day = date.getDay();
        return day >= DateUtils.MONDAY && day <= DateUtils.FRIDAY;
    }

    static getDayName(dayIndex: number): string {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[dayIndex] ?? '';
    }

    static getDayAbbreviation(dayIndex: number): string {
        const abbrevs = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        return abbrevs[dayIndex] ?? '';
    }

    static timeToMinutes(time: SimpleTime): number {
        return time.hours * DateUtils.MINUTES_PER_HOUR + time.minutes;
    }
}