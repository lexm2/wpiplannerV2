/**
 * The course API's in-memory catalog: the parsed course data, the ratings and
 * the term bounds, read from disk and swapped for a fresh copy when the
 * refresh job rewrites the course data file.
 */
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';
import type { Course, Department, Section } from '../types/types';
import { parseCatalog } from '../services/data/parseCatalog';
import { RateMyProfessorService } from '../services/external/RateMyProfessorService';
import { TermBoundsService } from '../utils/termBounds';
import type { FilterableSection } from '../types/filterableUnit';
import { SectionFilterPipeline } from '../core/filtering/SectionFilterPipeline';
import { logger } from '../utils/logger';
import { prepareSearch, resetSearchVocabulary } from '../utils/searchUtils';

const CATALOG_FILE = 'course-data-constructed.json';
const TERM_BOUNDS_FILE = 'term-bounds.json';
const RMP_FILE = 'rateMyProfessor.json';
const LAST_UPDATED_FILE = 'last-updated.json';

const LastUpdatedSchema = z.object({ timestamp: z.string() });

/** One CRN's section and every course that lists it (cross-listings share CRNs). */
export interface CrnEntry {
  section: Section;
  courses: Course[];
  /** The section as the filter pipeline sees it, under its first course. */
  filterable: FilterableSection;
}

export interface Catalog {
  departments: Department[];
  courses: Course[];
  /** From last-updated.json, the time the refresh job last saw new data. */
  lastUpdated: string | null;
  years: number[];
  sectionsByCrn: Map<number, CrnEntry>;
  rmp: RateMyProfessorService;
  termBounds: TermBoundsService;
  /** The clock every date-aware answer reads; injectable for tests. */
  now: () => Date;
}

export interface CatalogSourceOptions {
  /** Checked first for every file; the refresh job's output on the server. */
  dataDir?: string;
  /** The fallback for each file, normally the repo's public/. */
  publicDir: string;
  /** How long a loaded catalog is trusted before its mtime is checked again. */
  checkIntervalMs?: number;
  /** Today, for the current year and term; tests pin it. */
  now?: () => Date;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function indexSections(courses: Course[]): Map<number, CrnEntry> {
  const index = new Map<number, CrnEntry>();
  // A lab compatible with several lectures appears once per lecture group.
  for (const fs of new SectionFilterPipeline().flattenCoursesToSections(
    courses,
  )) {
    const entry = index.get(fs.section.crn);
    if (!entry) {
      index.set(fs.section.crn, {
        section: fs.section,
        courses: [fs.course],
        filterable: fs,
      });
    } else if (!entry.courses.includes(fs.course)) {
      entry.courses.push(fs.course);
    }
  }
  return index;
}

/**
 * The academic year (fall year) in session today, worked out per call so a
 * long-running server rolls over in summer. Without term bounds, the newest
 * year in the catalog.
 */
export function currentAcademicYear(catalog: Catalog): number {
  return (
    catalog.termBounds.getCurrentAcademicYear(catalog.now()) ??
    catalog.years.at(-1) ??
    catalog.now().getFullYear()
  );
}

/**
 * Serves the catalog from memory. A request at most every checkIntervalMs
 * stats the course data file; when its mtime has moved, a reload starts in
 * the background and requests keep getting the old catalog until it lands.
 */
export class CatalogSource {
  private readonly dataDir?: string;
  private readonly publicDir: string;
  private readonly checkIntervalMs: number;
  private readonly now: () => Date;

  private current: Catalog | null = null;
  private currentMtime = 0;
  private lastCheck = 0;
  private loading: Promise<Catalog> | null = null;

  constructor(options: CatalogSourceOptions) {
    this.dataDir = options.dataDir;
    this.publicDir = options.publicDir;
    this.checkIntervalMs = options.checkIntervalMs ?? 30_000;
    this.now = options.now ?? (() => new Date());
  }

  /** The current catalog; the first call waits for the initial load. */
  async get(): Promise<Catalog> {
    if (!this.current) {
      this.loading ??= this.load().finally(() => {
        this.loading = null;
      });
      return this.loading;
    }

    const now = Date.now();
    if (!this.loading && now - this.lastCheck >= this.checkIntervalMs) {
      this.lastCheck = now;
      this.loading = this.reloadIfChanged().finally(() => {
        this.loading = null;
      });
      // A failed reload keeps the old catalog; the next check tries again.
      this.loading.catch(error =>
        logger.error('[catalog] Reload failed, keeping old data:', error),
      );
    }
    return this.current;
  }

  /** DATA_DIR's copy of a file when it exists, else public/'s. */
  private async resolve(file: string): Promise<string> {
    if (this.dataDir) {
      const candidate = join(this.dataDir, file);
      try {
        await stat(candidate);
        return candidate;
      } catch {
        // Not in DATA_DIR; fall through to public/.
      }
    }
    return join(this.publicDir, file);
  }

  private async reloadIfChanged(): Promise<Catalog> {
    const { mtimeMs } = await stat(await this.resolve(CATALOG_FILE));
    if (this.current && mtimeMs === this.currentMtime) return this.current;
    return this.load();
  }

  private async load(): Promise<Catalog> {
    const catalogPath = await this.resolve(CATALOG_FILE);
    const { mtimeMs } = await stat(catalogPath);
    const db = parseCatalog(await readJson(catalogPath));

    // Ratings, term bounds and the timestamp are optional: without them the
    // catalog still serves, with no ratings and the newest year as current.
    const rmp = new RateMyProfessorService();
    try {
      rmp.loadFromData(await readJson(await this.resolve(RMP_FILE)));
    } catch (error) {
      logger.error('[catalog] Rate My Professor data unavailable:', error);
    }

    const termBounds = TermBoundsService.getInstance();
    try {
      termBounds.loadFromData(
        await readJson(await this.resolve(TERM_BOUNDS_FILE)),
      );
    } catch (error) {
      logger.error('[catalog] Term bounds unavailable:', error);
    }

    let lastUpdated: string | null = null;
    try {
      lastUpdated = LastUpdatedSchema.parse(
        await readJson(await this.resolve(LAST_UPDATED_FILE)),
      ).timestamp;
    } catch {
      // No timestamp file; meta reports null.
    }

    const courses = db.departments.flatMap(d => d.courses);
    const years = [
      ...new Set(
        courses
          .map(c => c.academicYear)
          .filter((y): y is number => y !== undefined),
      ),
    ].sort((a, b) => a - b);

    // Code reading ("CS2" as every CS 2xxx) and acronyms depend on the
    // departments and definitions search learns from course text, so learn
    // them before the first lookup parses a query, not on the first search.
    // A refresh forgets what the old data taught first. Both run in one
    // synchronous stretch, so no request sees the vocabulary half-built.
    resetSearchVocabulary();
    prepareSearch(courses);

    const catalog: Catalog = {
      departments: db.departments,
      courses,
      lastUpdated,
      years,
      sectionsByCrn: indexSections(courses),
      rmp,
      termBounds,
      now: this.now,
    };

    this.current = catalog;
    this.currentMtime = mtimeMs;
    this.lastCheck = Date.now();
    return catalog;
  }
}
