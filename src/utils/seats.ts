/**
 * The capacity Workday gives a section with no enrollment limit: varsity
 * and club teams (WPE 2001, WPE 1211 S06) and music ensembles (MU 2401).
 * Their "999 seats" are not seats, so no total counts them.
 */
const UNCAPPED_SEATS = 999;

/** A section without a real seat cap; see UNCAPPED_SEATS. */
export const isUncapped = (s: { seats: number }) => s.seats >= UNCAPPED_SEATS;
