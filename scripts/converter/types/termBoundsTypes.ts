export interface TermBoundsOutput {
    academicYear: string;
    generated: string;
    terms: {
        A: TermBoundInfo;
        B: TermBoundInfo;
        C: TermBoundInfo;
        D: TermBoundInfo;
    };
}

export interface TermBoundInfo {
    startDate: string;  // ISO date: "2025-08-21"
    endDate: string;    // ISO date: "2025-10-10"
    offeringPeriod: string;
    sampleSize: number;
}
