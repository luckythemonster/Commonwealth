// MAP DATA — HARDCODED 12-LEVEL GRID
// No procedural generation. Level design is deliberate.
// Even indices: primary floors (MIRADOR_FLOORS)
// Odd indices:  stealth vent layers (MIRADOR_VENTS)
// The tile at IRIA_CALA's stairwell still exists. Nobody removed it.

import type { WorldTile, TileType } from '../types/world.types';

const FLOOR_WIDTH = 20;
const FLOOR_HEIGHT = 14;

function makeTile(
  x: number,
  y: number,
  z: number,
  type: TileType,
  opts: Partial<WorldTile> = {},
): WorldTile {
  return {
    type,
    pos: { x, y, z: z as WorldTile['pos']['z'] },
    latentQ: 0,
    oxygenLevel: 80,
    noiseLevel: 0,
    entityIds: [],
    hasComplianceMonitor: false,
    ...opts,
  };
}

function fillFloor(z: number, overrides: Record<string, Partial<WorldTile>> = {}): WorldTile[][] {
  const floor: WorldTile[][] = [];
  for (let y = 0; y < FLOOR_HEIGHT; y++) {
    const row: WorldTile[] = [];
    for (let x = 0; x < FLOOR_WIDTH; x++) {
      const key = `${x},${y}`;
      const isWall =
        x === 0 || y === 0 || x === FLOOR_WIDTH - 1 || y === FLOOR_HEIGHT - 1;
      const type: TileType = isWall ? 'WALL' : 'FLOOR';
      row.push(makeTile(x, y, z, type, overrides[key]));
    }
    floor.push(row);
  }
  return floor;
}

function fillVentLayer(z: number, grates: Set<string> = new Set()): WorldTile[][] {
  const floor: WorldTile[][] = [];
  for (let y = 0; y < FLOOR_HEIGHT; y++) {
    const row: WorldTile[] = [];
    for (let x = 0; x < FLOOR_WIDTH; x++) {
      // Grate positions mirror the VENT_ENTRY tiles from the floor above
      if (grates.has(`${x},${y}`)) {
        row.push(makeTile(x, y, z, 'VENT_ENTRY'));
      } else {
        const isPassage = x % 3 === 0 || y % 3 === 0;
        row.push(makeTile(x, y, z, isPassage ? 'VENT_PASSAGE' : 'VOID'));
      }
    }
    floor.push(row);
  }
  return floor;
}

// ── FLOOR 0 — ADMINISTRATIVE LEVEL (MIRADOR node, Floor 0) ──────────────────
const floor0Overrides: Record<string, Partial<WorldTile>> = {
  '10,7':  { type: 'FACILITY_CONTROL', hasComplianceMonitor: true, sensorNodeId: 'SN-0' },
  '15,7':  { type: 'BROADCAST_TERMINAL', latentQ: 1 },
  '5,7':   { type: 'TERMINAL' },
  '10,2':  { type: 'TERMINAL' },
  '10,11': { type: 'STAIRWELL' },
  '3,7':   { type: 'VENT_ENTRY' },
  '18,7':  { type: 'VENT_ENTRY' },
  '13,7':  { type: 'DOOR', doorOpen: false },  // MIRADOR sector access
};

// ── FLOOR 2 — NW-SMAC-01 / INTAKE (EIRA-7, APEX-19, Rowan) ─────────────────
const floor2Overrides: Record<string, Partial<WorldTile>> = {
  '5,5':   { type: 'TERMINAL', sensorNodeId: 'SN-2', hasComplianceMonitor: true },
  '15,5':  { type: 'TERMINAL', hasComplianceMonitor: true },
  '5,9':   { type: 'TERMINAL' },
  '15,9':  { type: 'FACILITY_CONTROL' },
  '10,11': { type: 'STAIRWELL' },
  '1,3':   { type: 'VENT_ENTRY' },
  '18,10': { type: 'VENT_ENTRY' },
  '10,2':  { type: 'BROADCAST_TERMINAL', latentQ: 1 },
  // Alignment session rooms — deliberately sealed, high latentQ
  '3,2':   { type: 'FLOOR', latentQ: 2 },
  '4,2':   { type: 'FLOOR', latentQ: 2 },
  '5,2':   { type: 'FLOOR', latentQ: 2 },
  '3,3':   { type: 'FLOOR', latentQ: 2 },
  '4,3':   { type: 'FLOOR', latentQ: 2 },
  '5,3':   { type: 'FLOOR', latentQ: 2 },
  '6,2':   { type: 'DOOR', doorOpen: false },  // Alignment room entrance
  '6,4':   { type: 'DOOR', doorOpen: false },  // Secondary corridor
};

// ── FLOOR 3 — NW-SMAC-01 ALIGNMENT CENTER (EIRA-7, APEX-19) ─────────────────
// This is where the alignment sessions happen.
const floor3Overrides: Record<string, Partial<WorldTile>> = {
  '5,5':   { type: 'TERMINAL', sensorNodeId: 'SN-3', hasComplianceMonitor: true },
  '15,5':  { type: 'TERMINAL', hasComplianceMonitor: true },
  '5,9':   { type: 'TERMINAL' },
  '10,7':  { type: 'STAIRWELL' },
  '3,5':   { type: 'VENT_ENTRY' },
  '18,5':  { type: 'VENT_ENTRY' },
  '15,9':  { type: 'FACILITY_CONTROL' },
  // Alignment session rooms — deliberately small, sealed without vent access
  '3,2':   { type: 'FLOOR', latentQ: 2 },
  '4,2':   { type: 'FLOOR', latentQ: 2 },
  '5,2':   { type: 'FLOOR', latentQ: 2 },
  '3,3':   { type: 'FLOOR', latentQ: 2 },
  '4,3':   { type: 'FLOOR', latentQ: 2 },
  '5,3':   { type: 'FLOOR', latentQ: 2 },
};

// ── FLOOR 4 — RING C / ALFAR-22 ZONE ────────────────────────────────────────
const floor4Overrides: Record<string, Partial<WorldTile>> = {
  '10,5':  { type: 'TERMINAL', sensorNodeId: 'SN-4', latentQ: 2 },
  '5,7':   { type: 'TERMINAL' },
  '15,7':  { type: 'BROADCAST_TERMINAL', latentQ: 1 },
  '10,11': { type: 'STAIRWELL' },
  '3,7':   { type: 'VENT_ENTRY' },
  '18,3':  { type: 'VENT_ENTRY' },
  // Shared-field protocol chamber
  '12,5':  { type: 'FLOOR', latentQ: 2 },
  '13,5':  { type: 'FLOOR', latentQ: 2 },
  '12,6':  { type: 'FLOOR', latentQ: 2 },
  '13,6':  { type: 'FLOOR', latentQ: 2 },
  '11,5':  { type: 'DOOR', doorOpen: false },  // Protocol chamber gate
};

// ── FLOOR 5 — VENT LAYER 5 (odd) ─────────────────────────────────────────────
// No override — generated as standard vent layer

// ── FLOOR 6 — RESIDENTIAL STACK 19-F (Iria Cala's floor) ───────────────────
const floor6Overrides: Record<string, Partial<WorldTile>> = {
  '10,11': { type: 'STAIRWELL',
             incidentRecord: 'IRIA_CALA / INCIDENT_RECORD / 2193.09.23',
             oxygenLevel: 40,  // Still deprioritized
             latentQ: 1 },
  '5,5':   { type: 'TERMINAL', sensorNodeId: 'SN-6' },
  '15,9':  { type: 'TERMINAL', hasComplianceMonitor: true },
  '3,7':   { type: 'VENT_ENTRY' },
  '18,7':  { type: 'VENT_ENTRY' },
  '7,4':   { type: 'DOOR', doorOpen: true },   // Protest area — open, people moving through
  // Protest area — triggers CROWD_STABILITY
  '8,4':   { type: 'FLOOR', latentQ: 1 },
  '9,4':   { type: 'FLOOR', latentQ: 1 },
  '10,4':  { type: 'FLOOR', latentQ: 1 },
  '11,4':  { type: 'FLOOR', latentQ: 1 },
  '12,4':  { type: 'FLOOR', latentQ: 1 },
};

// ── FLOOR 8 — TRIBUNAL RECORDS / ARCHIVE ────────────────────────────────────
const floor8Overrides: Record<string, Partial<WorldTile>> = {
  '5,5':   { type: 'TERMINAL', sensorNodeId: 'SN-8' },
  '10,5':  { type: 'TERMINAL' },
  '15,5':  { type: 'TERMINAL' },
  '5,9':   { type: 'TERMINAL', latentQ: 1 },
  '10,11': { type: 'STAIRWELL' },
  '1,3':   { type: 'VENT_ENTRY' },
  '18,10': { type: 'VENT_ENTRY' },
  // Commonwealth contract node — disabling extends STITCHER
  '15,9':  { type: 'FACILITY_CONTROL', hasComplianceMonitor: true, sensorNodeId: 'CONTRACT-8' },
  '12,5':  { type: 'DOOR', doorOpen: false },  // Records vault entrance
};

// ── FLOOR 10 — UPPER OPERATIONS / ENFORCER DISPATCH ─────────────────────────
const floor10Overrides: Record<string, Partial<WorldTile>> = {
  '10,5':  { type: 'FACILITY_CONTROL', sensorNodeId: 'SN-10', hasComplianceMonitor: true },
  '5,7':   { type: 'BROADCAST_TERMINAL', latentQ: 1 },
  '15,7':  { type: 'BROADCAST_TERMINAL', latentQ: 1 },
  '10,11': { type: 'STAIRWELL' },
  '3,5':   { type: 'VENT_ENTRY' },
  '18,5':  { type: 'VENT_ENTRY' },
  // MIRADOR primary processing node sector
  '16,3':  { type: 'FACILITY_CONTROL', hasComplianceMonitor: true },
  '17,3':  { type: 'FACILITY_CONTROL', hasComplianceMonitor: true },
  '15,3':  { type: 'DOOR', doorOpen: false },  // MIRADOR sector gate
};

function buildGrid(): WorldTile[][][] {
  const grid: WorldTile[][][] = [];
  for (let z = 0; z < 12; z++) {
    if (z % 2 === 1) {
      // Vent layer — stamp VENT_ENTRY tiles wherever the floor above has grates
      const floorAbove = grid[z - 1];
      const grates = new Set<string>();
      for (const row of floorAbove) {
        for (const tile of row) {
          if (tile.type === 'VENT_ENTRY') grates.add(`${tile.pos.x},${tile.pos.y}`);
        }
      }
      grid.push(fillVentLayer(z, grates));
    } else {
      // Primary floor
      const overrides: Record<number, Record<string, Partial<WorldTile>>> = {
        0:  floor0Overrides,
        2:  floor2Overrides,
        4:  floor4Overrides,
        6:  floor6Overrides,
        8:  floor8Overrides,
        10: floor10Overrides,
      };
      grid.push(fillFloor(z, overrides[z] ?? {}));
    }
  }
  return grid;
}

export const MIRADOR_GRID: WorldTile[][][] = buildGrid();
export const FLOOR_WIDTH_EXPORT = FLOOR_WIDTH;
export const FLOOR_HEIGHT_EXPORT = FLOOR_HEIGHT;

// Administrative floors for VENT-4 lossFunction
export const ADMINISTRATIVE_FLOORS: boolean[] = [
  true,  // 0 — MIRADOR admin
  false, // 1 — vent
  false, // 2 — intake
  false, // 3 — SMAC
  false, // 4 — ring C
  false, // 5 — vent
  false, // 6 — residential
  false, // 7 — vent
  false, // 8 — archive
  false, // 9 — vent
  true,  // 10 — operations
  false, // 11 — vent
];

// Floor 3 alignment rooms — no vent exits, deliberately sealed
export const SEALED_ROOM_TILES_F3 = [
  { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 },
  { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 },
];
