export function dayToNumber(day: string): number {
    const map: Record<string, number> = {
        'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4,
        'fri': 5, 'sat': 6, 'sun': 7
    };
    return map[day.toLowerCase()] ?? 1;
}

export function numberToDay(num: number): string {
    const map: Record<number, string> = {
        1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu',
        5: 'fri', 6: 'sat', 7: 'sun'
    };
    return map[num] ?? 'mon';
}

export function minutesToTime(minutes: number): { hours: number; minutes: number } {
    return {
        hours: Math.floor(minutes / 60),
        minutes: minutes % 60
    };
}
