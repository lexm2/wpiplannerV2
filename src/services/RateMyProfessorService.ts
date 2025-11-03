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
    legacyId: number;
    firstName: string;
    lastName: string;
    department: string;
    avgRating: number;
    avgDifficulty: number;
    numRatings: number;
    wouldTakeAgainPercent: number | null;
    profileUrl: string;
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
    private professorsByFullName: Map<string, Professor> = new Map();
    private professorsByLastName: Map<string, Professor[]> = new Map();
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

            // Build professor maps for quick lookups
            // Normalize names for better matching (lowercase, trim)
            if (this.data && this.data.professors) {
                for (const professor of this.data.professors) {
                    const fullName = this.normalizeName(`${professor.firstName} ${professor.lastName}`);
                    const lastName = this.normalizeName(professor.lastName);

                    // Store by full name (unique)
                    this.professorsByFullName.set(fullName, professor);

                    // Store by last name (may have multiple professors per last name)
                    if (!this.professorsByLastName.has(lastName)) {
                        this.professorsByLastName.set(lastName, []);
                    }
                    this.professorsByLastName.get(lastName)!.push(professor);
                }
            }

            console.log(`[RMP Service] Loaded ${this.data?.totalProfessors || 0} professors`);
            console.log(`[RMP Service] Built full name map with ${this.professorsByFullName.size} entries`);
            console.log(`[RMP Service] Built last name map with ${this.professorsByLastName.size} unique last names`);
            console.log(`[RMP Service] Sample full name entries:`, Array.from(this.professorsByFullName.keys()).slice(0, 5));
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
     * Extract last name from a professor name
     * Handles "First Last" and "Last, First" formats
     */
    private extractLastName(professorName: string): string {
        const normalized = this.normalizeName(professorName);
        const nameParts = normalized.split(/[,\s]+/).filter(p => p.length > 0);

        // Handle "Last, First" format
        if (normalized.includes(',')) {
            return nameParts[0] || '';
        }

        // Handle "First Last" format (most common)
        if (nameParts.length > 0) {
            return nameParts[nameParts.length - 1];
        }

        return normalized;
    }

    /**
     * Extract first name from a professor name
     * Handles "First Last" and "Last, First" formats
     */
    private extractFirstName(professorName: string): string {
        const normalized = this.normalizeName(professorName);
        const nameParts = normalized.split(/[,\s]+/).filter(p => p.length > 0);

        // Handle "Last, First" format
        if (normalized.includes(',')) {
            return nameParts.slice(1).join(' ');
        }

        // Handle "First Last" format - everything except last part
        if (nameParts.length > 1) {
            return nameParts.slice(0, -1).join(' ');
        }

        return '';
    }

    /**
     * Calculate similarity between two first names for disambiguation
     * Returns a score from 0-100
     */
    private calculateFirstNameSimilarity(query: string, candidate: string): number {
        // Exact match
        if (query === candidate) return 100;

        // Starts with (e.g., "moh" matches "mohammed")
        if (candidate.startsWith(query)) return 80;
        if (query.startsWith(candidate)) return 70;

        // Contains
        if (candidate.includes(query)) return 50;
        if (query.includes(candidate)) return 40;

        // Levenshtein distance for similarity
        const distance = this.levenshteinDistance(query, candidate);
        const maxLen = Math.max(query.length, candidate.length);
        const similarity = 1 - (distance / maxLen);

        return similarity * 30; // Scale to 0-30 points
    }

    /**
     * Calculate Levenshtein distance between two strings
     * Measures how many single-character edits are needed to change one string into another
     */
    private levenshteinDistance(a: string, b: string): number {
        const matrix: number[][] = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    /**
     * Find a professor by name using conservative matching strategy
     *
     * Strategy:
     * 1. Try exact full name match (fast path)
     * 2. Extract last name and lookup candidates
     * 3a. If ONLY ONE professor with that last name → return it (no ambiguity)
     * 3b. If MULTIPLE professors with same last name → use fuzzy matching on first name to disambiguate
     */
    findProfessor(professorName: string): Professor | null {
        console.log('[RMP Service] findProfessor() called with:', professorName);
        console.log('[RMP Service] Data loaded:', !!this.data, 'Maps ready:', this.professorsByFullName.size, 'full names,', this.professorsByLastName.size, 'last names');

        if (!this.data || !professorName) {
            console.log('[RMP Service] Early return - no data or no professor name');
            return null;
        }

        const normalized = this.normalizeName(professorName);
        console.log('[RMP Service] Normalized name:', normalized);

        // Step 1: Try exact full name match (fast path)
        if (this.professorsByFullName.has(normalized)) {
            console.log('[RMP Service] ✓ Found exact full name match');
            return this.professorsByFullName.get(normalized) || null;
        }
        console.log('[RMP Service] No exact match, extracting last name...');

        // Step 2: Extract last name and lookup candidates
        const lastName = this.extractLastName(professorName);
        console.log('[RMP Service] Extracted last name:', lastName);

        const candidates = this.professorsByLastName.get(lastName);

        if (!candidates || candidates.length === 0) {
            console.log('[RMP Service] ✗ No match found for last name:', lastName);
            return null;
        }

        // Step 3a: If ONLY ONE professor with this last name → return it
        if (candidates.length === 1) {
            const professor = candidates[0];
            console.log('[RMP Service] ✓ Found unique last name match:', `${professor.firstName} ${professor.lastName}`);
            return professor;
        }

        // Step 3b: MULTIPLE professors with same last name → disambiguate using first name
        console.log(`[RMP Service] Multiple candidates (${candidates.length}) for last name '${lastName}', disambiguating...`);

        const queryFirstName = this.extractFirstName(professorName);
        console.log('[RMP Service] Extracted first name for disambiguation:', queryFirstName || '(none)');

        if (!queryFirstName) {
            // No first name to disambiguate with, return first candidate
            const professor = candidates[0];
            console.log('[RMP Service] ⚠ No first name provided, returning first candidate:', `${professor.firstName} ${professor.lastName}`);
            return professor;
        }

        // Use fuzzy matching on first name to pick best match
        const scored = candidates.map(prof => {
            const profFirstName = this.normalizeName(prof.firstName);
            const score = this.calculateFirstNameSimilarity(queryFirstName, profFirstName);
            return {
                professor: prof,
                score: score
            };
        });

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        // Log all candidates with scores for debugging
        console.log('[RMP Service] Candidate scores:');
        scored.forEach((item, idx) => {
            console.log(`  ${idx + 1}. ${item.professor.firstName} ${item.professor.lastName}: ${item.score.toFixed(1)} pts`);
        });

        const bestMatch = scored[0].professor;
        console.log('[RMP Service] ✓ Best match via first name fuzzy:',
                    `${bestMatch.firstName} ${bestMatch.lastName} (score: ${scored[0].score.toFixed(1)})`);

        return bestMatch;
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
     * Get RateMyProfessors URL for a professor
     * Returns null if professor not found
     */
    getProfessorRMPUrl(professorName: string): string | null {
        const professor = this.findProfessor(professorName);

        if (!professor) {
            return null;
        }

        return professor.profileUrl;
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
