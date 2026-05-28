/**
 * BoardMockDataFactory.ts
 * src/integration/boardview/BoardMockDataFactory.ts
 *
 * Deterministic mock board data generator.
 * Produces realistic-looking PCB component layouts with no randomness.
 *
 * All geometry is derived from integer grid math and deterministic hashing.
 * Same seed → same board every time.
 *
 * Zero dependencies. No React. No DOM. No network. No filesystem.
 */

import type {
  BoardData,
  ComponentData,
  BoardBounds,
} from "../../components/boardview/InteractiveBoardCanvas";

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic hash (same algorithm as TraceLayer for consistency)
// ─────────────────────────────────────────────────────────────────────────────

function hash2(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x6c62272e);
  h = Math.imul(h ^ b, 0x85ebca6b);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h & 0xffffffff;
  }
  return (h >>> 0) / 0x100000000;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock component templates — realistic PCB component archetypes
// ─────────────────────────────────────────────────────────────────────────────

interface ComponentTemplate {
  idPrefix: string;
  type: string;
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
  nets: string[];
}

const COMPONENT_TEMPLATES: ComponentTemplate[] = [
  { idPrefix: "U",  type: "cpu",       minW: 80,  maxW: 140, minH: 80,  maxH: 120, nets: ["VCC", "GND", "DATA"] },
  { idPrefix: "U",  type: "pmic",      minW: 40,  maxW: 70,  minH: 40,  maxH: 70,  nets: ["VCC", "GND", "BATT"] },
  { idPrefix: "U",  type: "rf-wifi",   minW: 30,  maxW: 50,  minH: 30,  maxH: 50,  nets: ["VCC", "GND", "RF_ANT"] },
  { idPrefix: "C",  type: "component", minW: 4,   maxW: 10,  minH: 4,   maxH: 10,  nets: ["VCC", "GND"] },
  { idPrefix: "R",  type: "component", minW: 3,   maxW: 8,   minH: 3,   maxH: 6,   nets: ["DATA", "GND"] },
  { idPrefix: "L",  type: "shield",    minW: 20,  maxW: 40,  minH: 20,  maxH: 40,  nets: ["GND"] },
  { idPrefix: "J",  type: "connector", minW: 15,  maxW: 30,  minH: 8,   maxH: 15,  nets: ["VBUS", "GND", "DATA"] },
  { idPrefix: "IC", type: "component", minW: 20,  maxW: 45,  minH: 15,  maxH: 35,  nets: ["VCC", "GND", "I2C"] },
];

// ─────────────────────────────────────────────────────────────────────────────
// Mock net definitions
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_NETS = [
  "VCC", "GND", "BATT", "DATA", "I2C", "SPI",
  "UART", "RF_ANT", "VBUS", "USB_DP", "USB_DN",
];

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface MockBoardConfig {
  /** Board width in layout units. Default: 800 */
  boardWidth?: number;
  /** Board height in layout units. Default: 480 */
  boardHeight?: number;
  /** Number of components to generate. Default: 48 */
  componentCount?: number;
  /** Board id. Default: "mock-board-a125f" */
  boardId?: string;
}

/**
 * createMockBoardData()
 *
 * Produces a deterministic BoardData object suitable for testing and
 * fallback rendering when no real board data is available.
 *
 * Determinism guarantee: same config → byte-identical output.
 * No Math.random(). No Date.now(). No external state.
 */
export function createMockBoardData(config: MockBoardConfig = {}): BoardData {
  const {
    boardWidth    = 800,
    boardHeight   = 480,
    componentCount = 48,
    boardId       = "mock-board-a125f",
  } = config;

  const bounds: BoardBounds = { x: 0, y: 0, width: boardWidth, height: boardHeight };
  const components: ComponentData[] = [];
  const netMembership = new Map<string, string[]>();

  // Initialize net membership map
  for (const netId of MOCK_NETS) {
    netMembership.set(netId, []);
  }

  // Component counters per prefix
  const counters: Record<string, number> = {};

  // Grid-based placement — avoids overlap via cell reservation
  const PADDING   = 12;
  const GRID_COLS = 10;
  const GRID_ROWS = 6;
  const cellW = (boardWidth  - PADDING * 2) / GRID_COLS;
  const cellH = (boardHeight - PADDING * 2) / GRID_ROWS;

  // Shuffle cell order deterministically using hash
  const cells: Array<{ col: number; row: number }> = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      cells.push({ col, row });
    }
  }

  // Sort cells by hash value — deterministic "shuffle"
  cells.sort((a, b) => {
    const ha = hash2(a.col * 31 + a.row, 0xdeadbeef);
    const hb = hash2(b.col * 31 + b.row, 0xdeadbeef);
    return ha - hb;
  });

  const usedCells = new Set<number>();
  const count = Math.min(componentCount, cells.length);

  for (let i = 0; i < count; i++) {
    const cell = cells[i];
    const cellIndex = cell.row * GRID_COLS + cell.col;

    if (usedCells.has(cellIndex)) continue;
    usedCells.add(cellIndex);

    // Select template deterministically from position
    const templateIdx = Math.floor(hash2(i, 0x1234abcd) * COMPONENT_TEMPLATES.length);
    const template = COMPONENT_TEMPLATES[templateIdx];

    // Generate id
    counters[template.idPrefix] = (counters[template.idPrefix] || 0) + 1;
    const id = `${template.idPrefix}${counters[template.idPrefix]}`;

    // Deterministic size within template bounds
    const wRatio = hash2(i, 0xaaaa1111);
    const hRatio = hash2(i, 0xbbbb2222);
    const compW = Math.round(template.minW + wRatio * (template.maxW - template.minW));
    const compH = Math.round(template.minH + hRatio * (template.maxH - template.minH));

    // Center within cell with deterministic sub-cell offset
    const cellOriginX = PADDING + cell.col * cellW;
    const cellOriginY = PADDING + cell.row * cellH;
    const maxOffsetX = Math.max(0, cellW - compW - 4);
    const maxOffsetY = Math.max(0, cellH - compH - 4);
    const offsetX = Math.floor(hash2(i, 0xcccc3333) * maxOffsetX);
    const offsetY = Math.floor(hash2(i, 0xdddd4444) * maxOffsetY);

    const x = Math.round(cellOriginX + offsetX);
    const y = Math.round(cellOriginY + offsetY);

    // Assign nets from template
    const compNets = template.nets.filter((_, ni) =>
      hash2(i, ni * 0x5555) > 0.25 // ~75% chance per net
    );
    if (compNets.length === 0) compNets.push("GND"); // always at least GND

    for (const netId of compNets) {
      const members = netMembership.get(netId);
      if (members) members.push(id);
    }

    components.push({
      id,
      x,
      y,
      width:    compW,
      height:   compH,
      type:     template.type,
      nets:     compNets,
      metadata: {
        templateType:  template.type,
        gridCol:       cell.col,
        gridRow:       cell.row,
        mockGenerated: true,
      },
    });
  }

  // Build net array
  const nets = MOCK_NETS.map((netId) => ({
    id: netId,
    components: (netMembership.get(netId) || []).sort(),
  })).filter((n) => n.components.length > 0);

  return {
    id: boardId,
    bounds,
    components,
    nets,
  };
}

/**
 * createMinimalMockBoard()
 *
 * Smallest valid board for unit testing — 5 components, 2 nets.
 * Useful as a fallback when no config is provided.
 */
export function createMinimalMockBoard(): BoardData {
  return {
    id:     "mock-minimal",
    bounds: { x: 0, y: 0, width: 400, height: 240 },
    components: [
      { id: "U1",  x: 60,  y: 60,  width: 100, height: 80,  type: "cpu",       nets: ["VCC","GND","DATA"] },
      { id: "U2",  x: 240, y: 60,  width: 60,  height: 60,  type: "pmic",      nets: ["VCC","GND","BATT"] },
      { id: "C1",  x: 160, y: 180, width: 10,  height: 10,  type: "component", nets: ["VCC","GND"] },
      { id: "R1",  x: 200, y: 180, width: 8,   height: 6,   type: "component", nets: ["DATA","GND"] },
      { id: "J1",  x: 300, y: 170, width: 25,  height: 12,  type: "connector", nets: ["VBUS","GND","DATA"] },
    ],
    nets: [
      { id: "VCC",  components: ["C1","U1","U2"] },
      { id: "GND",  components: ["C1","J1","R1","U1","U2"] },
      { id: "DATA", components: ["J1","R1","U1"] },
      { id: "BATT", components: ["U2"] },
      { id: "VBUS", components: ["J1"] },
    ],
  };
}

/**
 * seedMockConnectivityEngine()
 *
 * Populates a NetConnectivityEngine with the components and connections
 * from a BoardData object. Returns the engine after buildGraph().
 *
 * Pure adapter — no side effects beyond engine mutations.
 */
export function seedMockConnectivityEngine(
  engine: {
    registerComponents: (c: Array<{ id: string; nets?: string[]; metadata?: Record<string, unknown> }>) => void;
    registerConnections: (c: Array<{ componentA: string; componentB: string; netId: string }>) => void;
    buildGraph: () => void;
  },
  boardData: BoardData
): void {
  // Register all components
  engine.registerComponents(
    boardData.components.map((c) => ({
      id:       c.id,
      nets:     c.nets || [],
      metadata: c.metadata || {},
    }))
  );

  // Register explicit net connections
  const connections: Array<{ componentA: string; componentB: string; netId: string }> = [];

  for (const net of boardData.nets || []) {
    const members = net.components;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        connections.push({
          componentA: members[i],
          componentB: members[j],
          netId:      net.id,
        });
      }
    }
  }

  engine.registerConnections(connections);
  engine.buildGraph();
}

// Expose hash utility for downstream deterministic tests
export { hash2, hashStr };
