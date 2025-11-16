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
  private static readonly PERFECT_GAP_MINUTES = 10;
  private static readonly PERFECT_GAP_SCORE = 50;
  private static readonly EARLY_MORNING_HOUR = 8;
  private static readonly EARLY_MORNING_MINUTE = 0;
  private static readonly EARLY_MORNING_PENALTY = -100;
  private static readonly MAX_PROFESSOR_RATING = 5.0;
  private static readonly PROFESSOR_RATING_MULTIPLIER = 200;
  private static readonly DEFAULT_PROFESSOR_SCORE = 100;
  private static readonly OPTIMAL_COURSES_PER_TERM = 3;
  private static readonly OPTIMAL_TERM_SCORE = 200;
  private static readonly UNDER_OPTIMAL_SCORE = 100;
  private static readonly OVER_OPTIMAL_PENALTY = -150;
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

        if (gap === ScheduleScorer.PERFECT_GAP_MINUTES) {
          perfectGapsCount++;
        }
      }
    }

    return perfectGapsCount * ScheduleScorer.PERFECT_GAP_SCORE;
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
        if (period.startTime.hours === ScheduleScorer.EARLY_MORNING_HOUR && period.startTime.minutes === ScheduleScorer.EARLY_MORNING_MINUTE) {
          earlyMorningCount++;
        }
      }
    }

    return earlyMorningCount * ScheduleScorer.EARLY_MORNING_PENALTY;
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

    if (ratedProfessors === 0) return ScheduleScorer.DEFAULT_PROFESSOR_SCORE;

    const avgRating = totalRating / ratedProfessors;
    return (avgRating / ScheduleScorer.MAX_PROFESSOR_RATING) * ScheduleScorer.PROFESSOR_RATING_MULTIPLIER;
  }

  private calculateClassesPerTermScore(schedule: ScheduleResult[]): number {
    const courseCount = schedule.length;

    if (courseCount === ScheduleScorer.OPTIMAL_COURSES_PER_TERM) {
      return ScheduleScorer.OPTIMAL_TERM_SCORE;
    } else if (courseCount < ScheduleScorer.OPTIMAL_COURSES_PER_TERM) {
      return ScheduleScorer.UNDER_OPTIMAL_SCORE;
    } else {
      return ScheduleScorer.OVER_OPTIMAL_PENALTY;
    }
  }
}
