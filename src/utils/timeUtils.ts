import { Time, DayOfWeek } from '../types/types';

export class TimeUtils {
  static readonly DAYS_ORDER = [
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY,
    DayOfWeek.SUNDAY,
  ];

  /** Format time for display, e.g. "9:00 AM", "2:30 PM" */
  static formatTime(time: Time): string {
    if (time.displayTime) {
      return time.displayTime;
    }

    const hours12 =
      time.hours === 0 ? 12 : time.hours > 12 ? time.hours - 12 : time.hours;
    const ampm = time.hours >= 12 ? 'PM' : 'AM';
    const minutes = time.minutes.toString().padStart(2, '0');

    return `${hours12}:${minutes} ${ampm}`;
  }

  /** Format time range for display, e.g. "9:00-9:50 AM" */
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

  /** Format days for display, e.g. "MWF", "TR" */
  static formatDays(days: Set<DayOfWeek>): string {
    const dayAbbreviations: { [key in DayOfWeek]: string } = {
      [DayOfWeek.MONDAY]: 'M',
      [DayOfWeek.TUESDAY]: 'T',
      [DayOfWeek.WEDNESDAY]: 'W',
      [DayOfWeek.THURSDAY]: 'R',
      [DayOfWeek.FRIDAY]: 'F',
      [DayOfWeek.SATURDAY]: 'S',
      [DayOfWeek.SUNDAY]: 'U',
    };

    return TimeUtils.DAYS_ORDER.filter(day => days.has(day))
      .map(day => dayAbbreviations[day])
      .join('');
  }

  static getDayName(day: DayOfWeek): string {
    const dayNames: { [key in DayOfWeek]: string } = {
      [DayOfWeek.MONDAY]: 'Monday',
      [DayOfWeek.TUESDAY]: 'Tuesday',
      [DayOfWeek.WEDNESDAY]: 'Wednesday',
      [DayOfWeek.THURSDAY]: 'Thursday',
      [DayOfWeek.FRIDAY]: 'Friday',
      [DayOfWeek.SATURDAY]: 'Saturday',
      [DayOfWeek.SUNDAY]: 'Sunday',
    };

    return dayNames[day];
  }

  static getDayAbbr(day: DayOfWeek): string {
    const dayAbbrs: { [key in DayOfWeek]: string } = {
      [DayOfWeek.MONDAY]: 'Mon',
      [DayOfWeek.TUESDAY]: 'Tue',
      [DayOfWeek.WEDNESDAY]: 'Wed',
      [DayOfWeek.THURSDAY]: 'Thu',
      [DayOfWeek.FRIDAY]: 'Fri',
      [DayOfWeek.SATURDAY]: 'Sat',
      [DayOfWeek.SUNDAY]: 'Sun',
    };

    return dayAbbrs[day];
  }
}
