import type { Requirement } from '../../types/degree';

/**
 * Fraction complete for a requirement, for progress bars (null when there's no
 * numeric target). Kept separate from academicProgressParser so the UISvelte
 * components can import it without pulling the parser (and fflate) into the main
 * bundle — the parser is loaded lazily only when a file is actually imported.
 */
export function completionFraction(req: Requirement): number | null {
    if (req.status === 'satisfied') return 1;
    if (req.creditsRequired && req.creditsRequired > 0) {
        const earned = req.appliedCourses.filter(c => !c.isInProgress).reduce((s, c) => s + c.credits, 0);
        return Math.min(1, earned / req.creditsRequired);
    }
    return null;
}
