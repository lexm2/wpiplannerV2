import type { EffectiveProgress } from '../../services/degree/requirementProgress';

/** A bucket's status as its card's pill names it. */
export function statusLabel(progress: EffectiveProgress): string {
  return progress.status === 'satisfied'
    ? 'Satisfied'
    : progress.status === 'in_progress'
      ? 'In progress'
      : 'Not satisfied';
}

/** What a bucket still needs - "12 credits left" - or null once satisfied. */
export function remainingLabel(progress: EffectiveProgress): string | null {
  if (progress.status === 'satisfied') return null;
  if (progress.creditsRemaining !== null)
    return `${progress.creditsRemaining} credits left`;
  if (progress.coursesRemaining !== null)
    return `${progress.coursesRemaining} course${progress.coursesRemaining === 1 ? '' : 's'} left`;
  return 'See requirement';
}
