import { Section, type SectionsByKind } from '../../types/types';
import { sectionsOf } from '../../utils/courseUtils';

export class SectionScorer {
  scoreSection(
    section: Section,
    wakeUpTime: { hours: number; minutes: number },
  ): number {
    const syncPeriods = section.periods.filter(p => !p.isAsync);

    if (syncPeriods.length === 0) {
      return 1000;
    }

    const scores = syncPeriods.map(period => {
      const startMinutes =
        period.startTime.hours * 60 + period.startTime.minutes;
      const wakeMinutes = wakeUpTime.hours * 60 + wakeUpTime.minutes;

      if (startMinutes >= wakeMinutes) {
        return 1000;
      }

      const hoursEarly = (wakeMinutes - startMinutes) / 60;
      return 1000 - 60 * hoursEarly;
    });

    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  scoreCombination(
    selected: SectionsByKind,
    wakeUpTime: { hours: number; minutes: number },
  ): number {
    const sections = sectionsOf(selected);

    if (sections.length === 0) {
      return 1000;
    }

    const scores = sections.map(s => this.scoreSection(s, wakeUpTime));
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }
}
