/**
 * Utilities for parsing Workday time and meeting pattern data
 */

export interface ParsedMeetingPattern {
    location: string;
    days: string[];
    startTime: string;
    endTime: string;
}

/**
 * Parses Workday Section_Details format
 * Format: "Location | Days | Time; Location2 | Days2 | Time2"
 * Example: "Fuller Labs 311 | M-T-R-F | 9:00 AM - 9:50 AM"
 */
export function parseSectionDetails(sectionDetails: string): ParsedMeetingPattern[] {
    if (!sectionDetails || sectionDetails.trim() === '') {
        return [{
            location: 'Unknown',
            days: [],
            startTime: '12:00',
            endTime: '12:00'
        }];
    }

    const patterns: ParsedMeetingPattern[] = [];
    const meetings = sectionDetails.split(';').map(s => s.trim());

    for (const meeting of meetings) {
        const parts = meeting.split('|').map(s => s.trim());

        // Handle missing location case
        if (parts.length === 2) {
            // Format: "Days | Time"
            patterns.push({
                location: 'Unknown',
                days: parseDays(parts[0]),
                ...parseTime(parts[1])
            });
        } else if (parts.length >= 3) {
            // Format: "Location | Days | Time"
            patterns.push({
                location: parts[0],
                days: parseDays(parts[1]),
                ...parseTime(parts[2])
            });
        } else if (parts.length === 1) {
            // Only location, no meeting pattern
            patterns.push({
                location: parts[0],
                days: [],
                startTime: '12:00',
                endTime: '12:00'
            });
        }
    }

    return patterns.length > 0 ? patterns : [{
        location: 'Unknown',
        days: [],
        startTime: '12:00',
        endTime: '12:00'
    }];
}

/**
 * Parses day codes from Workday format
 * M = Monday, T = Tuesday, W = Wednesday, R = Thursday, F = Friday
 */
function parseDays(dayString: string): string[] {
    const days: string[] = [];

    if (dayString.includes('M')) days.push('mon');
    if (dayString.includes('T')) days.push('tue');
    if (dayString.includes('W')) days.push('wed');
    if (dayString.includes('R')) days.push('thu');
    if (dayString.includes('F')) days.push('fri');

    return days;
}

/**
 * Parses time range from Workday format
 * Format: "9:00 AM - 9:50 AM"
 * Returns 24-hour format: "09:00" - "09:50"
 */
function parseTime(timeString: string): { startTime: string, endTime: string } {
    const match = timeString.match(/(\d+:\d+\s*[AP]M)\s*-\s*(\d+:\d+\s*[AP]M)/i);

    if (!match) {
        return { startTime: '12:00', endTime: '12:00' };
    }

    return {
        startTime: convertTo24Hour(match[1].trim()),
        endTime: convertTo24Hour(match[2].trim())
    };
}

/**
 * Converts 12-hour time to 24-hour format
 * "9:00 AM" → "09:00"
 * "2:30 PM" → "14:30"
 */
function convertTo24Hour(time12: string): string {
    const match = time12.match(/(\d+):(\d+)\s*([AP]M)/i);

    if (!match) {
        return '12:00';
    }

    let hours = parseInt(match[1]);
    const minutes = match[2];
    const period = match[3].toUpperCase();

    if (period === 'PM' && hours !== 12) {
        hours += 12;
    } else if (period === 'AM' && hours === 12) {
        hours = 0;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

/**
 * Converts time string to minutes since midnight for comparison
 * "09:00" → 540
 * "14:30" → 870
 */
export function timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Checks if two time ranges overlap
 * Returns true if times overlap, false otherwise
 */
export function timeRangesOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string
): boolean {
    const start1Min = timeToMinutes(start1);
    const end1Min = timeToMinutes(end1);
    const start2Min = timeToMinutes(start2);
    const end2Min = timeToMinutes(end2);

    // Check if ranges overlap: start2 < end1 AND end2 > start1
    return start2Min < end1Min && end2Min > start1Min;
}
