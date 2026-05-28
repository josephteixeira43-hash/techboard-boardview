/**
 * NetConnectivityEngine.ts
 * src/core/boardview/NetConnectivityEngine.ts
 *
 * Pure TypeScript deterministic electrical connectivity engine.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Two primary index structures maintained independently:
 *
 *   Component index  (_componentIndex)
 *     Map<componentId, ComponentNode>
 *     ComponentNode: { id, nets: Set<netId>, metadata }
 *
 *   Net index  (_netIndex)
 *     Map<netId, NetNode>
 *     NetNode: { id, components: Set<componentId> }
 *
 * Derived adjacency graph  (_adjMap, _edgeMap)
 *   Built on demand by buildGraph().
 *   _adjMap:  Map<componentId, Set<componentId>>  — bidirectional neighbor sets
 *   _edgeMap: Map<edgeKey, EdgeEntry>              — O(1) edge lookup
 *   edgeKey:  `${sortedIdA}|${sortedIdB}`          — always canonical (A ≤ B)
 *
 * Graph topology:
 *   Each net acts as a "hub" — all components in a net are fully connected
 *   to each other (complete subgraph per net). This matches real PCB
 *   electrical connectivity where all pins on a net are equipotential.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DETERMINISM GUARANTEES
 * ─────────────────────────────────────────────────────────────────────────
 *   1. No Math.random(), Date.now(), or performance.now() in any logic path.
 *   2. All traversals iterate over sorted arrays — never raw Map/Set iteration.
 *   3. BFS queue is an explicit array with a head pointer (no array.shift()).
 *   4. Tie-breaking: component id lexicographic ASC, then net id lexicographic ASC.
 *   5. Same input (registerComponents + registerConnections) → same buildGraph().
 *   6. Same graph + same query → same output every time.
 *   7. Snapshot objects are frozen — callers cannot mutate engine state.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PERFORMANCE
 * ─────────────────────────────────────────────────────────────────────────
 *   - O(1) node lookup via Map
 *   - O(E+V) BFS traversal
 *   - No recursion anywhere — iterative BFS and DFS only
 *   - 100k+ node support: adjacency stored as Sets, not matrices
 *   - Immutable snapshots: Object.freeze() on returned objects
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FAILURE ISOLATION
 * ─────────────────────────────────────────────────────────────────────────
 *   All public API methods are wrapped in try/catch.
 *   Malformed inputs are silently ignored.
 *   No public method ever throws to the caller.
 *   Cyclic graphs are handled safely by BFS visited tracking.
 *   Disconnected graphs are fully supported.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public identifier
// ─────────────────────────────────────────────────────────────────────────────

export const NET_CONNECTIVITY_ENGINE_ID = "net-connectivity-engine" as const;

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** A component to be registered in the graph */
export interface ComponentInput {
  /** Unique component identifier — non-empty string, no whitespace */
  id: string;
  /** Net IDs this component belongs to */
  nets?: string[];
  /** Arbitrary metadata — stored and returned, never interpreted */
  metadata?: Record<string, unknown>;
}

/** A connection between two components via a named net */
export interface ConnectionInput {
  /** Component A identifier */
  componentA: string;
  /** Component B identifier */
  componentB: string;
  /** Net this connection belongs to */
  netId: string;
}

/** Immutable snapshot of a registered component */
export interface ComponentSnapshot {
  readonly id: string;
  readonly nets: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** Immutable snapshot of a registered net */
export interface NetSnapshot {
  readonly id: string;
  readonly components: readonly string[];
}

/** Immutable snapshot of an edge between two components */
export interface EdgeSnapshot {
  readonly componentA: string;
  readonly componentB: string;
  readonly netId: string;
}

/** Immutable snapshot of the full graph state */
export interface GraphSnapshot {
  readonly componentCount: number;
  readonly netCount: number;
  readonly edgeCount: number;
  readonly components: readonly ComponentSnapshot[];
  readonly nets: readonly NetSnapshot[];
  readonly edges: readonly EdgeSnapshot[];
  readonly isBuilt: boolean;
}

/** Result of a connectivity group query */
export interface ConnectivityGroup {
  /** All component IDs reachable from the query root, including the root */
  readonly members: readonly string[];
  /** Net IDs that connect members within this group */
  readonly nets: readonly string[];
}

/** Result of getShortestPath() */
export interface PathResult {
  /** Ordered component IDs from source to target, inclusive */
  readonly path: readonly string[];
  /** true if a path was found */
  readonly reachable: boolean;
  /** Number of hops (edges) in the path */
  readonly hopCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface ComponentNode {
  id: string;
  nets: Set<string>;
  metadata: Record<string, unknown>;
}

interface NetNode {
  id: string;
  components: Set<string>;
}

interface EdgeEntry {
  componentA: string; // always the lexicographically smaller id
  componentB: string;
  netIds: Set<string>; // multiple nets can share the same component pair
}

// ─────────────────────────────────────────────────────────────────────────────
// Public interface
// ─────────────────────────────────────────────────────────────────────────────

export interface NetConnectivityEngine {
  /**
   * Register components in bulk.
   * Duplicate IDs are silently skipped (first registration wins).
   * Malformed entries (missing/empty id) are silently ignored.
   * Does NOT automatically rebuild the graph — call buildGraph() after.
   */
  registerComponents(components: ComponentInput[]): void;

  /**
   * Register explicit connections between component pairs via a net.
   * Both components must already be registered; unregistered references
   * are silently ignored.
   * Net IDs that do not exist are auto-created.
   * Does NOT automatically rebuild the graph — call buildGraph() after.
   */
  registerConnections(connections: ConnectionInput[]): void;

  /**
   * Build (or rebuild) the adjacency graph from current index state.
   * Must be called before any traversal queries.
   * Idempotent — safe to call multiple times.
   * O(N²) per net in the worst case (complete subgraph per net),
   * but typical PCBs have small per-net component counts.
   */
  buildGraph(): void;

  /**
   * Get an immutable net snapshot by id.
   * Returns null if not found — never throws.
   */
  getNetById(netId: string): NetSnapshot | null;

  /**
   * Get all components directly connected to the given component via any shared net.
   * Returns empty array for unknown components or unbuilt graph.
   * Order: lexicographic by component id.
   */
  getNeighbors(componentId: string): readonly string[];

  /**
   * Get all connections (edges) for a given component.
   * Returns empty array for unknown components.
   * Order: lexicographic by neighbor id, then by net id.
   */
  getConnectionsForComponent(componentId: string): readonly EdgeSnapshot[];

  /**
   * Returns all components reachable from the given component
   * (BFS traversal of the full connected subgraph).
   * Includes the source component.
   * Returns ConnectivityGroup with empty members for unknown components.
   */
  getConnectedComponents(componentId: string): ConnectivityGroup;

  /**
   * Returns true if componentA and componentB are connected
   * (directly or via intermediate components).
   * Returns false for unknown components or unbuilt graph.
   */
  areConnected(componentA: string, componentB: string): boolean;

  /**
   * Returns the shortest path (by hop count) between source and target.
   * Uses deterministic BFS with lexicographic tie-breaking.
   * Returns { path: [], reachable: false, hopCount: 0 } if unreachable.
   * Returns { path: [id], reachable: true, hopCount: 0 } if source === target.
   * Never throws.
   */
  getShortestPath(sourceId: string, targetId: string): PathResult;

  /**
   * Returns a full immutable snapshot of the current graph state.
   * All arrays are sorted deterministically.
   * Safe to serialize to JSON.
   */
  getNetSnapshot(): GraphSnapshot;

  /**
   * Clear all registered components, nets, and the built graph.
   * Resets engine to initial empty state.
   */
  clear(): void;

  /** Returns the number of registered components */
  componentCount(): number;

  /** Returns the number of registered nets */
  netCount(): number;

  /** Returns true if buildGraph() has been called since last mutation */
  isBuilt(): boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers — pure functions, no side effects
// ─────────────────────────────────────────────────────────────────────────────

/** Validate a string id: non-empty, string type */
function isValidId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0;
}

/**
 * Build a canonical edge key from two component IDs.
 * Key is always `${smaller}|${larger}` to ensure A→B and B→A
 * produce the same key (bidirectional O(1) lookup).
 */
function edgeKey(idA: string, idB: string): string {
  return idA <= idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

/**
 * Sort an array of strings lexicographically.
 * Returns a new sorted array — does not mutate input.
 */
function sortedStrings(arr: Iterable<string>): string[] {
  return Array.from(arr).sort();
}

/**
 * Freeze an object shallowly and return it typed as readonly.
 * Used on all snapshot objects returned to callers.
 */
function frozen<T extends object>(obj: T): Readonly<T> {
  return Object.freeze(obj);
}

// ─────────────────────────────────────────────────────────────────────────────
// BFS implementation — iterative, no recursion, cyclic-safe
//
// Uses an explicit queue array with a `head` pointer instead of array.shift()
// to avoid O(N²) shifting cost on large graphs.
//
// Traversal order: neighbors are visited in lexicographic order of component id.
// This guarantees deterministic BFS traversal regardless of insertion order.
// ─────────────────────────────────────────────────────────────────────────────

interface BFSResult {
  /** All visited node ids in BFS discovery order */
  visited: string[];
  /** Parent map for path reconstruction: childId → parentId */
  parent: Map<string, string | null>;
}

/**
 * Run BFS from a start node on the given adjacency map.
 * Stops early if `stopAt` is provided and found (for pathfinding).
 */
function runBFS(
  startId: string,
  adjMap: Map<string, Set<string>>,
  stopAt?: string
): BFSResult {
  const visited = new Set<string>();
  const parent = new Map<string, string | null>();
  const queue: string[] = [];
  let head = 0;

  visited.add(startId);
  parent.set(startId, null);
  queue.push(startId);

  while (head < queue.length) {
    const current = queue[head++];

    if (stopAt !== undefined && current === stopAt) {
      break;
    }

    // Get neighbors — sorted for deterministic expansion order
    const neighbors = adjMap.get(current);
    if (!neighbors || neighbors.size === 0) continue;

    const sortedNeighbors = sortedStrings(neighbors);

    for (const neighbor of sortedNeighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parent.set(neighbor, current);
        queue.push(neighbor);
      }
    }
  }

  return {
    visited: Array.from(visited),
    parent,
  };
}

/**
 * Reconstruct path from BFS parent map.
 * Returns empty array if target was not reached.
 */
function reconstructPath(
  targetId: string,
  parent: Map<string, string | null>
): string[] {
  if (!parent.has(targetId)) return [];

  const path: string[] = [];
  let current: string | null = targetId;

  // Walk back from target to source via parent pointers
  // Maximum iterations bounded by graph size — no infinite loop possible
  // since BFS parent map is acyclic by construction
  let safety = parent.size + 1;

  while (current !== null && safety-- > 0) {
    path.push(current);
    current = parent.get(current) ?? null;
  }

  path.reverse();
  return path;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createNetConnectivityEngine()
 *
 * Creates a new, fully isolated NetConnectivityEngine instance.
 * No shared state between instances.
 * No globals, no singletons.
 *
 * Typical usage:
 *   const engine = createNetConnectivityEngine();
 *   engine.registerComponents([...]);
 *   engine.registerConnections([...]);
 *   engine.buildGraph();
 *   const path = engine.getShortestPath('U1', 'C14');
 */
export function createNetConnectivityEngine(): NetConnectivityEngine {

  // ── Private state ─────────────────────────────────────────────────────────

  let _componentIndex = new Map<string, ComponentNode>();
  let _netIndex       = new Map<string, NetNode>();
  let _adjMap         = new Map<string, Set<string>>();
  let _edgeMap        = new Map<string, EdgeEntry>();
  let _graphBuilt     = false;

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Get or create a net node.
   * Internal only — not exposed to callers.
   */
  function _ensureNet(netId: string): NetNode {
    let net = _netIndex.get(netId);
    if (!net) {
      net = { id: netId, components: new Set() };
      _netIndex.set(netId, net);
    }
    return net;
  }

  /**
   * Register a single bidirectional edge between two components via a net.
   * Idempotent — registering the same pair twice merges the net ids.
   * Internal to buildGraph().
   */
  function _registerEdge(idA: string, idB: string, netId: string): void {
    // Canonical key: smaller id first
    const key = edgeKey(idA, idB);
    const canonical = idA <= idB ? idA : idB;
    const other     = idA <= idB ? idB : idA;

    // Update adjacency sets (bidirectional)
    if (!_adjMap.has(idA)) _adjMap.set(idA, new Set());
    if (!_adjMap.has(idB)) _adjMap.set(idB, new Set());
    _adjMap.get(idA)!.add(idB);
    _adjMap.get(idB)!.add(idA);

    // Update edge map
    let edge = _edgeMap.get(key);
    if (!edge) {
      edge = { componentA: canonical, componentB: other, netIds: new Set() };
      _edgeMap.set(key, edge);
    }
    edge.netIds.add(netId);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  const engine: NetConnectivityEngine = {

    registerComponents(components: ComponentInput[]): void {
      try {
        if (!Array.isArray(components)) return;

        for (const comp of components) {
          // Silent validation
          if (!comp || !isValidId(comp.id)) continue;
          if (_componentIndex.has(comp.id)) continue; // first registration wins

          const node: ComponentNode = {
            id: comp.id,
            nets: new Set(),
            metadata: comp.metadata && typeof comp.metadata === "object"
              ? { ...comp.metadata }
              : {},
          };

          // Register component's declared nets
          if (Array.isArray(comp.nets)) {
            for (const netId of comp.nets) {
              if (!isValidId(netId)) continue;
              node.nets.add(netId);
              _ensureNet(netId).components.add(comp.id);
            }
          }

          _componentIndex.set(comp.id, node);
          _graphBuilt = false;
        }
      } catch {
        // Failure isolation — silent
      }
    },

    registerConnections(connections: ConnectionInput[]): void {
      try {
        if (!Array.isArray(connections)) return;

        for (const conn of connections) {
          // Silent validation
          if (!conn) continue;
          if (!isValidId(conn.componentA)) continue;
          if (!isValidId(conn.componentB)) continue;
          if (!isValidId(conn.netId)) continue;

          // Skip self-loops — electrically meaningless and pathologically
          // inflate adjacency sets
          if (conn.componentA === conn.componentB) continue;

          // Both components must be registered
          const nodeA = _componentIndex.get(conn.componentA);
          const nodeB = _componentIndex.get(conn.componentB);
          if (!nodeA || !nodeB) continue;

          // Associate components with net (bidirectional)
          nodeA.nets.add(conn.netId);
          nodeB.nets.add(conn.netId);

          const net = _ensureNet(conn.netId);
          net.components.add(conn.componentA);
          net.components.add(conn.componentB);

          _graphBuilt = false;
        }
      } catch {
        // Failure isolation — silent
      }
    },

    buildGraph(): void {
      try {
        // Reset derived structures
        _adjMap  = new Map();
        _edgeMap = new Map();

        // Ensure all registered components appear in adjMap as isolated nodes
        // even if they have no connections (supports isolated node queries)
        for (const id of _componentIndex.keys()) {
          if (!_adjMap.has(id)) {
            _adjMap.set(id, new Set());
          }
        }

        // Build adjacency from nets:
        // For each net, connect every pair of member components (complete subgraph)
        // Sort members first for deterministic edge registration order
        for (const net of _netIndex.values()) {
          if (net.components.size < 2) continue;

          const members = sortedStrings(net.components);

          // Only register edges between components that are in _componentIndex
          // (net may reference components registered via registerConnections
          // before registerComponents — be defensive)
          for (let i = 0; i < members.length; i++) {
            for (let j = i + 1; j < members.length; j++) {
              const idA = members[i];
              const idB = members[j];

              if (!_componentIndex.has(idA) || !_componentIndex.has(idB)) continue;
              _registerEdge(idA, idB, net.id);
            }
          }
        }

        _graphBuilt = true;
      } catch {
        // Failure isolation — mark as not built
        _graphBuilt = false;
      }
    },

    getNetById(netId: string): NetSnapshot | null {
      try {
        if (!isValidId(netId)) return null;

        const net = _netIndex.get(netId);
        if (!net) return null;

        return frozen<NetSnapshot>({
          id: net.id,
          components: Object.freeze(sortedStrings(net.components)),
        });
      } catch {
        return null;
      }
    },

    getNeighbors(componentId: string): readonly string[] {
      try {
        if (!isValidId(componentId) || !_graphBuilt) return Object.freeze([]);

        const neighbors = _adjMap.get(componentId);
        if (!neighbors || neighbors.size === 0) return Object.freeze([]);

        return Object.freeze(sortedStrings(neighbors));
      } catch {
        return Object.freeze([]);
      }
    },

    getConnectionsForComponent(componentId: string): readonly EdgeSnapshot[] {
      try {
        if (!isValidId(componentId)) return Object.freeze([]);

        const results: EdgeSnapshot[] = [];
        const component = _componentIndex.get(componentId);
        if (!component) return Object.freeze([]);

        // Collect all nets this component belongs to
        for (const netId of sortedStrings(component.nets)) {
          const net = _netIndex.get(netId);
          if (!net) continue;

          // For each other component in this net, build an EdgeSnapshot
          const others = sortedStrings(net.components).filter(
            (id) => id !== componentId
          );

          for (const otherId of others) {
            results.push(frozen<EdgeSnapshot>({
              componentA: componentId,
              componentB: otherId,
              netId,
            }));
          }
        }

        // Sort: primary = componentB lexicographic, secondary = netId lexicographic
        results.sort((a, b) => {
          const bComp = a.componentB.localeCompare(b.componentB);
          if (bComp !== 0) return bComp;
          return a.netId.localeCompare(b.netId);
        });

        return Object.freeze(results);
      } catch {
        return Object.freeze([]);
      }
    },

    getConnectedComponents(componentId: string): ConnectivityGroup {
      const empty: ConnectivityGroup = frozen({ members: Object.freeze([]), nets: Object.freeze([]) });

      try {
        if (!isValidId(componentId) || !_graphBuilt) return empty;
        if (!_componentIndex.has(componentId)) return empty;

        const { visited } = runBFS(componentId, _adjMap);

        // Collect net ids that connect members within this group
        const visitedSet = new Set(visited);
        const groupNets = new Set<string>();

        for (const memberId of visited) {
          const comp = _componentIndex.get(memberId);
          if (!comp) continue;
          for (const netId of comp.nets) {
            const net = _netIndex.get(netId);
            if (!net) continue;
            // Include net only if it connects components within the group
            for (const netMember of net.components) {
              if (visitedSet.has(netMember)) {
                groupNets.add(netId);
                break;
              }
            }
          }
        }

        return frozen<ConnectivityGroup>({
          members: Object.freeze(sortedStrings(visited)),
          nets: Object.freeze(sortedStrings(groupNets)),
        });
      } catch {
        return empty;
      }
    },

    areConnected(componentA: string, componentB: string): boolean {
      try {
        if (!isValidId(componentA) || !isValidId(componentB)) return false;
        if (!_graphBuilt) return false;
        if (componentA === componentB) return _componentIndex.has(componentA);
        if (!_componentIndex.has(componentA)) return false;
        if (!_componentIndex.has(componentB)) return false;

        // O(1) check via edge map if directly connected
        const key = edgeKey(componentA, componentB);
        if (_edgeMap.has(key)) return true;

        // Otherwise BFS (stops early at target)
        const { parent } = runBFS(componentA, _adjMap, componentB);
        return parent.has(componentB);
      } catch {
        return false;
      }
    },

    getShortestPath(sourceId: string, targetId: string): PathResult {
      const unreachable: PathResult = frozen({ path: Object.freeze([]), reachable: false, hopCount: 0 });

      try {
        if (!isValidId(sourceId) || !isValidId(targetId)) return unreachable;
        if (!_graphBuilt) return unreachable;
        if (!_componentIndex.has(sourceId) || !_componentIndex.has(targetId)) return unreachable;

        // Trivial case: source === target
        if (sourceId === targetId) {
          return frozen<PathResult>({
            path: Object.freeze([sourceId]),
            reachable: true,
            hopCount: 0,
          });
        }

        // BFS from source, stop at target
        const { parent } = runBFS(sourceId, _adjMap, targetId);

        // Target not reached
        if (!parent.has(targetId)) return unreachable;

        // Reconstruct path
        const path = reconstructPath(targetId, parent);
        if (path.length === 0) return unreachable;

        return frozen<PathResult>({
          path: Object.freeze(path),
          reachable: true,
          hopCount: path.length - 1,
        });
      } catch {
        return unreachable;
      }
    },

    getNetSnapshot(): GraphSnapshot {
      const empty: GraphSnapshot = frozen({
        componentCount: 0,
        netCount: 0,
        edgeCount: 0,
        components: Object.freeze([]),
        nets: Object.freeze([]),
        edges: Object.freeze([]),
        isBuilt: false,
      });

      try {
        const components: ComponentSnapshot[] = sortedStrings(_componentIndex.keys())
          .map((id) => {
            const node = _componentIndex.get(id)!;
            return frozen<ComponentSnapshot>({
              id: node.id,
              nets: Object.freeze(sortedStrings(node.nets)),
              metadata: Object.freeze({ ...node.metadata }),
            });
          });

        const nets: NetSnapshot[] = sortedStrings(_netIndex.keys())
          .map((id) => {
            const node = _netIndex.get(id)!;
            return frozen<NetSnapshot>({
              id: node.id,
              components: Object.freeze(sortedStrings(node.components)),
            });
          });

        // Build edge list from _edgeMap — sorted for deterministic output
        const edgeKeys = sortedStrings(_edgeMap.keys());
        const edges: EdgeSnapshot[] = [];

        for (const key of edgeKeys) {
          const edge = _edgeMap.get(key)!;
          // One EdgeSnapshot per net per pair
          for (const netId of sortedStrings(edge.netIds)) {
            edges.push(frozen<EdgeSnapshot>({
              componentA: edge.componentA,
              componentB: edge.componentB,
              netId,
            }));
          }
        }

        return frozen<GraphSnapshot>({
          componentCount: _componentIndex.size,
          netCount: _netIndex.size,
          edgeCount: _edgeMap.size,
          components: Object.freeze(components),
          nets: Object.freeze(nets),
          edges: Object.freeze(edges),
          isBuilt: _graphBuilt,
        });
      } catch {
        return empty;
      }
    },

    clear(): void {
      try {
        _componentIndex = new Map();
        _netIndex       = new Map();
        _adjMap         = new Map();
        _edgeMap        = new Map();
        _graphBuilt     = false;
      } catch {
        // Failure isolation
      }
    },

    componentCount(): number {
      try { return _componentIndex.size; } catch { return 0; }
    },

    netCount(): number {
      try { return _netIndex.size; } catch { return 0; }
    },

    isBuilt(): boolean {
      try { return _graphBuilt; } catch { return false; }
    },
  };

  return engine;
}
