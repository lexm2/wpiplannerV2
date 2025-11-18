import type { SelectedCourse } from '../types/schedule';

export function hasConflict(local: SelectedCourse, cloud: SelectedCourse): boolean {
    if (local.selectedLecture?.crn !== cloud.selectedLecture?.crn) return true;
    if (local.selectedDiscussion?.crn !== cloud.selectedDiscussion?.crn) return true;
    if (local.selectedLab?.crn !== cloud.selectedLab?.crn) return true;
    if (local.selectedSection?.crn !== cloud.selectedSection?.crn) return true;
    if (local.isRequired !== cloud.isRequired) return true;

    if (!setsEqual(local.lockedSections, cloud.lockedSections)) return true;

    return false;
}

export function setsEqual<T>(set1: Set<T>, set2: Set<T>): boolean {
    if (set1.size !== set2.size) return false;
    for (const item of set1) {
        if (!set2.has(item)) return false;
    }
    return true;
}

export function formatSectionInfo(course: SelectedCourse): string {
    const parts: string[] = [];

    if (course.selectedLecture) {
        parts.push(`Lecture: ${course.selectedLecture.sectionNumber} (CRN: ${course.selectedLecture.crn})`);
    }
    if (course.selectedDiscussion) {
        parts.push(`Discussion: ${course.selectedDiscussion.sectionNumber} (CRN: ${course.selectedDiscussion.crn})`);
    }
    if (course.selectedLab) {
        parts.push(`Lab: ${course.selectedLab.sectionNumber} (CRN: ${course.selectedLab.crn})`);
    }
    if (course.selectedSection) {
        parts.push(`Section: ${course.selectedSection.sectionNumber} (CRN: ${course.selectedSection.crn})`);
    }

    if (parts.length === 0) {
        parts.push('No sections selected');
    }

    if (course.isRequired) {
        parts.push('Required');
    }

    return parts.join(', ');
}
