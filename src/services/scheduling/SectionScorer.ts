import type { Section, SimpleTime } from '../../types/types';

export class SectionScorer {
  scoreSection(section: Section, wakeUpTime: SimpleTime): number {
    if (!section.periods || section.periods.length === 0) {
      return 1000;
    }

    const wakeUpMinutes = wakeUpTime.hours * 60 + wakeUpTime.minutes;
    let totalScore = 0;

    for (const period of section.periods) {
      if (period.isAsync) {
        totalScore += 1000;
        continue;
      }

      const startMinutes = period.startTime.hours * 60 + period.startTime.minutes;

      if (startMinutes >= wakeUpMinutes) {
        totalScore += 1000;
      } else {
        const minutesBefore = wakeUpMinutes - startMinutes;
        totalScore += Math.max(0, 1000 - minutesBefore);
      }
    }

    return totalScore / section.periods.length;
  }

  scoreCombination(
    lecture: Section | null,
    discussion: Section | null,
    lab: Section | null,
    wakeUpTime: SimpleTime
  ): number {
    const sections: Section[] = [lecture, discussion, lab].filter((s): s is Section => s !== null);

    if (sections.length === 0) return 1000;

    let totalScore = 0;
    for (const section of sections) {
      totalScore += this.scoreSection(section, wakeUpTime);
    }

    return totalScore / sections.length;
  }
}
