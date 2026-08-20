import { DayOfWeek, Course, Section, type SectionsByKind } from '../../types/types';
import {
    SelectedCourse,
    LocalCalendarEvent,
    AcademicTerm,
    EventType,
} from '../../types/schedule';
import { getComputedTerm, getDisplayTerms } from '../../utils/typeGuards';
import { getSelectedSections } from '../../utils/courseUtils';
import { TimeUtils } from '../../utils/timeUtils';

/**
 * Pure geometry/data helpers for the declarative schedule grid (no Svelte/DOM).
 *
 * Replaces ScheduleController's imperative cell-occupancy renderer
 * (`buildCellOccupancyMap` / `getCellFromMap`). The grid uses an absolute-overlay
 * model: each section/event/preview/conflict is one block positioned over the
 * full 12-hour (8 AM–8 PM) term body by percentage, so there is no per-cell
 * occupancy map and no `isFirstSlot` gating.
 */

// Single source of truth for the grid's time bounds — shared with TermGrid's
// hour labels so the block math and the grid scaffold can never drift.
const START_MIN = TimeUtils.START_HOUR * 60;   // top of the grid body (8:00 AM)
const SPAN_MIN = TimeUtils.TOTAL_HOURS * 60;   // 8 AM–8 PM = 12 hours

/** Monday–Friday, in grid-column order. */
export const WEEKDAYS: DayOfWeek[] = [
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
];

export type BlockKind = 'section' | 'preview' | 'conflict' | 'event';

export interface GridBlock {
    key: string;
    kind: BlockKind;
    label: string;
    // Inline geometry (percentages over the term body; left/width carry a 1px
    // inset so adjacent-day blocks keep the grid's inter-column gap).
    top: string;
    height: string;
    left: string;
    width: string;
    color?: string;
    courseId?: string;
    sectionNumber?: string;
    eventId?: string;
    title?: string;
    conflictInfo?: string;
}

export interface TermBlocks {
    blocks: GridBlock[];
    hasConflict: boolean;
}

function clampMinutes(min: number): number {
    return Math.max(START_MIN, Math.min(min, START_MIN + SPAN_MIN));
}

function verticalStyle(startMin: number, endMin: number): { top: string; height: string } {
    const s = clampMinutes(startMin);
    const e = clampMinutes(endMin);
    return {
        top: `${((s - START_MIN) / SPAN_MIN) * 100}%`,
        height: `${((e - s) / SPAN_MIN) * 100}%`,
    };
}

/** Full day-column width — previews and conflict overlays span the whole column. */
function fullWidth(dayIndex: number): { left: string; width: string } {
    return { left: `calc(${dayIndex * 20}% + 1px)`, width: `calc(20% - 2px)` };
}

/** A block packed into sub-column `col` of `cols` within its day column, so
 * overlapping classes/events sit side-by-side instead of hiding each other. */
function packedWidth(dayIndex: number, col: number, cols: number): { left: string; width: string } {
    const colW = 20 / cols;
    const left = dayIndex * 20 + col * colW;
    return { left: `calc(${left}% + 1px)`, width: `calc(${colW}% - 2px)` };
}

/**
 * Greedy calendar column-packing: assign each interval the lowest sub-column not
 * occupied by an overlapping interval. Returns, per input index, { col, cols }
 * where `cols` is the width of that interval's overlap cluster (so a block in a
 * 2-deep overlap renders at half width, side-by-side with its neighbor).
 */
function packColumns(items: { startMin: number; endMin: number }[]): { col: number; cols: number }[] {
    const order = items.map((_, i) => i).sort((a, b) =>
        items[a].startMin - items[b].startMin || items[a].endMin - items[b].endMin);
    const result = items.map(() => ({ col: 0, cols: 1 }));

    let cluster: number[] = [];
    let colEnds: number[] = [];
    let clusterMaxEnd = -Infinity;

    const flush = () => {
        const cols = colEnds.length || 1;
        for (const idx of cluster) result[idx].cols = cols;
        cluster = [];
        colEnds = [];
        clusterMaxEnd = -Infinity;
    };

    for (const idx of order) {
        const it = items[idx];
        if (cluster.length && it.startMin >= clusterMaxEnd) flush(); // disjoint → new cluster
        let col = colEnds.findIndex(end => end <= it.startMin);
        if (col === -1) { col = colEnds.length; colEnds.push(it.endMin); }
        else colEnds[col] = it.endMin;
        result[idx].col = col;
        cluster.push(idx);
        clusterMaxEnd = Math.max(clusterMaxEnd, it.endMin);
    }
    flush();
    return result;
}

/** All selected lecture/discussion/lab sections — input to the conflict matrix. */
export function collectSelectedSections(courses: SelectedCourse[]): Section[] {
    return courses.flatMap(sc => getSelectedSections(sc));
}

/** Which display columns (A/B/C/D) a course renders in. F→A,B and S→C,D. */
export function courseShowsInTerm(sc: SelectedCourse, term: string): boolean {
    const computedTerm = getComputedTerm(sc);
    if (!computedTerm) return false;
    return getDisplayTerms(computedTerm).includes(term);
}

/**
 * Overlay the wizard's CURRENT committed selection onto the selected list so it
 * renders as solid blocks (ported from ScheduleController.applyPreviewOverlay).
 */
export function applyPreviewOverlay(
    courses: SelectedCourse[],
    previewCourse: Course | null,
    selections: SectionsByKind | null,
): SelectedCourse[] {
    if (!previewCourse || !selections) return courses;

    const result = courses.map(sc => ({ ...sc }));
    const idx = result.findIndex(sc => sc.course.id === previewCourse.id);

    if (idx >= 0) {
        result[idx] = {
            ...result[idx],
            selectedLecture: selections.lecture ?? null,
            selectedDiscussion: selections.discussion ?? null,
            selectedLab: selections.lab ?? null,
        };
    } else {
        result.push({
            course: previewCourse,
            selectedLecture: selections.lecture ?? null,
            selectedDiscussion: selections.discussion ?? null,
            selectedLab: selections.lab ?? null,
            isRequired: false,
            lockedSections: new Set(),
        });
    }
    return result;
}

/**
 * Build the dashed hover-preview course from the hovered (not-yet-committed)
 * option (ported from ScheduleController.buildHoverCourse). `selected` is the
 * post-overlay list, so the base course already carries the committed selection.
 */
export function buildHoverCourse(
    selected: SelectedCourse[],
    previewCourse: Course | null,
    hover: SectionsByKind | null,
): SelectedCourse | null {
    if (!previewCourse || !hover) return null;

    const lecture = hover.lecture || null;
    const discussion = hover.discussion || null;
    const lab = hover.lab || null;
    if (!lecture && !discussion && !lab) return null;

    const base = selected.find(sc => sc.course.id === previewCourse.id);
    if (!base) return null;

    return { ...base, selectedLecture: lecture, selectedDiscussion: discussion, selectedLab: lab };
}

/**
 * Per-day collapsed time ranges for a section (earliest start → latest end of
 * all periods that day), matching the old occupancy map. Skips days with no
 * periods and zero-duration (async) ranges.
 */
function sectionDayRanges(section: Section): { dayIndex: number; startMin: number; endMin: number }[] {
    const ranges: { dayIndex: number; startMin: number; endMin: number }[] = [];
    WEEKDAYS.forEach((day, dayIndex) => {
        const periods = section.periods.filter(p => p.days.has(day));
        if (periods.length === 0) return;

        let startMin = Infinity;
        let endMin = -1;
        for (const p of periods) {
            startMin = Math.min(startMin, p.startTime.hours * 60 + p.startTime.minutes);
            endMin = Math.max(endMin, p.endTime.hours * 60 + p.endTime.minutes);
        }
        if (startMin >= endMin) return; // async / no real time slot
        ranges.push({ dayIndex, startMin, endMin });
    });
    return ranges;
}

/** Recurring, visible events that render in `term` (matches the shipped filter). */
function visibleTermEvents(events: LocalCalendarEvent[], term: string): LocalCalendarEvent[] {
    return events.filter(ev =>
        ev.visible &&
        ev.eventType !== EventType.ONE_TIME &&
        !!ev.terms?.includes(term as AcademicTerm)
    );
}

/**
 * Build every block for one term: solid section blocks, dashed hover preview,
 * yellow conflict overlays, and gray calendar-event blocks. Conflicts are
 * detected among the solid (committed) sections only — preview/hover blocks
 * never register conflicts, matching the old renderer.
 */
export function buildTermBlocks(
    termCourses: SelectedCourse[],
    termHoverCourse: SelectedCourse | null,
    events: LocalCalendarEvent[],
    term: string,
    conflictMap: Map<number, Set<number>>,
    colorOf: (courseId: string) => string,
): TermBlocks {
    const blocks: GridBlock[] = [];

    // Packable items (section + event blocks) get laid out side-by-side per day
    // so overlapping classes never hide each other. We set top/height now and
    // fill left/width after column-packing.
    const pack: { dayIndex: number; startMin: number; endMin: number; block: GridBlock }[] = [];

    // Solid section blocks, tracked per-day for conflict detection.
    type Solid = { crn: number; startMin: number; endMin: number; label: string };
    const solidByDay = new Map<number, Solid[]>();

    for (const sc of termCourses) {
        const color = colorOf(sc.course.id);
        const label = `${sc.course.departmentAbbr}${sc.course.number}`;
        for (const section of getSelectedSections(sc)) {
            for (const r of sectionDayRanges(section)) {
                const block: GridBlock = {
                    key: `sec-${sc.course.id}-${section.crn}-${r.dayIndex}`,
                    kind: 'section',
                    label,
                    color,
                    courseId: sc.course.id,
                    sectionNumber: section.number,
                    ...verticalStyle(r.startMin, r.endMin),
                    left: '',
                    width: '',
                };
                blocks.push(block);
                pack.push({ dayIndex: r.dayIndex, startMin: r.startMin, endMin: r.endMin, block });
                const arr = solidByDay.get(r.dayIndex) ?? [];
                arr.push({ crn: section.crn, startMin: r.startMin, endMin: r.endMin, label: `${label} ${section.number}` });
                solidByDay.set(r.dayIndex, arr);
            }
        }
    }

    // Conflict overlays: one per conflicting PAIR's overlap region, deduped by
    // region so several clusters on the same day each get their own highlight
    // (a single merged region would wrongly collapse separate clashes).
    let hasConflict = false;
    for (const [dayIndex, daySolids] of solidByDay) {
        const regions = new Map<string, { start: number; end: number; labels: Set<string> }>();
        for (let i = 0; i < daySolids.length; i++) {
            for (let j = i + 1; j < daySolids.length; j++) {
                const a = daySolids[i];
                const b = daySolids[j];
                if (!conflictMap.get(a.crn)?.has(b.crn)) continue;
                hasConflict = true;
                const start = Math.max(a.startMin, b.startMin);
                const end = Math.min(a.endMin, b.endMin);
                if (start >= end) continue; // conflict on another day, not this one's time
                const key = `${start}-${end}`;
                let region = regions.get(key);
                if (!region) {
                    region = { start, end, labels: new Set() };
                    regions.set(key, region);
                }
                region.labels.add(a.label);
                region.labels.add(b.label);
            }
        }
        for (const [key, region] of regions) {
            // Conflict overlays span the full day column (over both side-by-side
            // blocks) to mark the clashing time band.
            blocks.push({
                key: `conflict-${term}-${dayIndex}-${key}`,
                kind: 'conflict',
                label: '',
                conflictInfo: [...region.labels].join(', '),
                ...verticalStyle(region.start, region.end),
                ...fullWidth(dayIndex),
            });
        }
    }

    // Gray calendar-event blocks (packed side-by-side with classes).
    for (const ev of visibleTermEvents(events, term)) {
        const startMin = ev.startTime.hours * 60 + ev.startTime.minutes;
        const endMin = ev.endTime.hours * 60 + ev.endTime.minutes;
        if (startMin >= endMin) continue;
        const title = ev.title || 'Untitled Event';
        WEEKDAYS.forEach((day, dayIndex) => {
            if (!ev.days?.includes(day)) return;
            const block: GridBlock = {
                key: `ev-${ev.id}-${dayIndex}`,
                kind: 'event',
                label: title,
                title,
                eventId: ev.id,
                ...verticalStyle(startMin, endMin),
                left: '',
                width: '',
            };
            blocks.push(block);
            pack.push({ dayIndex, startMin, endMin, block });
        });
    }

    // Column-pack the section + event blocks per day, so overlapping items sit
    // side-by-side (each at 1/N width) instead of stacking and hiding each other.
    const packByDay = new Map<number, number[]>();
    pack.forEach((p, i) => {
        const arr = packByDay.get(p.dayIndex) ?? [];
        arr.push(i);
        packByDay.set(p.dayIndex, arr);
    });
    for (const [dayIndex, idxs] of packByDay) {
        const layout = packColumns(idxs.map(i => ({ startMin: pack[i].startMin, endMin: pack[i].endMin })));
        idxs.forEach((i, k) => {
            const { left, width } = packedWidth(dayIndex, layout[k].col, layout[k].cols);
            pack[i].block.left = left;
            pack[i].block.width = width;
        });
    }

    // Dashed hover-preview blocks (full width, drawn on top; not packed).
    if (termHoverCourse) {
        const color = colorOf(termHoverCourse.course.id);
        const label = `${termHoverCourse.course.departmentAbbr}${termHoverCourse.course.number}`;
        for (const section of getSelectedSections(termHoverCourse)) {
            for (const r of sectionDayRanges(section)) {
                blocks.push({
                    key: `prev-${termHoverCourse.course.id}-${section.crn}-${r.dayIndex}`,
                    kind: 'preview',
                    label,
                    color,
                    courseId: termHoverCourse.course.id,
                    sectionNumber: section.number,
                    ...verticalStyle(r.startMin, r.endMin),
                    ...fullWidth(r.dayIndex),
                });
            }
        }
    }

    return { blocks, hasConflict };
}
