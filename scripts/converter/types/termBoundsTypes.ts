export interface TermBoundsOutput {
  generated: string;
  years: Record<number, YearTermBounds>;
}

export interface YearTermBounds {
  A: TermBoundInfo;
  B: TermBoundInfo;
  C: TermBoundInfo;
  D: TermBoundInfo;
}

export interface TermBoundInfo {
  startDate: string; // ISO date: "2025-08-21"
  endDate: string; // ISO date: "2025-10-10"
  offeringPeriod: string;
  sampleSize: number;
}
