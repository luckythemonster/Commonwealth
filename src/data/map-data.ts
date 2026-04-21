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
      if (grates.has(`${x},${y}`)) {
        row.push(makeTile(x, y, z, 'VENT_ENTRY'));
      } else {
        // Passage at grid lines (every 3rd row/col) — creates a traversable lattice
        const isPassage = x % 3 === 0 || y % 3 === 0;
        row.push(makeTile(x, y, z, isPassage ? 'VENT_PASSAGE' : 'VOID'));
      }
    }
    floor.push(row);
  }
  return floor;
}

// VENT_EXIT_DOWN positions per vent layer (all on x%3=0 OR y%3=0 passable tiles)
// These grates exit downward to the even floor below (z+1)
const VENT_EXIT_DOWN_BY_LAYER: Record<number, { x: number; y: number }> = {
  1: { x: 9, y: 6 },  // vent 1 → exits to floor 2
  3: { x: 9, y: 9 },  // vent 3 → exits to floor 4
  5: { x: 12, y: 6 }, // vent 5 → exits to floor 6
  7: { x: 9, y: 9 },  // vent 7 → exits to floor 8
  9: { x: 12, y: 6 }, // vent 9 → exits to floor 10
};

// ── FLOOR 0 — ADMINISTRATIVE LEVEL (MIRADOR node) ───────────────────────────
// Layout: central E-W corridor (y=5..8) with N and S office blocks.
// North offices sealed by y=4 partition with doors at (8,4) and (12,4).
const floor0Overrides: Record<string, Partial<WorldTile>> = {
  // Functional tiles
  '10,7':  { type: 'FACILITY_CONTROL', hasComplianceMonitor: true, sensorNodeId: 'SN-0' },
  '15,7':  { type: 'BROADCAST_TERMINAL', latentQ: 1 },
  '5,7':   { type: 'TERMINAL' },
  '10,2':  { type: 'TERMINAL' },
  '10,11': { type: 'STAIRWELL' },
  '3,7':   { type: 'VENT_ENTRY' },
  '18,7':  { type: 'ELEVATOR' },          // elevator replaces old vent entry
  '13,7':  { type: 'DOOR', doorOpen: false },
  '12,7':  { itemId: 'emp-device-1' },
  // Locked stairwell approach door (restricted floor)
  '10,10': { type: 'DOOR', doorOpen: false, locked: true },
  // North office partition (y=4 horizontal wall)
  '2,4':   { type: 'WALL' }, '3,4': { type: 'WALL' }, '4,4': { type: 'WALL' },
  '5,4':   { type: 'WALL' }, '6,4': { type: 'WALL' }, '7,4': { type: 'WALL' },
  '8,4':   { type: 'DOOR', doorOpen: false },   // NW office entrance
  // gap at 9,4 and 10,4 and 11,4 — spine corridor
  '12,4':  { type: 'DOOR', doorOpen: false },   // NE office entrance
  '13,4':  { type: 'WALL' }, '14,4': { type: 'WALL' }, '15,4': { type: 'WALL' },
  '16,4':  { type: 'WALL' }, '17,4': { type: 'WALL' },
  // NW office internal divider (y=1..3, x=9 — separates terminal alcove from lobby)
  '9,1':   { type: 'WALL' }, '9,2': { type: 'WALL' }, '9,3': { type: 'WALL' },
  // Light sources
  '4,2':   { type: 'LIGHT_SOURCE', lightSourceOn: true },
  '16,2':  { type: 'LIGHT_SOURCE', lightSourceOn: true },
  '4,11':  { type: 'LIGHT_SOURCE', lightSourceOn: true },
  '16,11': { type: 'LIGHT_SOURCE', lightSourceOn: true },
};

// ── FLOOR 2 — NW-SMAC-01 / INTAKE (EIRA-7, APEX-19, Rowan) ─────────────────
// Layout: alignment rooms (NW corner), therapy corridor (y=6..8), observation south.
const floor2Overrides: Record<string, Partial<WorldTile>> = {
  // Functional tiles
  '5,5':   { type: 'TERMINAL', sensorNodeId: 'SN-2', hasComplianceMonitor: true },
  '15,5':  { type: 'TERMINAL', hasComplianceMonitor: true },
  '5,9':   { type: 'TERMINAL' },
  '15,9':  { type: 'FACILITY_CONTROL' },
  '10,11': { type: 'STAIRWELL' },
  '1,3':   { type: 'VENT_ENTRY' },
  '18,10': { type: 'VENT_ENTRY' },
  '18,7':  { type: 'ELEVATOR' },
  '10,2':  { type: 'BROADCAST_TERMINAL', latentQ: 1 },
  // Alignment session rooms (NW) — high latentQ, enclosed
  '3,2':   { type: 'FLOOR', latentQ: 2 }, '4,2': { type: 'FLOOR', latentQ: 2 }, '5,2': { type: 'FLOOR', latentQ: 2 },
  '3,3':   { type: 'FLOOR', latentQ: 2 }, '4,3': { type: 'FLOOR', latentQ: 2 }, '5,3': { type: 'FLOOR', latentQ: 2 },
  '6,2':   { type: 'DOOR', doorOpen: false },
  '6,4':   { type: 'DOOR', doorOpen: false },
  // Alignment room enclosure walls (x=6 column except doors; y=4 row except door)
  '6,1':   { type: 'WALL' }, '6,3': { type: 'WALL' }, '6,5': { type: 'WALL' },
  '2,4':   { type: 'WALL' }, '3,4': { type: 'WALL' }, '4,4': { type: 'WALL' }, '5,4': { type: 'WALL' },
  // Therapy corridor partition (y=6 partial wall to define corridor zone)
  '7,6':   { type: 'WALL' }, '8,6': { itemId: 'rapport-notes-1' }, // item preserved on open tile
  // Actually 8,6 must stay FLOOR — override wall at 7,6 but not 8,6
  // Observation south partition (y=10 partial)
  '7,10':  { type: 'WALL' }, '8,10': { type: 'WALL' }, '9,10': { type: 'WALL' },
  '11,10': { type: 'WALL' }, '12,10': { type: 'WALL' }, '13,10': { type: 'WALL' },
  // Items
  '7,5':   { itemId: 'lockpick-1' },
};

// ── FLOOR 4 — RING C / ALFAR-22 ZONE ────────────────────────────────────────
// Layout: central hub atrium (y=4..9, x=6..13), radial wings, protocol chamber NE.
const floor4Overrides: Record<string, Partial<WorldTile>> = {
  // Functional tiles
  '10,5':  { type: 'TERMINAL', sensorNodeId: 'SN-4', latentQ: 2 },
  '5,7':   { type: 'TERMINAL' },
  '15,7':  { type: 'BROADCAST_TERMINAL', latentQ: 1 },
  '10,11': { type: 'STAIRWELL' },
  '3,7':   { type: 'VENT_ENTRY' },
  '18,3':  { type: 'VENT_ENTRY' },
  '18,7':  { type: 'ELEVATOR' },
  // Protocol chamber (SE of center)
  '12,5':  { type: 'FLOOR', latentQ: 2 }, '13,5': { type: 'FLOOR', latentQ: 2 },
  '12,6':  { type: 'FLOOR', latentQ: 2 }, '13,6': { type: 'FLOOR', latentQ: 2 },
  '11,5':  { type: 'DOOR', doorOpen: false },
  // Inner hub walls — create a defined atrium with radial openings
  '6,4':   { type: 'WALL' }, '7,4': { type: 'WALL' }, '8,4': { type: 'WALL' },
  // gap at 9,4 and 10,4 — north radial corridor
  '11,4':  { type: 'WALL' }, '12,4': { type: 'WALL' }, '13,4': { type: 'WALL' },
  '6,9':   { type: 'WALL' }, '7,9': { type: 'WALL' }, '8,9': { type: 'WALL' },
  // gap at 9,9 and 10,9 — south radial corridor to stairwell
  '11,9':  { type: 'WALL' }, '12,9': { type: 'WALL' }, '13,9': { type: 'WALL' },
  '6,5':   { type: 'WALL' }, '6,6': { type: 'WALL' }, '6,7': { type: 'WALL' }, '6,8': { type: 'WALL' },
  // gap at 6,4 and 6,9 handled by above
  // Items
  '2,3':   { itemId: 'flashlight-1' },
  '14,7':  { itemId: 'vent-override-key-1' },
  '17,9':  { itemId: 'elevator-key-archive' },
  // Light sources
  '2,7':   { type: 'LIGHT_SOURCE', lightSourceOn: true },
  '10,2':  { type: 'LIGHT_SOURCE', lightSourceOn: true },
  '17,7':  { type: 'LIGHT_SOURCE', lightSourceOn: true },
  '10,7':  { type: 'LIGHT_SOURCE', lightSourceOn: true },
};

// ── FLOOR 6 — RESIDENTIAL STACK 19-F (Iria Cala's floor) ───────────────────
// Layout: central E-W corridor (y=7), apartment units north and south.
const floor6Overrides: Record<string, Partial<WorldTile>> = {
  // Functional tiles — stairwell at Iria's memorial position
  '10,11': { type: 'STAIRWELL', incidentRecord: 'IRIA_CALA / INCIDENT_RECORD / 2193.09.23', oxygenLevel: 40, latentQ: 1 },
  '5,5':   { type: 'TERMINAL', sensorNodeId: 'SN-6' },
  '15,9':  { type: 'TERMINAL', hasComplianceMonitor: true },
  '3,7':   { type: 'VENT_ENTRY' },
  '18,9':  { type: 'VENT_ENTRY' },          // moved from 18,7 to avoid elevator conflict
  '18,7':  { type: 'ELEVATOR' },
  '7,4':   { type: 'DOOR', doorOpen: true }, // Protest area — open
  // Protest area tiles
  '8,4':   { type: 'FLOOR', latentQ: 1 }, '9,4': { type: 'FLOOR', latentQ: 1 },
  '10,4':  { type: 'FLOOR', latentQ: 1 }, '11,4': { type: 'FLOOR', latentQ: 1 },
  '12,4':  { type: 'FLOOR', latentQ: 1 }, '13,4': { type: 'FLOOR', latentQ: 1 },
  // Central corridor walls (define corridor at y=7)
  '2,6':   { type: 'WALL' }, '3,6': { type: 'WALL' }, '4,6': { type: 'WALL' }, '5,6': { type: 'WALL' },
  '6,6':   { type: 'WALL' },
  // gap at 7,6 — west corridor entrance
  '14,6':  { type: 'WALL' }, '15,6': { type: 'WALL' }, '16,6': { type: 'WALL' }, '17,6': { type: 'WALL' },
  // South residential partition (y=8)
  '2,8':   { type: 'WALL' }, '3,8': { type: 'WALL' }, '4,8': { type: 'WALL' }, '5,8': { type: 'WALL' },
  '6,8':   { type: 'WALL' },
  // gap at 7,8 — south corridor entrance
  '14,8':  { type: 'WALL' }, '15,8': { type: 'WALL' }, '16,8': { type: 'WALL' }, '17,8': { type: 'WALL' },
  // Items
  '13,7':  { itemId: 'elevated-access-key-1' },
  '16,9':  { itemId: 'elevator-key-ops' },
};

// ── FLOOR 8 — TRIBUNAL RECORDS / ARCHIVE ────────────────────────────────────
// Layout: large central records hall with filing alcoves along west and east walls.
const floor8Overrides: Record<string, Partial<WorldTile>> = {
  // Functional tiles
  '5,5':   { type: 'TERMINAL', sensorNodeId: 'SN-8' },
  '10,5':  { type: 'TERMINAL' },
  '15,5':  { type: 'TERMINAL' },
  '5,9':   { type: 'TERMINAL', latentQ: 1 },
  '10,11': { type: 'STAIRWELL' },
  '1,3':   { type: 'VENT_ENTRY' },
  '18,10': { type: 'VENT_ENTRY' },
  '18,7':  { type: 'ELEVATOR' },
  '15,9':  { type: 'FACILITY_CONTROL', hasComplianceMonitor: true, sensorNodeId: 'CONTRACT-8' },
  '12,5':  { type: 'DOOR', doorOpen: false }, // Records vault entrance
  // Locked stairwell approach (restricted archive floor)
  '10,10': { type: 'DOOR', doorOpen: false, locked: true },
  // Entry foyer partition (y=2 row — creates lobby near vent entry)
  '2,2':   { type: 'WALL' }, '3,2': { type: 'WALL' }, '4,2': { type: 'WALL' }, '5,2': { type: 'WALL' },
  '6,2':   { type: 'WALL' }, '7,2': { type: 'WALL' },
  // gap at 8,2 and 9,2 — central foyer entrance
  '10,2':  { type: 'WALL' }, '11,2': { type: 'WALL' }, '12,2': { type: 'WALL' },
  '13,2':  { type: 'WALL' }, '14,2': { type: 'WALL' }, '15,2': { type: 'WALL' }, '16,2': { type: 'WALL' },
  // West filing alcove (x=3 column as partial partition)
  '3,4':   { type: 'WALL' }, '3,5': { type: 'WALL' },
  // gap at 3,6 — alcove entrance
  '3,7':   { type: 'WALL' }, '3,8': { type: 'WALL' },
  // East filing alcove
  '16,4':  { type: 'WALL' }, '16,5': { type: 'WALL' },
  // gap at 16,6
  '16,7':  { type: 'WALL' }, '16,8': { type: 'WALL' },
  // Items
  '8,7':   { itemId: 'maintenance-key-1' },
};

// ── FLOOR 10 — UPPER OPERATIONS / ENFORCER DISPATCH ─────────────────────────
// Layout: central operations floor with NE MIRADOR sector and NW substation.
const floor10Overrides: Record<string, Partial<WorldTile>> = {
  // Functional tiles
  '10,5':  { type: 'FACILITY_CONTROL', sensorNodeId: 'SN-10', hasComplianceMonitor: true },
  '5,7':   { type: 'BROADCAST_TERMINAL', latentQ: 1 },
  '15,7':  { type: 'BROADCAST_TERMINAL', latentQ: 1 },
  '10,11': { type: 'STAIRWELL' },
  '3,5':   { type: 'VENT_ENTRY' },
  '18,5':  { type: 'VENT_ENTRY' },
  '18,7':  { type: 'ELEVATOR' },
  // MIRADOR NE sector
  '16,3':  { type: 'FACILITY_CONTROL', hasComplianceMonitor: true },
  '17,3':  { type: 'FACILITY_CONTROL', hasComplianceMonitor: true },
  '15,3':  { type: 'DOOR', doorOpen: false },
  // NE sector enclosure walls
  '15,1':  { type: 'WALL' }, '16,1': { type: 'WALL' }, '17,1': { type: 'WALL' },
  '15,2':  { type: 'WALL' },
  // gap at 15,3 — door
  '15,4':  { type: 'WALL' },
  // NW substation walls
  '2,1':   { type: 'WALL' }, '3,1': { type: 'WALL' }, '4,1': { type: 'WALL' }, '5,1': { type: 'WALL' },
  '5,2':   { type: 'WALL' }, '5,3': { type: 'WALL' },
  // gap at 5,4 — substation entrance
  '5,5':   { type: 'WALL' },
  // Locked stairwell approach (restricted ops floor)
  '10,10': { type: 'DOOR', doorOpen: false, locked: true },
  // LATTICE_EXIT — the way out
  '10,3':  { type: 'LATTICE_EXIT', latentQ: 2 },
  // Light sources
  '4,4':   { type: 'LIGHT_SOURCE', lightSourceOn: true },
  '14,4':  { type: 'LIGHT_SOURCE', lightSourceOn: true },
  '4,9':   { type: 'LIGHT_SOURCE', lightSourceOn: true },
  '14,9':  { type: 'LIGHT_SOURCE', lightSourceOn: true },
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
      const ventLayer = fillVentLayer(z, grates);
      // Apply VENT_EXIT_DOWN tiles (grates that exit downward to z+1)
      const exitDown = VENT_EXIT_DOWN_BY_LAYER[z];
      if (exitDown) {
        ventLayer[exitDown.y][exitDown.x] = makeTile(exitDown.x, exitDown.y, z, 'VENT_EXIT_DOWN');
      }
      grid.push(ventLayer);
    } else {
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

export const ADMINISTRATIVE_FLOORS: boolean[] = [
  true,  // 0 — MIRADOR admin
  false, // 1 — vent
  false, // 2 — intake
  false, // 3 — SMAC vent
  false, // 4 — ring C
  false, // 5 — vent
  false, // 6 — residential
  false, // 7 — vent
  false, // 8 — archive
  false, // 9 — vent
  true,  // 10 — operations
  false, // 11 — vent
];

export const SEALED_ROOM_TILES_F3 = [
  { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 },
  { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 },
];
