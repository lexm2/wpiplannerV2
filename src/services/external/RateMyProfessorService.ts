import {
  RateMyProfessorDataSchema,
  type Professor,
  type RateMyProfessorData,
} from '../../types/rateMyProfessor';

// calculateFirstNameSimilarity's floor for a fuzzy first-name match: any
// prefix or containment passes, and a plain edit-distance match needs about
// two thirds of the letters right ("Jon" ~ "John", not "Jane" ~ "John").
const MIN_FIRST_NAME_SCORE = 20;

export class RateMyProfessorService {
  private data: RateMyProfessorData | null = null;
  private professorsByFullName: Map<string, Professor> = new Map();
  private professorsByLastName: Map<string, Professor[]> = new Map();
  // findProfessor runs for every period on every filter pass, over a few
  // hundred distinct names, so results are memoized until the data changes.
  private matchCache: Map<string, Professor | null> = new Map();
  private loadPromise: Promise<void> | null = null;

  loadData(): Promise<void> {
    if (this.data) return Promise.resolve();
    // Concurrent callers share the one in-flight load.
    this.loadPromise ??= this.fetchData().finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  private async fetchData(): Promise<void> {
    try {
      const response = await fetch('./rateMyProfessor.json');
      if (!response.ok) {
        throw new Error(
          `Failed to load Rate My Professor data: ${response.status}`,
        );
      }

      // Parsed, not asserted: a scheduled job regenerates this file, so a
      // shape change arrives at runtime with no rebuild.
      this.data = RateMyProfessorDataSchema.parse(await response.json());
      this.matchCache.clear();

      if (this.data && this.data.professors) {
        for (const professor of this.data.professors) {
          const fullName = this.normalizeName(
            `${professor.firstName} ${professor.lastName}`,
          );
          const lastName = this.normalizeName(professor.lastName);

          this.professorsByFullName.set(fullName, professor);

          if (!this.professorsByLastName.has(lastName)) {
            this.professorsByLastName.set(lastName, []);
          }
          this.professorsByLastName.get(lastName)!.push(professor);
        }
      }
    } catch {
      // Ratings are optional: on a failed load every lookup returns null and
      // the next loadData() call tries again.
    }
  }

  private normalizeName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private extractLastName(professorName: string): string {
    const normalized = this.normalizeName(professorName);
    const nameParts = normalized.split(/[,\s]+/).filter(p => p.length > 0);

    if (normalized.includes(',')) {
      return nameParts[0] || '';
    }

    if (nameParts.length > 0) {
      return nameParts[nameParts.length - 1];
    }

    return normalized;
  }

  private extractFirstName(professorName: string): string {
    const normalized = this.normalizeName(professorName);
    const nameParts = normalized.split(/[,\s]+/).filter(p => p.length > 0);

    if (normalized.includes(',')) {
      return nameParts.slice(1).join(' ');
    }

    if (nameParts.length > 1) {
      return nameParts.slice(0, -1).join(' ');
    }

    return '';
  }

  private calculateFirstNameSimilarity(
    query: string,
    candidate: string,
  ): number {
    if (query === candidate) return 100;
    if (candidate.startsWith(query)) return 80;
    if (query.startsWith(candidate)) return 70;
    if (candidate.includes(query)) return 50;
    if (query.includes(candidate)) return 40;

    const distance = this.levenshteinDistance(query, candidate);
    const maxLen = Math.max(query.length, candidate.length);
    const similarity = 1 - distance / maxLen;

    return similarity * 30;
  }

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
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Whether two first names could be the same person: either is missing, an
   * initial matching the other's first letter, or they are close enough
   * (prefix, containment, or a near spelling). "John" never matches "Alice".
   */
  private firstNamesCompatible(query: string, candidate: string): boolean {
    const q = query.split(' ')[0].replace(/[^a-z]/g, '');
    const c = candidate.split(' ')[0].replace(/[^a-z]/g, '');
    if (!q || !c) return true;
    if (q.length === 1 || c.length === 1) return q[0] === c[0];
    return this.calculateFirstNameSimilarity(q, c) >= MIN_FIRST_NAME_SCORE;
  }

  /**
   * Find a professor by name using conservative matching:
   * 1. Exact full name match
   * 2. Last name lookup, keeping only candidates whose first name fits
   * 3. If several fit, disambiguate via first name fuzzy matching
   *
   * Co-taught sections list several names ("Amy Curran; Laura Susanin");
   * the first instructor that matches is used.
   */
  findProfessor(professorName: string): Professor | null {
    if (!this.data || !professorName) return null;

    const cached = this.matchCache.get(professorName);
    if (cached !== undefined) return cached;

    let match: Professor | null = null;
    for (const name of professorName.split(/\s*;\s*/)) {
      if (!name) continue;
      match = this.findSingleProfessor(name);
      if (match) break;
    }

    this.matchCache.set(professorName, match);
    return match;
  }

  private findSingleProfessor(professorName: string): Professor | null {
    const normalized = this.normalizeName(professorName);

    const exact = this.professorsByFullName.get(normalized);
    if (exact) return exact;

    const lastName = this.extractLastName(professorName);
    const candidates = this.professorsByLastName.get(lastName);
    if (!candidates || candidates.length === 0) return null;

    const queryFirstName = this.extractFirstName(professorName);
    if (!queryFirstName) return candidates[0];

    let best: Professor | null = null;
    let bestScore = -1;
    for (const prof of candidates) {
      const firstName = this.normalizeName(prof.firstName);
      if (!this.firstNamesCompatible(queryFirstName, firstName)) continue;
      const score = this.calculateFirstNameSimilarity(
        queryFirstName,
        firstName,
      );
      if (score > bestScore) {
        best = prof;
        bestScore = score;
      }
    }
    return best;
  }

  getRatingDisplay(professorName: string): {
    rating: string;
    difficulty: string;
    numRatings: number;
    wouldTakeAgain: string | null;
    hasData: boolean;
  } | null {
    const professor = this.findProfessor(professorName);

    if (!professor || professor.numRatings === 0) return null;

    return {
      rating: professor.avgRating.toFixed(1),
      difficulty: professor.avgDifficulty.toFixed(1),
      numRatings: professor.numRatings,
      wouldTakeAgain:
        professor.wouldTakeAgainPercent !== null
          ? `${Math.round(professor.wouldTakeAgainPercent)}%`
          : null,
      hasData: true,
    };
  }

  getProfessorRMPUrl(professorName: string): string | null {
    const professor = this.findProfessor(professorName);
    if (!professor) return null;
    return professor.profileUrl;
  }

  isLoaded(): boolean {
    return this.data !== null;
  }
}

export const rateMyProfessorService = new RateMyProfessorService();
