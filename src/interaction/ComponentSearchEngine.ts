/**
 * ComponentSearchEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Component Search Engine
 *
 * Provides text search over board components with recent-search history.
 * Used by useBoardInteraction for the search bar feature.
 *
 * Zero React. Zero DOM (except document.getElementById used by consumer,
 * not by this engine). Pure TypeScript. No external dependencies.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchableComponent {
  readonly id:       string;
  readonly name?:    string;
  readonly value?:   string;
  readonly package?: string;
  readonly category?: string;
  readonly layer?:   string;
  readonly [key: string]: unknown;
}

export interface SearchMatch {
  readonly component: SearchableComponent;
  readonly score:     number;
  readonly matchOn:   string;
}

// ─── ComponentSearchEngine ───────────────────────────────────────────────────

export class ComponentSearchEngine {
  private _components:    SearchableComponent[] = [];
  private _recentSearches: string[] = [];
  private readonly _maxRecent = 10;

  /**
   * Build the search index from a component list.
   * The second argument (netEng) is accepted for call-site compatibility
   * but is not used — net data is not indexed at this layer.
   *
   * @param components  Array of board components to index.
   * @param _netEng     Ignored — signature compatibility only.
   */
  build(components: readonly SearchableComponent[], _netEng?: unknown): void {
    try {
      if (!Array.isArray(components)) return;
      this._components = components.filter(
        (c) => c !== null && typeof c === 'object' && typeof c.id === 'string',
      ) as SearchableComponent[];
    } catch {
      // Never propagate.
    }
  }

  /**
   * Search components by name, value, or package.
   * Returns matches sorted by score (exact > prefix > contains) then name.
   *
   * @param query  Search string. Case-insensitive.
   * @returns Array of SearchMatch sorted best-first.
   */
  search(query: string): SearchMatch[] {
    try {
      if (typeof query !== 'string' || query.trim().length === 0) return [];
      const q = query.trim().toLowerCase();

      const results: SearchMatch[] = [];
      for (let i = 0; i < this._components.length; i++) {
        const c = this._components[i];
        const match = this._bestMatch(c, q);
        if (match !== null) results.push(match);
      }

      results.sort((a, b) => {
        const ds = b.score - a.score;
        if (ds !== 0) return ds;
        const na = String(a.component.name ?? a.component.id).toLowerCase();
        const nb = String(b.component.name ?? b.component.id).toLowerCase();
        return na < nb ? -1 : na > nb ? 1 : 0;
      });

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Add a search term to the recent-searches list (front-of-list, deduplicated).
   *
   * @param term  Term to record (trimmed, uppercased by caller convention).
   */
  pushRecent(term: string): void {
    if (typeof term !== 'string' || term.trim().length === 0) return;
    const t = term.trim();
    // Remove any prior occurrence of the same term.
    this._recentSearches = this._recentSearches.filter((r) => r !== t);
    this._recentSearches.unshift(t);
    if (this._recentSearches.length > this._maxRecent) {
      this._recentSearches = this._recentSearches.slice(0, this._maxRecent);
    }
  }

  /**
   * Return a frozen snapshot of the recent-searches list (most recent first).
   */
  getRecent(): readonly string[] {
    return Object.freeze(this._recentSearches.slice());
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _bestMatch(c: SearchableComponent, q: string): SearchMatch | null {
    const fields: Array<[string, unknown]> = [
      ['name',    c.name],
      ['value',   c.value],
      ['package', c.package],
      ['id',      c.id],
    ];

    let bestScore = 0;
    let bestField = '';

    for (const [field, raw] of fields) {
      if (raw === undefined || raw === null) continue;
      const f = String(raw).toLowerCase();
      let score = 0;
      if (f === q)              score = 100;
      else if (f.startsWith(q)) score = 75;
      else if (f.includes(q))   score = 50;
      if (score > bestScore) {
        bestScore = score;
        bestField = field;
      }
    }

    if (bestScore === 0) return null;
    return Object.freeze({ component: c, score: bestScore, matchOn: bestField });
  }
}
