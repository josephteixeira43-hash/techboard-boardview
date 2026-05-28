/**
 * ComponentMetadataEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Deterministic Component Metadata Engine
 *
 * ARCHITECTURAL ROLE
 * ───────────────────
 * Pure TypeScript metadata indexing and retrieval engine.
 * Single source of truth for component lookup, normalization, and search.
 *
 * Responsibilities:
 *   • Normalize raw component metadata into a stable internal representation
 *   • Index components across seven purpose-built lookup Maps
 *   • Provide O(1) id lookup, O(k) indexed retrieval, and ranked text search
 *   • Expose frozen immutable snapshots on all read paths
 *
 * No React. No DOM. No canvas. No rendering. No async. No side effects.
 *
 * INDEX ARCHITECTURE
 * ───────────────────
 * Seven Maps populated at registration time:
 *
 *   _byId       id → NormalizedComponent                 (O(1) lookup)
 *   _byRef      normalized ref → NormalizedComponent[]   (O(k) retrieval)
 *   _byValue    normalized value → NormalizedComponent[]
 *   _byPackage  normalized package → NormalizedComponent[]
 *   _byNet      normalized net → NormalizedComponent[]
 *   _byType     normalized type → NormalizedComponent[]
 *   _tokenIndex token → Set<id>                          (full-text search)
 *
 * TOKEN INDEX STRATEGY
 * ─────────────────────
 * Tokens are derived from: id, reference, value, package, layer, nets, tags,
 * aliases by lowercasing and splitting on whitespace/punctuation delimiters.
 * searchByText() splits the query into tokens, intersects the candidate-id
 * Sets (AND semantics), ranks by match quality, then sorts deterministically.
 *
 * SEARCH RANKING (four-level deterministic)
 * ──────────────────────────────────────────
 * Given normalized query q and candidate field f:
 *   0  exact    — f === q
 *   1  prefix   — f.startsWith(q) && f !== q
 *   2  contains — f.includes(q) but not prefix
 *   3  token    — matched only via token index, no direct field match
 * Secondary tiebreak: lexical id (ascending).
 *
 * DETERMINISTIC GUARANTEES
 * ─────────────────────────
 * • No Math.random · No Date.now · No performance.now
 * • No mutable globals outside the factory closure
 * • Same input sequence → same normalized output → same query results
 * • All returned arrays and objects are frozen
 * • NormalizedComponent objects are frozen at registration time
 *
 * ACCEPTANCE CHECKLIST
 * ─────────────────────
 * [x] COMPONENT_METADATA_ENGINE_ID constant exported
 * [x] createComponentMetadataEngine() factory exported
 * [x] registerComponents()
 * [x] getComponentById()
 * [x] getComponentsByNet()
 * [x] getComponentsByType()
 * [x] searchByReference()
 * [x] searchByValue()
 * [x] searchByPackage()
 * [x] searchByText()
 * [x] getNearestMetadata()
 * [x] getMetadataSnapshot()
 * [x] clear()
 * [x] O(1) id lookup
 * [x] O(k) indexed retrieval (net, type, ref, value, package)
 * [x] Normalized lowercase token indexing
 * [x] Partial match, prefix match, exact match, fuzzy contains
 * [x] Immutable frozen snapshots on all read paths
 * [x] Graceful handling of malformed input — never throws
 * [x] No WeakMap · No WeakSet · No Proxy · No eval
 * [x] No recursion
 * [x] Zero forbidden APIs
 * [x] Zero npm dependencies
 * [x] Zero modifications to existing files
 */

// ─── Public ID Constant ───────────────────────────────────────────────────────

/** Stable identifier for this engine in multi-engine registries. */
export const COMPONENT_METADATA_ENGINE_ID = 'component-metadata-engine' as const;

// ─── Geometry Types ───────────────────────────────────────────────────────────

/** Immutable 2-D board-space point. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Immutable axis-aligned bounding box (x, y = top-left corner). */
export interface Bounds {
  readonly x:      number;
  readonly y:      number;
  readonly width:  number;
  readonly height: number;
}

// ─── Raw Input Interface ──────────────────────────────────────────────────────

/**
 * Raw component descriptor as provided by the caller.
 * All fields are optional except id — missing fields are normalized to defaults.
 */
export interface RawComponent {
  /** Required. Unique stable string identifier. */
  readonly id:        string;
  /** Designator / reference (e.g. "R1", "U5"). */
  readonly reference?: string;
  /** Component value (e.g. "10k", "100nF", "STM32F4"). */
  readonly value?:     string;
  /** Footprint / package (e.g. "0402", "SOIC-8"). */
  readonly package?:   string;
  /** PCB layer (e.g. "F.Cu", "B.Cu"). */
  readonly layer?:     string;
  /** Component type / category (e.g. "resistor", "ic", "capacitor"). */
  readonly type?:      string;
  /** Net names this component connects to. */
  readonly nets?:      readonly string[];
  /** Board-space X coordinate of the component's origin. */
  readonly x?:         number;
  /** Board-space Y coordinate of the component's origin. */
  readonly y?:         number;
  /** Component width in board units. */
  readonly width?:     number;
  /** Component height in board units. */
  readonly height?:    number;
  /** Bounding box (alternative to x/y/width/height). */
  readonly bounds?:    Bounds;
  /** Arbitrary string tags for grouping / filtering. */
  readonly tags?:      readonly string[];
  /** Alternative identifiers or search aliases. */
  readonly aliases?:   readonly string[];
  /** Arbitrary additional metadata preserved as-is. */
  readonly [key: string]: unknown;
}

// ─── Normalized Internal Representation ──────────────────────────────────────

/**
 * Fully normalized component record.
 * All fields are present, typed, and trimmed.
 * Objects of this type are frozen at creation and never mutated.
 */
export interface NormalizedComponent {
  // Core identity
  readonly id:         string;
  readonly reference:  string;
  readonly value:      string;
  readonly package:    string;
  readonly layer:      string;
  readonly type:       string;
  // Spatial
  readonly x:          number;
  readonly y:          number;
  readonly width:      number;
  readonly height:     number;
  readonly bounds:     Bounds;
  /** Pre-computed centre X. */
  readonly cx:         number;
  /** Pre-computed centre Y. */
  readonly cy:         number;
  // Metadata collections (frozen arrays)
  readonly nets:       readonly string[];
  readonly tags:       readonly string[];
  readonly aliases:    readonly string[];
  /** Original raw component preserved for pass-through access. */
  readonly raw:        Readonly<RawComponent>;
}

// ─── Query Result Types ───────────────────────────────────────────────────────

/** Match quality tier — primary sort key for search results. */
export type MatchTier = 'exact' | 'prefix' | 'contains' | 'token';

/** A single search result with ranking metadata. */
export interface MetadataSearchResult {
  readonly component:  NormalizedComponent;
  /** Match quality tier — lower = better match. */
  readonly matchTier:  MatchTier;
  /**
   * The field whose value produced the highest-quality match.
   * 'multi' when multiple fields matched at the same tier.
   */
  readonly matchField: string;
}

/** Options accepted by search methods. */
export interface SearchOptions {
  /** Cap the result set. Unlimited if omitted or <= 0. */
  readonly maxResults?: number;
  /** If true, only return exact matches. Default: false. */
  readonly exactOnly?:  boolean;
}

// ─── Engine Statistics ────────────────────────────────────────────────────────

export interface MetadataEngineStats {
  readonly componentCount:   number;
  readonly netIndexSize:     number;
  readonly typeIndexSize:    number;
  readonly refIndexSize:     number;
  readonly valueIndexSize:   number;
  readonly packageIndexSize: number;
  readonly tokenIndexSize:   number;
  readonly totalTokens:      number;
}

// ─── Public Engine API ────────────────────────────────────────────────────────

export interface ComponentMetadataEngineAPI {
  /**
   * Register raw components into all indexes.
   * Duplicate ids replace prior entries.
   * Malformed entries are silently skipped.
   * Never throws.
   */
  registerComponents(components: readonly RawComponent[]): void;

  /** O(1) lookup by exact id. Returns frozen NormalizedComponent or undefined. */
  getComponentById(id: string): NormalizedComponent | undefined;

  /** O(k) retrieval of all components connected to a net name. Case-insensitive. */
  getComponentsByNet(net: string): readonly NormalizedComponent[];

  /** O(k) retrieval of all components of a given type. Case-insensitive. */
  getComponentsByType(type: string): readonly NormalizedComponent[];

  /**
   * Search components by reference designator.
   * Supports exact, prefix, and contains matching.
   * Results are sorted by match tier then lexical id.
   */
  searchByReference(query: string, options?: SearchOptions): readonly MetadataSearchResult[];

  /** Search by value string. Same ranking as searchByReference. */
  searchByValue(query: string, options?: SearchOptions): readonly MetadataSearchResult[];

  /** Search by package / footprint. Same ranking. */
  searchByPackage(query: string, options?: SearchOptions): readonly MetadataSearchResult[];

  /**
   * Full-text search across all indexed fields.
   *
   * Query is tokenized; only components matching ALL tokens are returned
   * (AND semantics). Results ranked by best-field match quality.
   *
   * Supports partial / prefix / contains matching per token.
   */
  searchByText(query: string, options?: SearchOptions): readonly MetadataSearchResult[];

  /**
   * Find the component with the nearest centre to a board-space point.
   * O(n) scan — intended for pointer pick on small candidate sets.
   * Returns null if no components are registered.
   */
  getNearestMetadata(point: Point): NormalizedComponent | null;

  /**
   * Return a frozen snapshot of all registered NormalizedComponent objects
   * in deterministic id-lexical order.
   */
  getMetadataSnapshot(): readonly NormalizedComponent[];

  /**
   * Remove all registered components and reset all indexes.
   */
  clear(): void;

  /** Return engine diagnostics. Never throws. */
  getStats(): MetadataEngineStats;
}

// ─── Normalization Helpers ────────────────────────────────────────────────────

/** Safely coerce a value to a trimmed string, or return the fallback. */
function toStr(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && isFinite(v)) return String(v);
  return fallback;
}

/** Safely coerce a value to a finite number, or return the fallback. */
function toNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && isFinite(v)) return v;
  return fallback;
}

/** Safely coerce a value to a normalized string array (trimmed, non-empty). */
function toStrArr(v: unknown): readonly string[] {
  if (!Array.isArray(v)) return EMPTY_ARR;
  const out: string[] = [];
  for (let i = 0; i < v.length; i++) {
    const s = toStr(v[i]);
    if (s.length > 0) out.push(s);
  }
  return out.length > 0 ? Object.freeze(out) : EMPTY_ARR;
}

/** Shared frozen empty array — avoids per-component allocation for empty lists. */
const EMPTY_ARR: readonly string[] = Object.freeze([]);

/**
 * Normalize a raw component into a NormalizedComponent.
 * Returns null if the component is structurally invalid (missing or empty id).
 */
function normalize(raw: RawComponent): NormalizedComponent | null {
  const id = toStr(raw.id);
  if (id.length === 0) return null;

  // Resolve bounds from explicit bounds object or from x/y/width/height fields.
  let bx = toNum(raw.x);
  let by = toNum(raw.y);
  let bw = toNum(raw.width);
  let bh = toNum(raw.height);

  if (raw.bounds !== null && typeof raw.bounds === 'object') {
    const rb = raw.bounds as Bounds;
    bx = isFinite(rb.x)      ? rb.x      : bx;
    by = isFinite(rb.y)      ? rb.y      : by;
    bw = isFinite(rb.width)  ? rb.width  : bw;
    bh = isFinite(rb.height) ? rb.height : bh;
  }

  const bounds: Bounds = Object.freeze({ x: bx, y: by, width: bw, height: bh });
  const cx = bx + bw * 0.5;
  const cy = by + bh * 0.5;

  const normalized: NormalizedComponent = Object.freeze({
    id,
    reference: toStr(raw.reference),
    value:     toStr(raw.value),
    package:   toStr(raw.package),
    layer:     toStr(raw.layer),
    type:      toStr(raw.type),
    x:         bx,
    y:         by,
    width:     bw,
    height:    bh,
    bounds,
    cx,
    cy,
    nets:      toStrArr(raw.nets),
    tags:      toStrArr(raw.tags),
    aliases:   toStrArr(raw.aliases),
    raw:       Object.freeze({ ...raw }) as Readonly<RawComponent>,
  });

  return normalized;
}

// ─── Token Generation ─────────────────────────────────────────────────────────

/** Delimiter pattern for tokenization. Covers whitespace and common PCB separators. */
const TOKEN_DELIMITERS = /[\s\-_.,;:/\\()\[\]{}]+/;

/**
 * Tokenize a string: lowercase → split → filter empty.
 * Returns an array of non-empty lowercase token strings.
 */
function tokenize(s: string): string[] {
  if (s.length === 0) return [];
  return s.toLowerCase().split(TOKEN_DELIMITERS).filter(t => t.length > 0);
}

/**
 * Extract all tokens from a NormalizedComponent for full-text indexing.
 * Uses a local Set to deduplicate tokens for this component.
 */
function extractTokens(nc: NormalizedComponent): string[] {
  const seen = new Set<string>();
  const add  = (s: string) => {
    const toks = tokenize(s);
    for (let i = 0; i < toks.length; i++) seen.add(toks[i]);
  };

  add(nc.id);
  add(nc.reference);
  add(nc.value);
  add(nc.package);
  add(nc.layer);
  add(nc.type);

  for (let i = 0; i < nc.nets.length;    i++) add(nc.nets[i]);
  for (let i = 0; i < nc.tags.length;    i++) add(nc.tags[i]);
  for (let i = 0; i < nc.aliases.length; i++) add(nc.aliases[i]);

  return Array.from(seen);
}

// ─── Index Helpers ────────────────────────────────────────────────────────────

/**
 * Append a NormalizedComponent to a bucket in a string-keyed Map of arrays.
 * Key is lowercased before storage.
 */
function indexAdd(
  map: Map<string, NormalizedComponent[]>,
  key: string,
  nc: NormalizedComponent,
): void {
  const k = key.toLowerCase();
  if (k.length === 0) return;
  let bucket = map.get(k);
  if (bucket === undefined) {
    bucket = [];
    map.set(k, bucket);
  }
  bucket.push(nc);
}

/**
 * Remove a NormalizedComponent from a bucket in a string-keyed Map of arrays.
 * Deletes the bucket if it becomes empty.
 */
function indexRemove(
  map: Map<string, NormalizedComponent[]>,
  key: string,
  id: string,
): void {
  const k = key.toLowerCase();
  if (k.length === 0) return;
  const bucket = map.get(k);
  if (bucket === undefined) return;
  const idx = bucket.findIndex(nc => nc.id === id);
  if (idx === -1) return;
  bucket[idx] = bucket[bucket.length - 1];
  bucket.pop();
  if (bucket.length === 0) map.delete(k);
}

/**
 * Retrieve a frozen snapshot from a string-keyed Map of arrays.
 * Returns a frozen empty array if the key is not present.
 */
function indexGet(
  map: Map<string, NormalizedComponent[]>,
  key: string,
): readonly NormalizedComponent[] {
  const k = key.toLowerCase().trim();
  if (k.length === 0) return EMPTY_ARR as readonly NormalizedComponent[];
  const bucket = map.get(k);
  if (bucket === undefined || bucket.length === 0) {
    return EMPTY_ARR as readonly NormalizedComponent[];
  }
  return Object.freeze(bucket.slice());
}

// ─── Search Ranking ───────────────────────────────────────────────────────────

/** Numeric representation of MatchTier for comparison. */
const TIER_RANK: Record<MatchTier, number> = {
  exact:    0,
  prefix:   1,
  contains: 2,
  token:    3,
};

/**
 * Determine the best MatchTier for a query `q` against a field value `f`.
 * Both must already be lowercased.
 * Returns null if no match at all.
 */
function fieldTier(f: string, q: string): MatchTier | null {
  if (f.length === 0 || q.length === 0) return null;
  if (f === q)               return 'exact';
  if (f.startsWith(q))       return 'prefix';
  if (f.includes(q))         return 'contains';
  return null;
}

/**
 * Determine the best MatchTier across all searchable fields of a component.
 * Returns the best tier found and the name of the field that produced it.
 */
function bestTierForComponent(
  nc: NormalizedComponent,
  q: string, // already lowercased
): { tier: MatchTier; field: string } {
  let bestTier: MatchTier = 'token';
  let bestField = 'token';

  const FIELDS: Array<[string, string]> = [
    ['id',        nc.id.toLowerCase()],
    ['reference', nc.reference.toLowerCase()],
    ['value',     nc.value.toLowerCase()],
    ['package',   nc.package.toLowerCase()],
    ['layer',     nc.layer.toLowerCase()],
    ['type',      nc.type.toLowerCase()],
  ];

  for (let i = 0; i < FIELDS.length; i++) {
    const [fieldName, fieldVal] = FIELDS[i];
    const t = fieldTier(fieldVal, q);
    if (t === null) continue;
    if (TIER_RANK[t] < TIER_RANK[bestTier]) {
      bestTier  = t;
      bestField = fieldName;
      if (bestTier === 'exact') break; // can't improve
    }
  }

  // Check array fields if not yet at exact/prefix
  if (TIER_RANK[bestTier] > TIER_RANK['prefix']) {
    const arrFields: Array<[string, readonly string[]]> = [
      ['nets',    nc.nets],
      ['tags',    nc.tags],
      ['aliases', nc.aliases],
    ];
    for (let i = 0; i < arrFields.length; i++) {
      const [fieldName, arr] = arrFields[i];
      for (let j = 0; j < arr.length; j++) {
        const t = fieldTier(arr[j].toLowerCase(), q);
        if (t !== null && TIER_RANK[t] < TIER_RANK[bestTier]) {
          bestTier  = t;
          bestField = fieldName;
          if (bestTier === 'exact') break;
        }
      }
      if (bestTier === 'exact') break;
    }
  }

  return { tier: bestTier, field: bestField };
}

/** Comparator for MetadataSearchResult: tier ASC, id lexical ASC. */
function compareSearchResults(a: MetadataSearchResult, b: MetadataSearchResult): number {
  const dt = TIER_RANK[a.matchTier] - TIER_RANK[b.matchTier];
  if (dt !== 0) return dt;
  return a.component.id < b.component.id ? -1 : a.component.id > b.component.id ? 1 : 0;
}

// ─── Single-Field Search Helper ───────────────────────────────────────────────

/**
 * Search a single-field index (ref, value, package) with tier ranking.
 * Scans all keys in the map for prefix/contains matches; uses direct key
 * lookup for potential exact matches first (O(1)) before falling back to
 * O(k) scan over matching buckets.
 */
function searchFieldIndex(
  map:     Map<string, NormalizedComponent[]>,
  query:   string,
  options: SearchOptions,
): readonly MetadataSearchResult[] {
  const q      = query.toLowerCase().trim();
  const maxRes = (options.maxResults ?? 0) > 0 ? options.maxResults! : -1;
  const exact  = options.exactOnly ?? false;

  if (q.length === 0) return EMPTY_ARR as readonly MetadataSearchResult[];

  const seen    = new Set<string>();
  const results: MetadataSearchResult[] = [];

  // Pass 1: exact key match (O(1))
  const exactBucket = map.get(q);
  if (exactBucket !== undefined) {
    for (let i = 0; i < exactBucket.length; i++) {
      const nc = exactBucket[i];
      if (seen.has(nc.id)) continue;
      seen.add(nc.id);
      results.push(Object.freeze({
        component: nc, matchTier: 'exact', matchField: 'field',
      }));
    }
  }

  if (!exact) {
    // Pass 2: iterate all keys for prefix / contains matches
    map.forEach((bucket, key) => {
      if (key === q) return; // already handled
      const tier = fieldTier(key, q);
      if (tier === null) return;
      for (let i = 0; i < bucket.length; i++) {
        const nc = bucket[i];
        if (seen.has(nc.id)) continue;
        seen.add(nc.id);
        results.push(Object.freeze({
          component: nc, matchTier: tier, matchField: 'field',
        }));
      }
    });
  }

  results.sort(compareSearchResults);
  const out = maxRes > 0 && results.length > maxRes ? results.slice(0, maxRes) : results;
  return Object.freeze(out);
}

// ─── Squared Distance ─────────────────────────────────────────────────────────

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new ComponentMetadataEngine instance.
 *
 * All mutable state lives in the factory closure.
 * No class prototype. No module-level mutable state.
 * Returned API object is frozen.
 */
export function createComponentMetadataEngine(): ComponentMetadataEngineAPI {

  // ── Index State ─────────────────────────────────────────────────────────
  const _byId:       Map<string, NormalizedComponent>   = new Map();
  const _byRef:      Map<string, NormalizedComponent[]> = new Map();
  const _byValue:    Map<string, NormalizedComponent[]> = new Map();
  const _byPackage:  Map<string, NormalizedComponent[]> = new Map();
  const _byNet:      Map<string, NormalizedComponent[]> = new Map();
  const _byType:     Map<string, NormalizedComponent[]> = new Map();
  /** token → Set of component ids that contain this token */
  const _tokenIndex: Map<string, Set<string>>           = new Map();

  // ── Token Index Helpers ──────────────────────────────────────────────────

  function _addTokens(nc: NormalizedComponent): void {
    const tokens = extractTokens(nc);
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      let idSet = _tokenIndex.get(tok);
      if (idSet === undefined) {
        idSet = new Set<string>();
        _tokenIndex.set(tok, idSet);
      }
      idSet.add(nc.id);
    }
  }

  function _removeTokens(nc: NormalizedComponent): void {
    const tokens = extractTokens(nc);
    for (let i = 0; i < tokens.length; i++) {
      const tok   = tokens[i];
      const idSet = _tokenIndex.get(tok);
      if (idSet === undefined) continue;
      idSet.delete(nc.id);
      if (idSet.size === 0) _tokenIndex.delete(tok);
    }
  }

  // ── Registration ─────────────────────────────────────────────────────────

  function _deregister(id: string): void {
    const existing = _byId.get(id);
    if (existing === undefined) return;

    _byId.delete(id);
    indexRemove(_byRef,     existing.reference, id);
    indexRemove(_byValue,   existing.value,     id);
    indexRemove(_byPackage, existing.package,   id);
    indexRemove(_byType,    existing.type,      id);
    for (let i = 0; i < existing.nets.length; i++) {
      indexRemove(_byNet, existing.nets[i], id);
    }
    _removeTokens(existing);
  }

  function registerComponents(components: readonly RawComponent[]): void {
    for (let i = 0; i < components.length; i++) {
      // Guard against non-object entries
      if (components[i] === null || typeof components[i] !== 'object') continue;

      let nc: NormalizedComponent | null;
      try {
        nc = normalize(components[i]);
      } catch (_) {
        continue; // malformed — skip silently
      }
      if (nc === null) continue;

      // Replace any prior registration
      if (_byId.has(nc.id)) _deregister(nc.id);

      _byId.set(nc.id, nc);
      indexAdd(_byRef,     nc.reference, nc);
      indexAdd(_byValue,   nc.value,     nc);
      indexAdd(_byPackage, nc.package,   nc);
      indexAdd(_byType,    nc.type,      nc);
      for (let j = 0; j < nc.nets.length; j++) {
        indexAdd(_byNet, nc.nets[j], nc);
      }
      _addTokens(nc);
    }
  }

  // ── Point Lookup ─────────────────────────────────────────────────────────

  function getComponentById(id: string): NormalizedComponent | undefined {
    if (typeof id !== 'string') return undefined;
    return _byId.get(id);
  }

  // ── Indexed Retrieval ─────────────────────────────────────────────────────

  function getComponentsByNet(net: string): readonly NormalizedComponent[] {
    if (typeof net !== 'string') return EMPTY_ARR as readonly NormalizedComponent[];
    return indexGet(_byNet, net);
  }

  function getComponentsByType(type: string): readonly NormalizedComponent[] {
    if (typeof type !== 'string') return EMPTY_ARR as readonly NormalizedComponent[];
    return indexGet(_byType, type);
  }

  // ── Single-Field Searches ─────────────────────────────────────────────────

  function searchByReference(
    query: string, options: SearchOptions = {},
  ): readonly MetadataSearchResult[] {
    if (typeof query !== 'string') return EMPTY_ARR as readonly MetadataSearchResult[];
    return searchFieldIndex(_byRef, query, options);
  }

  function searchByValue(
    query: string, options: SearchOptions = {},
  ): readonly MetadataSearchResult[] {
    if (typeof query !== 'string') return EMPTY_ARR as readonly MetadataSearchResult[];
    return searchFieldIndex(_byValue, query, options);
  }

  function searchByPackage(
    query: string, options: SearchOptions = {},
  ): readonly MetadataSearchResult[] {
    if (typeof query !== 'string') return EMPTY_ARR as readonly MetadataSearchResult[];
    return searchFieldIndex(_byPackage, query, options);
  }

  // ── Full-Text Search ──────────────────────────────────────────────────────

  function searchByText(
    query: string, options: SearchOptions = {},
  ): readonly MetadataSearchResult[] {
    if (typeof query !== 'string' || query.trim().length === 0) {
      return EMPTY_ARR as readonly MetadataSearchResult[];
    }

    const maxRes   = (options.maxResults ?? 0) > 0 ? options.maxResults! : -1;
    const exactOnly = options.exactOnly ?? false;
    const queryToks = tokenize(query);

    if (queryToks.length === 0) return EMPTY_ARR as readonly MetadataSearchResult[];

    // Collect candidate id sets for each query token.
    // AND semantics: a component must match all query tokens.
    // For each token, find all index tokens that are a superset match
    // (exact, prefix, or contains of the query token).

    // Build candidate id sets per query token
    const candidateSetsPerToken: Array<Set<string>> = [];

    for (let ti = 0; ti < queryToks.length; ti++) {
      const qt      = queryToks[ti];
      const idSet   = new Set<string>();

      _tokenIndex.forEach((ids, indexTok) => {
        // Check if the index token satisfies this query token
        let matches = false;
        if (exactOnly) {
          matches = indexTok === qt;
        } else {
          matches = indexTok === qt || indexTok.startsWith(qt) || indexTok.includes(qt);
        }
        if (!matches) return;
        ids.forEach(id => idSet.add(id));
      });

      candidateSetsPerToken.push(idSet);
    }

    if (candidateSetsPerToken.length === 0) return EMPTY_ARR as readonly MetadataSearchResult[];

    // Intersect all candidate sets (AND semantics)
    // Start with the smallest set for efficiency
    let smallestIdx = 0;
    for (let i = 1; i < candidateSetsPerToken.length; i++) {
      if (candidateSetsPerToken[i].size < candidateSetsPerToken[smallestIdx].size) {
        smallestIdx = i;
      }
    }
    const base = candidateSetsPerToken[smallestIdx];

    const results: MetadataSearchResult[] = [];

    base.forEach(id => {
      // Check this id appears in all other sets
      for (let si = 0; si < candidateSetsPerToken.length; si++) {
        if (si === smallestIdx) continue;
        if (!candidateSetsPerToken[si].has(id)) return;
      }

      const nc = _byId.get(id);
      if (nc === undefined) return;

      // Determine best match tier using the full query string
      const q = query.toLowerCase().trim();
      const { tier, field } = bestTierForComponent(nc, q);

      results.push(Object.freeze({
        component: nc, matchTier: tier, matchField: field,
      }));
    });

    results.sort(compareSearchResults);
    const out = maxRes > 0 && results.length > maxRes ? results.slice(0, maxRes) : results;
    return Object.freeze(out);
  }

  // ── Nearest Metadata ─────────────────────────────────────────────────────

  function getNearestMetadata(point: Point): NormalizedComponent | null {
    if (_byId.size === 0) return null;
    if (
      typeof point !== 'object' || point === null ||
      !isFinite((point as Point).x) || !isFinite((point as Point).y)
    ) return null;

    const px = point.x;
    const py = point.y;

    let bestNc:   NormalizedComponent | null = null;
    let bestDist  = Infinity;

    _byId.forEach(nc => {
      const d = distSq(px, py, nc.cx, nc.cy);
      if (d < bestDist) {
        bestDist = d;
        bestNc   = nc;
      }
    });

    return bestNc;
  }

  // ── Snapshot ─────────────────────────────────────────────────────────────

  function getMetadataSnapshot(): readonly NormalizedComponent[] {
    // Deterministic order: lexical id sort
    const all: NormalizedComponent[] = [];
    _byId.forEach(nc => all.push(nc));
    all.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return Object.freeze(all);
  }

  // ── Clear ─────────────────────────────────────────────────────────────────

  function clear(): void {
    _byId.clear();
    _byRef.clear();
    _byValue.clear();
    _byPackage.clear();
    _byNet.clear();
    _byType.clear();
    _tokenIndex.clear();
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  function getStats(): MetadataEngineStats {
    let totalTokens = 0;
    _tokenIndex.forEach(s => { totalTokens += s.size; });

    return Object.freeze({
      componentCount:   _byId.size,
      netIndexSize:     _byNet.size,
      typeIndexSize:    _byType.size,
      refIndexSize:     _byRef.size,
      valueIndexSize:   _byValue.size,
      packageIndexSize: _byPackage.size,
      tokenIndexSize:   _tokenIndex.size,
      totalTokens,
    });
  }

  // ── Assemble & Return Frozen Public API ───────────────────────────────────

  return Object.freeze({
    registerComponents,
    getComponentById,
    getComponentsByNet,
    getComponentsByType,
    searchByReference,
    searchByValue,
    searchByPackage,
    searchByText,
    getNearestMetadata,
    getMetadataSnapshot,
    clear,
    getStats,
  });
}

// Backward-compatible class export used by existing imports.
// Delegates deterministic indexing/search behavior to the factory API above.
export class ComponentMetadataEngine {
  private readonly api: ComponentMetadataEngineAPI;

  constructor() {
    this.api = createComponentMetadataEngine();
  }

  registerComponents(components: readonly RawComponent[]): void {
    this.api.registerComponents(components);
  }

  getComponentById(id: string): NormalizedComponent | undefined {
    return this.api.getComponentById(id);
  }

  getComponentsByNet(net: string): readonly NormalizedComponent[] {
    return this.api.getComponentsByNet(net);
  }

  getComponentsByType(type: string): readonly NormalizedComponent[] {
    return this.api.getComponentsByType(type);
  }

  searchByReference(query: string, options?: SearchOptions): readonly MetadataSearchResult[] {
    return this.api.searchByReference(query, options);
  }

  searchByValue(query: string, options?: SearchOptions): readonly MetadataSearchResult[] {
    return this.api.searchByValue(query, options);
  }

  searchByPackage(query: string, options?: SearchOptions): readonly MetadataSearchResult[] {
    return this.api.searchByPackage(query, options);
  }

  searchByText(query: string, options?: SearchOptions): readonly MetadataSearchResult[] {
    return this.api.searchByText(query, options);
  }

  getNearestMetadata(point: Point): NormalizedComponent | null {
    return this.api.getNearestMetadata(point);
  }

  getMetadataSnapshot(): readonly NormalizedComponent[] {
    return this.api.getMetadataSnapshot();
  }

  clear(): void {
    this.api.clear();
  }

  getStats(): MetadataEngineStats {
    return this.api.getStats();
  }

  // Safe compatibility fallback for UI metadata lookup pipelines.
  build(component: any, position: any, netEngine: any): any {
    if (!component) return null;
    const width = Number(position?.width ?? component?.width ?? 20) || 20;
    const height = Number(position?.height ?? component?.height ?? 10) || 10;
    const x = Number(position?.x ?? 0) || 0;
    const y = Number(position?.y ?? 0) || 0;

    return Object.freeze({
      id: String(component.id ?? ''),
      name: String(component.name ?? ''),
      type: String(component.package ?? component.category ?? 'unknown'),
      category: String(component.category ?? 'OTHER'),
      net: String(
        netEngine?.getNetName?.(component.id) ??
        component?.electrical_line ??
        'GND',
      ),
      voltage: String(
        netEngine?.getNetVoltage?.(component.id) ??
        component?.voltage ??
        '0V',
      ),
      layer: String(component.side ?? 'top'),
      x,
      y,
      width,
      height,
      hasRealCoords: Boolean(position?.hasRealCoords),
      description: component?.description,
      partCode: component?.part_code,
      status: 'detected',
    });
  }
}
