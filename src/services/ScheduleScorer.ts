import { DayOfWeek } from '../types/types';
import type { Section, Period } from '../types/types';
import { DEFAULT_SCORE_WEIGHTS } from '../types/schedule';
import type { ScheduleScore, ScoreWeights, SchedulePreferences } from '../types/schedule';
import { rateMyProfessorService } from './RateMyProfessorService';

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
    const earlyMorningPenalty = this.calculateEarlyMorningPenalty(schedule);
    const professorRatingScore = this.calculateProfessorRatingScore(schedule);
    const classesPerTermScore = this.calculateClassesPerTermScore(schedule);

    const totalScore =
      professorRatingScore * weights.professorRating +
      earlyMorningPenalty * weights.earlyMorning +
      classesPerTermScore * weights.classesPerTerm +
      timeGapScore * weights.timeGap;

    return {
      totalScore: Math.round(totalScore),
      timeGapScore: Math.round(timeGapScore),
      compactnessScore: 0,
      timePreferenceScore: 0,
      consecutiveClassScore: 0,
      buildingTransitionScore: 0,
      balancedLoadScore: 0,
      earlyMorningPenalty: Math.round(earlyMorningPenalty),
      professorRatingScore: Math.round(professorRatingScore),
      classesPerTermScore: Math.round(classesPerTermScore)
    };
  }

  private calculateTimeGapScore(schedule: ScheduleResult[]): number {
    const allSections = this.extractAllSections(schedule);
    let perfectGapsCount = 0;

    const days: DayOfWeek[] = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];

    for (const day of days) {
      const periodsOnDay: Period[] = [];

      for (const section of allSections) {
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

        if (gap === 10) {
          perfectGapsCount++;
        }
      }
    }

    return perfectGapsCount * 50;
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

  private calculateEarlyMorningPenalty(schedule: ScheduleResult[]): number {
    const allSections = this.extractAllSections(schedule);
    let earlyMorningCount = 0;

    for (const section of allSections) {
      for (const period of section.periods) {
        if (period.startTime.hours === 8 && period.startTime.minutes === 0) {
          earlyMorningCount++;
        }
      }
    }

    return earlyMorningCount * -100;
  }

  private calculateProfessorRatingScore(schedule: ScheduleResult[]): number {
    const allSections = this.extractAllSections(schedule);
    let totalRating = 0;
    let ratedProfessors = 0;

    for (const section of allSections) {
      for (const period of section.periods) {
        if (!period.professor) continue;

        const professor = rateMyProfessorService.findProfessor(period.professor);
        if (professor && professor.numRatings > 0) {
          totalRating += professor.avgRating;
          ratedProfessors++;
        }
      }
    }

    if (ratedProfessors === 0) return 100;

    const avgRating = totalRating / ratedProfessors;
    return (avgRating / 5.0) * 200;
  }

  private calculateClassesPerTermScore(schedule: ScheduleResult[]): number {
    const courseCount = schedule.length;

    if (courseCount === 3) {
      return 200;
    } else if (courseCount < 3) {
      return 100;
    } else {
      return -150;
    }
  }
}
