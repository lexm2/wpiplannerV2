import { Time, DayOfWeek } from '../../types/types';

export class TimeUtils {
    // Schedule grid constants - 7 AM to 7 PM (12 hours)
    static readonly START_HOUR = 7;  // 7 AM
    static readonly END_HOUR = 19;   // 7 PM
    static readonly TOTAL_HOURS = 12;
    static readonly SLOTS_PER_HOUR = 2; // 30-minute intervals
    static readonly TOTAL_TIME_SLOTS = TimeUtils.TOTAL_HOURS * TimeUtils.SLOTS_PER_HOUR;

    // Days of the week in order
    static readonly DAYS_ORDER = [
        DayOfWeek.MONDAY,
        DayOfWeek.TUESDAY, 
        DayOfWeek.WEDNESDAY,
        DayOfWeek.THURSDAY,
        DayOfWeek.FRIDAY,
        DayOfWeek.SATURDAY,
        DayOfWeek.SUNDAY
    ];

    /**
     * Convert a Time object to a grid row position (0-based)
     * 7:00 AM = row 0, 7:30 AM = row 1, etc.
     */
    static timeToGridRow(time: Time): number {
        const totalMinutes = time.hours * 60 + time.minutes;
        const startMinutes = TimeUtils.START_HOUR * 60;
        const relativeMinutes = totalMinutes - startMinutes;
        
        // Convert to 30-minute slots
        const slot = Math.floor(relativeMinutes / 30);
        
        // Ensure within bounds
        return Math.max(0, Math.min(slot, TimeUtils.TOTAL_TIME_SLOTS - 1));
    }

    /**
     * Convert day of week to grid column position (0-based)
     * Monday = 0, Tuesday = 1, etc.
     */
    static dayToGridColumn(day: DayOfWeek): number {
        return TimeUtils.DAYS_ORDER.indexOf(day);
    }

    /**
     * Calculate how many grid rows a time period spans
     */
    static calculateDuration(startTime: Time, endTime: Time): number {
        const startRow = TimeUtils.timeToGridRow(startTime);
        const endRow = TimeUtils.timeToGridRow(endTime);
        return Math.max(1, endRow - startRow);
    }

    /**
     * Check if a time is within the schedule grid bounds (7 AM - 7 PM)
     */
    static isTimeInBounds(time: Time): boolean {
        return time.hours >= TimeUtils.START_HOUR && time.hours < TimeUtils.END_HOUR;
    }

    /**
     * Format time for display (e.g., "9:00 AM", "2:30 PM")
     */
    static formatTime(time: Time): string {
        if (time.displayTime) {
            return time.displayTime;
        }
        
        const hours12 = time.hours === 0 ? 12 : time.hours > 12 ? time.hours - 12 : time.hours;
        const ampm = time.hours >= 12 ? 'PM' : 'AM';
        const minutes = time.minutes.toString().padStart(2, '0');
        
        return `${hours12}:${minutes} ${ampm}`;
    }

    /**
     * Format time range for display (e.g., "9:00-9:50 AM")
     */
    static formatTimeRange(startTime: Time, endTime: Time): string {
        const startFormatted = TimeUtils.formatTime(startTime);
        const endFormatted = TimeUtils.formatTime(endTime);
        
        // If same AM/PM, only show it once
        if (startTime.hours < 12 && endTime.hours < 12) {
            return `${startFormatted.replace(' AM', '')}-${endFormatted}`;
        } else if (startTime.hours >= 12 && endTime.hours >= 12) {
            return `${startFormatted.replace(' PM', '')}-${endFormatted}`;
        } else {
            return `${startFormatted}-${endFormatted}`;
        }
    }

    /**
     * Format days for display (e.g., "MWF", "TR")
     */
    static formatDays(days: Set<DayOfWeek>): string {
        const dayAbbreviations: { [key in DayOfWeek]: string } = {
            [DayOfWeek.MONDAY]: 'M',
            [DayOfWeek.TUESDAY]: 'T',
            [DayOfWeek.WEDNESDAY]: 'W',
            [DayOfWeek.THURSDAY]: 'R',
            [DayOfWeek.FRIDAY]: 'F',
            [DayOfWeek.SATURDAY]: 'S',
            [DayOfWeek.SUNDAY]: 'U'
        };

        return TimeUtils.DAYS_ORDER
            .filter(day => days.has(day))
            .map(day => dayAbbreviations[day])
            .join('');
    }

    /**
     * Generate time labels for the grid (7:00 AM, 7:30 AM, etc.)
     */
    static generateTimeLabels(): string[] {
        const labels: string[] = [];
        
        for (let hour = TimeUtils.START_HOUR; hour < TimeUtils.END_HOUR; hour++) {
            // Add hour:00
            labels.push(TimeUtils.formatTime({ hours: hour, minutes: 0, displayTime: '' }));
            // Add hour:30
            labels.push(TimeUtils.formatTime({ hours: hour, minutes: 30, displayTime: '' }));
        }
        
        return labels;
    }

    /**
     * Get day name for display
     */
    static getDayName(day: DayOfWeek): string {
        const dayNames: { [key in DayOfWeek]: string } = {
            [DayOfWeek.MONDAY]: 'Monday',
            [DayOfWeek.TUESDAY]: 'Tuesday',
            [DayOfWeek.WEDNESDAY]: 'Wednesday',
            [DayOfWeek.THURSDAY]: 'Thursday',
            [DayOfWeek.FRIDAY]: 'Friday',
            [DayOfWeek.SATURDAY]: 'Saturday',
            [DayOfWeek.SUNDAY]: 'Sunday'
        };

        return dayNames[day];
    }

    /**
     * Get abbreviated day name for display
     */
    static getDayAbbr(day: DayOfWeek): string {
        const dayAbbrs: { [key in DayOfWeek]: string } = {
            [DayOfWeek.MONDAY]: 'Mon',
            [DayOfWeek.TUESDAY]: 'Tue',
            [DayOfWeek.WEDNESDAY]: 'Wed',
            [DayOfWeek.THURSDAY]: 'Thu',
            [DayOfWeek.FRIDAY]: 'Fri',
            [DayOfWeek.SATURDAY]: 'Sat',
            [DayOfWeek.SUNDAY]: 'Sun'
        };

        return dayAbbrs[day];
    }
}