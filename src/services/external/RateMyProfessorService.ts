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

  async loadData(): Promise<void> {
    if (this.data) return;

    if (this.loading) {
      while (this.loading) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.loading = true;

    try {
      const response = await fetch('./rateMyProfessor.json');
      if (!response.ok) {
        throw new Error(
          `Failed to load Rate My Professor data: ${response.status}`,
        );
      }

      this.data = await response.json();

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
    } catch (error) {
      this.loadError = error as Error;
    } finally {
      this.loading = false;
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
   * Find a professor by name using conservative matching:
   * 1. Exact full name match
   * 2. Last name lookup - if unique, return directly
   * 3. If multiple share a last name, disambiguate via first name fuzzy matching
   */
  findProfessor(professorName: string): Professor | null {
    if (!this.data || !professorName) return null;

    const normalized = this.normalizeName(professorName);

    if (this.professorsByFullName.has(normalized)) {
      return this.professorsByFullName.get(normalized) || null;
    }

    const lastName = this.extractLastName(professorName);
    const candidates = this.professorsByLastName.get(lastName);

    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const queryFirstName = this.extractFirstName(professorName);
    if (!queryFirstName) return candidates[0];

    const scored = candidates.map(prof => ({
      professor: prof,
      score: this.calculateFirstNameSimilarity(
        queryFirstName,
        this.normalizeName(prof.firstName),
      ),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored[0].professor;
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

  getAllProfessors(): Professor[] {
    return this.data?.professors || [];
  }

  isLoaded(): boolean {
    return this.data !== null;
  }

  getLoadError(): Error | null {
    return this.loadError;
  }

  getLastUpdated(): Date | null {
    if (!this.data) return null;
    return new Date(this.data.lastUpdated);
  }
}

export const rateMyProfessorService = new RateMyProfessorService();
