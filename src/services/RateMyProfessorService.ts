/**
 * RateMyProfessorService - Service for loading and querying Rate My Professor data
 *
 * Provides methods to:
 * - Load professor ratings from JSON file
 * - Search for professors by name
 * - Get rating information for display
 */

interface Professor {
    id: string;
    firstName: string;
    lastName: string;
    department: string;
    avgRating: number;
    avgDifficulty: number;
    numRatings: number;
    wouldTakeAgainPercent: number | null;
}

interface RateMyProfessorData {
    lastUpdated: string;
    school: {
        id: string;
        name: string;
        city: string;
        state: string;
    };
    professors: Professor[];
    totalProfessors: number;
}

export class RateMyProfessorService {
    private data: RateMyProfessorData | null = null;
    private professorMap: Map<string, Professor> = new Map();
    private loading: boolean = false;
    private loadError: Error | null = null;

    /**
     * Load Rate My Professor data from JSON file
     */
    async loadData(): Promise<void> {
        console.log('[RMP Service] loadData() called, data state:', this.data ? 'already loaded' : 'not loaded');

        if (this.data) {
            // Already loaded
            return;
        }

        if (this.loading) {
            console.log('[RMP Service] Already loading, waiting...');
            // Wait for existing load to complete
            while (this.loading) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }

        this.loading = true;

        try {
            console.log('[RMP Service] Fetching from: ./rateMyProfessor.json');
            const response = await fetch('./rateMyProfessor.json');
            if (!response.ok) {
                throw new Error(`Failed to load Rate My Professor data: ${response.status}`);
            }

            console.log('[RMP Service] Fetch successful, parsing JSON...');
            this.data = await response.json();

            // Build professor map for quick lookups
            // Normalize names for better matching (lowercase, trim)
            if (this.data && this.data.professors) {
                for (const professor of this.data.professors) {
                    const fullName = this.normalizeName(`${professor.firstName} ${professor.lastName}`);
                    const lastName = this.normalizeName(professor.lastName);

                    // Store by full name and last name for flexible matching
                    this.professorMap.set(fullName, professor);

                    // Also store by last name (may have collisions, but will get most recent)
                    if (!this.professorMap.has(lastName)) {
                        this.professorMap.set(lastName, professor);
                    }
                }
            }

            console.log(`[RMP Service] Loaded ${this.data?.totalProfessors || 0} professors`);
            console.log(`[RMP Service] Built professor map with ${this.professorMap.size} entries`);
            console.log(`[RMP Service] Sample map entries:`, Array.from(this.professorMap.keys()).slice(0, 5));
        } catch (error) {
            this.loadError = error as Error;
            console.error('[RMP Service] Failed to load data:', error);
        } finally {
            this.loading = false;
        }
    }

    /**
     * Normalize a name for matching (lowercase, trim, remove extra spaces)
     */
    private normalizeName(name: string): string {
        return name.toLowerCase().trim().replace(/\s+/g, ' ');
    }

    /**
     * Find a professor by name
     * Tries various matching strategies:
     * 1. Full name match (First Last)
     * 2. Last name match
     * 3. Partial last name match (for names like "O'Brien")
     */
    findProfessor(professorName: string): Professor | null {
        console.log('[RMP Service] findProfessor() called with:', professorName);
        console.log('[RMP Service] Data loaded:', !!this.data, 'Map size:', this.professorMap.size);

        if (!this.data || !professorName) {
            console.log('[RMP Service] Early return - no data or no professor name');
            return null;
        }

        const normalized = this.normalizeName(professorName);
        console.log('[RMP Service] Normalized name:', normalized);

        // Try exact full name match
        if (this.professorMap.has(normalized)) {
            console.log('[RMP Service] ✓ Found exact full name match');
            return this.professorMap.get(normalized) || null;
        }
        console.log('[RMP Service] No exact match, trying last name...');

        // Try last name match (handle "Last, First" or "First Last" formats)
        const nameParts = normalized.split(/[,\s]+/).filter(p => p.length > 0);
        if (nameParts.length > 0) {
            const lastName = nameParts[nameParts.length - 1];
            console.log('[RMP Service] Trying last name part:', lastName);
            if (this.professorMap.has(lastName)) {
                console.log('[RMP Service] ✓ Found last name match');
                return this.professorMap.get(lastName) || null;
            }

            // Try first part (in case of "Last, First" format)
            const firstPart = nameParts[0];
            console.log('[RMP Service] Trying first name part:', firstPart);
            if (this.professorMap.has(firstPart)) {
                console.log('[RMP Service] ✓ Found first part match');
                return this.professorMap.get(firstPart) || null;
            }
        }

        console.log('[RMP Service] Trying fuzzy matching...');
        // Try fuzzy matching on last name
        for (const [key, professor] of this.professorMap.entries()) {
            if (key.includes(normalized) || normalized.includes(key)) {
                // Check if this is actually the last name match
                const profLastName = this.normalizeName(professor.lastName);
                if (profLastName.includes(normalized) || normalized.includes(profLastName)) {
                    console.log('[RMP Service] ✓ Found fuzzy match:', key);
                    return professor;
                }
            }
        }

        console.log('[RMP Service] ✗ No match found for:', professorName);
        return null;
    }

    /**
     * Get formatted rating display for a professor
     * Returns null if professor not found or has no ratings
     */
    getRatingDisplay(professorName: string): {
        rating: string;
        difficulty: string;
        numRatings: number;
        wouldTakeAgain: string | null;
        hasData: boolean;
    } | null {
        console.log('[RMP Service] getRatingDisplay() called for:', professorName);
        const professor = this.findProfessor(professorName);

        if (!professor) {
            console.log('[RMP Service] getRatingDisplay() - professor not found');
            return null;
        }

        if (professor.numRatings === 0) {
            console.log('[RMP Service] getRatingDisplay() - professor has 0 ratings');
            return null;
        }

        console.log('[RMP Service] getRatingDisplay() - returning data for:', `${professor.firstName} ${professor.lastName}`,
                    'Rating:', professor.avgRating);

        return {
            rating: professor.avgRating.toFixed(1),
            difficulty: professor.avgDifficulty.toFixed(1),
            numRatings: professor.numRatings,
            wouldTakeAgain: professor.wouldTakeAgainPercent !== null
                ? `${Math.round(professor.wouldTakeAgainPercent)}%`
                : null,
            hasData: true
        };
    }

    /**
     * Get all professors (for debugging/admin purposes)
     */
    getAllProfessors(): Professor[] {
        return this.data?.professors || [];
    }

    /**
     * Check if data is loaded
     */
    isLoaded(): boolean {
        return this.data !== null;
    }

    /**
     * Get load error if any
     */
    getLoadError(): Error | null {
        return this.loadError;
    }

    /**
     * Get last updated timestamp
     */
    getLastUpdated(): Date | null {
        if (!this.data) return null;
        return new Date(this.data.lastUpdated);
    }
}

// Export singleton instance
export const rateMyProfessorService = new RateMyProfessorService();
