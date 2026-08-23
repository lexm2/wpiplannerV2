import { LectureGroup } from '../types/outputTypes.js';
import { CategorizedSections } from './sectionTransformer.js';
import { filterCompatibleSections } from '../utils/compatibilityChecker.js';

export function buildLectureGroups(
  categorized: CategorizedSections,
): LectureGroup[] {
  const lectureGroups: LectureGroup[] = [];

  for (const lecture of categorized.lectures) {
    // Handle GPS sections without cluster or Interest Lists
    // These cannot be combined with other sections
    if ((lecture.isGps && !lecture.note) || lecture.isInterestList) {
      lectureGroups.push({
        section: lecture,
        compatibleDiscussions: [],
        compatibleLabs: [],
      });
      continue;
    }

    const compatibleDiscussions = filterCompatibleSections(
      lecture,
      categorized.discussions,
    );
    const compatibleLabs = filterCompatibleSections(lecture, categorized.labs);

    lectureGroups.push({
      section: lecture,
      compatibleDiscussions,
      compatibleLabs,
    });
  }

  return lectureGroups;
}
