import { DayOfWeek } from '../types/types';
import type { Section, Period } from '../types/types';
import { DEFAULT_SCORE_WEIGHTS } from '../types/schedule';
import type { ScheduleScore, ScoreWeights, SchedulePreferences } from '../types/schedule';

interface ScheduleResult {
  course: {
    id: string;
    department: {
      abbreviation: string;
    };
    number: string;
  };
  combination: {
    lecture: Section | null;
    discussion: Section | null;
    lab: Section | null;
  };
}

export class ScheduleScorer {
  calculateCompositeScore(
    schedule: ScheduleResult[],
    preferences: SchedulePreferences,
    weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS
  ): ScheduleScore {
    const timeGapScore = this.calculateTimeGapScore(schedule);
    const compactnessScore = this.calculateCompactnessScore(schedule);
    const timePreferenceScore = this.calculateTimePreferenceScore(schedule, preferences);
    const consecutiveClassScore = this.calculateConsecutiveClassScore(schedule, preferences);
    const buildingTransitionScore = this.calculateBuildingTransitionScore(schedule);
    const balancedLoadScore = this.calculateBalancedLoadScore(schedule);

    const totalScore =
      timeGapScore * weights.timeGap +
      compactnessScore * weights.compactness +
      timePreferenceScore * weights.timePreference +
      consecutiveClassScore * weights.consecutiveClass +
      buildingTransitionScore * weights.buildingTransition +
      balancedLoadScore * weights.balancedLoad;

    return {
      totalScore: Math.round(totalScore),
      timeGapScore: Math.round(timeGapScore),
      compactnessScore: Math.round(compactnessScore),
      timePreferenceScore: Math.round(timePreferenceScore),
      consecutiveClassScore: Math.round(consecutiveClassScore),
      buildingTransitionScore: Math.round(buildingTransitionScore),
      balancedLoadScore: Math.round(balancedLoadScore)
    };
  }

  private calculateTimeGapScore(schedule: ScheduleResult[]): number {
    const allSections = this.extractAllSections(schedule);
    const dailyGaps = this.calculateDailyGaps(allSections);
    const totalGapMinutes = dailyGaps.reduce((sum, gap) => sum + gap, 0);

    return Math.max(0, 300 - (totalGapMinutes / 10));
  }

  private calculateDailyGaps(sections: Section[]): number[] {
    const days: DayOfWeek[] = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
    const gaps: number[] = [];

    for (const day of days) {
      const periodsOnDay: Period[] = [];

      for (const section of sections) {
        for (const period of section.periods) {
          if (period.days.has(day)) {
            periodsOnDay.push(period);
          }
        }
      }

      if (periodsOnDay.length <= 1) {
        continue;
      }

      periodsOnDay.sort((a, b) => {
        const aMinutes = a.startTime.hours * 60 + a.startTime.minutes;
        const bMinutes = b.startTime.hours * 60 + b.startTime.minutes;
        return aMinutes - bMinutes;
      });

      let dayGap = 0;
      for (let i = 0; i < periodsOnDay.length - 1; i++) {
        const endMinutes = periodsOnDay[i].endTime.hours * 60 + periodsOnDay[i].endTime.minutes;
        const nextStartMinutes = periodsOnDay[i + 1].startTime.hours * 60 + periodsOnDay[i + 1].startTime.minutes;
        const gap = nextStartMinutes - endMinutes;
        if (gap > 0) {
          dayGap += gap;
        }
      }

      gaps.push(dayGap);
    }

    return gaps;
  }

  private calculateCompactnessScore(schedule: ScheduleResult[]): number {
    const allSections = this.extractAllSections(schedule);
    const daysUsed = this.countUniqueDaysUsed(allSections);

    const compactnessMap: Record<number, number> = {
      1: 300,
      2: 250,
      3: 200,
      4: 150,
      5: 100
    };

    return compactnessMap[daysUsed] || 50;
  }

  private countUniqueDaysUsed(sections: Section[]): number {
    const daysSet = new Set<DayOfWeek>();

    for (const section of sections) {
      for (const period of section.periods) {
        period.days.forEach(day => daysSet.add(day));
      }
    }

    return daysSet.size;
  }

  private calculateTimePreferenceScore(
    schedule: ScheduleResult[],
    preferences: SchedulePreferences
  ): number {
    let score = 200;
    const allSections = this.extractAllSections(schedule);

    for (const section of allSections) {
      for (const period of section.periods) {
        if (!this.isWithinTimeRange(period, preferences.preferredTimeRange)) {
          score -= 20;
        }
      }
    }

    return Math.max(0, score);
  }

  private isWithinTimeRange(
    period: Period,
    timeRange: { startTime: { hours: number; minutes: number }; endTime: { hours: number; minutes: number }}
  ): boolean {
    const periodStart = period.startTime.hours * 60 + period.startTime.minutes;
    const periodEnd = period.endTime.hours * 60 + period.endTime.minutes;
    const rangeStart = timeRange.startTime.hours * 60 + timeRange.startTime.minutes;
    const rangeEnd = timeRange.endTime.hours * 60 + timeRange.endTime.minutes;

    return periodStart >= rangeStart && periodEnd <= rangeEnd;
  }

  private calculateConsecutiveClassScore(
    schedule: ScheduleResult[],
    preferences: SchedulePreferences
  ): number {
    const allSections = this.extractAllSections(schedule);
    const consecutivePairCount = this.countConsecutiveClassPairs(allSections);

    if (preferences.avoidBackToBackClasses) {
      return Math.max(0, 150 - (consecutivePairCount * 25));
    } else {
      return 150 + (consecutivePairCount * 15);
    }
  }

  private countConsecutiveClassPairs(sections: Section[]): number {
    const days: DayOfWeek[] = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
    let consecutiveCount = 0;

    for (const day of days) {
      const periodsOnDay: Period[] = [];

      for (const section of sections) {
        for (const period of section.periods) {
          if (period.days.has(day)) {
            periodsOnDay.push(period);
          }
        }
      }

      if (periodsOnDay.length <= 1) {
        continue;
      }

      periodsOnDay.sort((a, b) => {
        const aMinutes = a.startTime.hours * 60 + a.startTime.minutes;
        const bMinutes = b.startTime.hours * 60 + b.startTime.minutes;
        return aMinutes - bMinutes;
      });

      for (let i = 0; i < periodsOnDay.length - 1; i++) {
        const endMinutes = periodsOnDay[i].endTime.hours * 60 + periodsOnDay[i].endTime.minutes;
        const nextStartMinutes = periodsOnDay[i + 1].startTime.hours * 60 + periodsOnDay[i + 1].startTime.minutes;
        const gap = nextStartMinutes - endMinutes;

        if (gap >= 0 && gap <= 15) {
          consecutiveCount++;
        }
      }
    }

    return consecutiveCount;
  }

  private calculateBuildingTransitionScore(schedule: ScheduleResult[]): number {
    const allSections = this.extractAllSections(schedule);
    const transitions = this.countBuildingTransitions(allSections);

    return Math.max(0, 150 - (transitions * 10));
  }

  private countBuildingTransitions(sections: Section[]): number {
    const days: DayOfWeek[] = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
    let transitions = 0;

    for (const day of days) {
      const periodsOnDay: Period[] = [];

      for (const section of sections) {
        for (const period of section.periods) {
          if (period.days.has(day)) {
            periodsOnDay.push(period);
          }
        }
      }

      if (periodsOnDay.length <= 1) {
        continue;
      }

      periodsOnDay.sort((a, b) => {
        const aMinutes = a.startTime.hours * 60 + a.startTime.minutes;
        const bMinutes = b.startTime.hours * 60 + b.startTime.minutes;
        return aMinutes - bMinutes;
      });

      for (let i = 0; i < periodsOnDay.length - 1; i++) {
        const currentBuilding = periodsOnDay[i].building || '';
        const nextBuilding = periodsOnDay[i + 1].building || '';

        if (currentBuilding && nextBuilding && currentBuilding !== nextBuilding) {
          transitions++;
        }
      }
    }

    return transitions;
  }

  private calculateBalancedLoadScore(schedule: ScheduleResult[]): number {
    const allSections = this.extractAllSections(schedule);
    const classesPerDay = this.countClassesPerDay(allSections);

    if (classesPerDay.length === 0) {
      return 100;
    }

    const avg = classesPerDay.reduce((sum, count) => sum + count, 0) / classesPerDay.length;
    const variance = classesPerDay.reduce((sum, count) => sum + Math.pow(count - avg, 2), 0) / classesPerDay.length;
    const stdDev = Math.sqrt(variance);

    return Math.max(0, 100 - (stdDev * 30));
  }

  private countClassesPerDay(sections: Section[]): number[] {
    const days: DayOfWeek[] = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
    const counts: number[] = [];

    for (const day of days) {
      let count = 0;

      for (const section of sections) {
        for (const period of section.periods) {
          if (period.days.has(day)) {
            count++;
            break;
          }
        }
      }

      if (count > 0) {
        counts.push(count);
      }
    }

    return counts;
  }

  private extractAllSections(schedule: ScheduleResult[]): Section[] {
    const sections: Section[] = [];

    for (const result of schedule) {
      if (result.combination.lecture) {
        sections.push(result.combination.lecture);
      }
      if (result.combination.discussion) {
        sections.push(result.combination.discussion);
      }
      if (result.combination.lab) {
        sections.push(result.combination.lab);
      }
    }

    return sections;
  }
}
