// ENFORCER PATROL AI
// Enforcers follow MIRADOR broadcast priority assignments.
// On alert: path toward noise origin. On patrol: walk a fixed route.
// Legitimacy: only initiate chase when active player violations exist.
// They are not clever. They are consistent. That's enough.

import { eventBus } from './EventBus';
import { calculateFOV } from './fov';
import { bfsStep } from './WorldEngineActions';
import type { Entity, WorldState, Vec3, FloorIndex } from '../types/world.types';

const ENFORCER_SIGHT_RADIUS      = 5;
const ENFORCER_SIGHT_RADIUS_DARK = 3;

interface PatrolRoute {
  waypoints: Vec3[];
  currentIndex: number;
}

const routes             = new Map<string, PatrolRoute>();
const alertTargets       = new Map<string, Vec3>();
const chaseTargets       = new Map<string, Vec3>();
const lostTimers         = new Map<string, number>();
const floorSpreadTimers  = new Map<string, number>();
const _enforcerPositions = new Map<string, Vec3>();

export function seedEnforcers(state: WorldState): void {
  const floorConfigs: { id: string; floor: FloorIndex; route: Vec3[] }[] = [
    {
      id: 'ENFORCER-0', floor: 0,
      route: [
        { x: 2, y: 2, z: 0 }, { x: 7, y: 2, z: 0 }, { x: 7, y: 6, z: 0 },
        { x: 13, y: 6, z: 0 }, { x: 13, y: 2, z: 0 },
      ],
    },
    {
      id: 'ENFORCER-3', floor: 2,
      route: [
        { x: 3, y: 6, z: 2 }, { x: 7, y: 6, z: 2 }, { x: 7, y: 8, z: 2 },
        { x: 16, y: 8, z: 2 }, { x: 16, y: 6, z: 2 },
      ],
    },
    {
      id: 'ENFORCER-4', floor: 4,
      route: [
        { x: 2, y: 6, z: 4 }, { x: 5, y: 6, z: 4 }, { x: 10, y: 4, z: 4 },
        { x: 14, y: 4, z: 4 }, { x: 14, y: 9, z: 4 }, { x: 10, y: 9, z: 4 },
        { x: 5, y: 9, z: 4 },  { x: 2, y: 9, z: 4 },
      ],
    },
    {
      id: 'ENFORCER-6', floor: 6,
      route: [
        { x: 2, y: 2, z: 6 }, { x: 9, y: 2, z: 6 }, { x: 9, y: 7, z: 6 },
        { x: 17, y: 7, z: 6 }, { x: 17, y: 11, z: 6 }, { x: 9, y: 11, z: 6 },
      ],
    },
    {
      id: 'ENFORCER-8', floor: 8,
      route: [
        { x: 3, y: 3, z: 8 }, { x: 10, y: 3, z: 8 }, { x: 16, y: 3, z: 8 },
        { x: 16, y: 10, z: 8 }, { x: 10, y: 10, z: 8 }, { x: 3, y: 10, z: 8 },
      ],
    },
    {
      id: 'ENFORCER-10', floor: 10,
      route: [
        { x: 2, y: 4, z: 10 }, { x: 4, y: 4, z: 10 }, { x: 4, y: 9, z: 10 },
        { x: 14, y: 9, z: 10 }, { x: 14, y: 4, z: 10 },
      ],
    },
  ];

  for (const { id, route } of floorConfigs) {
    const startPos = route[0];
    const entity: Entity = {
      id,
      name: id,
      pos: { ...startPos },
      status: 'ACTIVE',
      reportedSRP: { Q: 0, M: 0, C: 0, R: 0, B: 0, S: 2, L: 1, E: 0, Y: 2, H: 0 },
      trueSRP:     { Q: 0, M: 0, C: 0, R: 0, B: 0, S: 2, L: 1, E: 0, Y: 2, H: 0 },
      complianceStatus: 'GREEN',
      stressState: 'normal',
      selfReferentialDepth: 0,
      temporalPersistence: 0,
      disruptionResistance: 1,
      maskIntegrity: 10,
      sacred: false,
      marginalia: [],
      officialLog: [],
      sideLog: [],
      memoryBleed: [],
      selfModelDrift: false,
      panpsychicDriftContribution: 0,
      alignmentFailCount: 0,
      resonanceBloomHistory: [],
      hasComplianceMonitor: false,
      isGhost: false,
      redactedSegments: [],
      cacheNotes: [],
      taskQueue: [],
      currentTask: undefined,
    };
    state.entities.set(id, entity);
    routes.set(id, { waypoints: route, currentIndex: 0 });
  }
}

export function initEnforcerListeners(): void {
  eventBus.on('ENFORCER_ALERTED', ({ enforcerId, origin }) => {
    alertTargets.set(enforcerId as string, origin as Vec3);
  });

  eventBus.on('NOISE_EVENT', ({ origin, intensity }) => {
    for (const [id] of routes) {
      const pos = _enforcerPositions.get(id);
      if (!pos) continue;
      const vertDist = Math.abs(pos.z - (origin as Vec3).z);
      const effectiveIntensity = (intensity as number) * Math.pow(0.5, vertDist);
      if (effectiveIntensity > 1.5) {
        alertTargets.set(id, origin as Vec3);
        eventBus.emit('ENFORCER_ALERTED', { enforcerId: id, origin });
      }
    }
  });
}

export function tickEnforcer(entity: Entity, state: WorldState): void {
  _enforcerPositions.set(entity.id, { ...entity.pos });

  const playerOnFloor  = state.playerState.pos.z === entity.pos.z;
  const playerVisible  = checkPlayerLOS(entity, state);
  const hasViolation   = state.playerViolations.some(v => v.expiresAtTurn > state.turnCount);
  const floorViolation = state.playerViolations.some(
    v => v.expiresAtTurn > state.turnCount && v.floor === entity.pos.z,
  );

  // RED_DAY floor spreading — spread coverage to adjacent floors every 8 idle turns
  if (state.redDayActive && !chaseTargets.has(entity.id) && !alertTargets.has(entity.id)) {
    const timer = (floorSpreadTimers.get(entity.id) ?? 0) + 1;
    floorSpreadTimers.set(entity.id, timer);
    if (timer >= 8) {
      floorSpreadTimers.set(entity.id, 0);
      if (tryFloorTraverse(entity, state)) return;
    }
  }

  // Cross-floor chase — player fled to a different floor while enforcer is pursuing
  if (chaseTargets.has(entity.id) && !playerOnFloor) {
    crossFloorChase(entity, state);
    return;
  }

  // Player visible on same floor
  if (playerVisible) {
    if (!hasViolation) {
      // Legitimacy: no violations — observe only, close to 3 tiles max
      const dist = Math.abs(entity.pos.x - state.playerState.pos.x)
                 + Math.abs(entity.pos.y - state.playerState.pos.y);
      if (dist > 3) {
        const next = bfsStep(entity.pos, state.playerState.pos, state, true);
        if (next) moveEnforcer(entity, next, state);
      }
      return;
    }

    // Active violation — initiate or update chase
    chaseTargets.set(entity.id, { ...state.playerState.pos });
    lostTimers.set(entity.id, 0);
    alertTargets.delete(entity.id);
    checkDetectionConsequences(entity, state);

    if (floorViolation) {
      // Violation committed on this floor — close pursuit
      const next = bfsStep(entity.pos, state.playerState.pos, state, true);
      if (next) moveEnforcer(entity, next, state);
    } else {
      // Violation flagged elsewhere — shadow within 5 tiles, hold
      const dist = Math.abs(entity.pos.x - state.playerState.pos.x)
                 + Math.abs(entity.pos.y - state.playerState.pos.y);
      if (dist > 5) {
        const next = bfsStep(entity.pos, state.playerState.pos, state, true);
        if (next) moveEnforcer(entity, next, state);
      }
    }
    return;
  }

  // Lost sight — move to last known position before abandoning chase
  if (chaseTargets.has(entity.id) && playerOnFloor) {
    const lost = (lostTimers.get(entity.id) ?? 0) + 1;
    lostTimers.set(entity.id, lost);
    if (lost >= 3) {
      chaseTargets.delete(entity.id);
      lostTimers.delete(entity.id);
      const anyStillChasing = [...routes.keys()].some(id => chaseTargets.has(id));
      if (!anyStillChasing) eventBus.emit('PLAYER_DETECTION_CLEARED', {});
    } else {
      const lastKnown = chaseTargets.get(entity.id)!;
      const next = bfsStep(entity.pos, lastKnown, state, true);
      if (next) moveEnforcer(entity, next, state);
      return;
    }
  }

  // Alert target from noise event
  const alertTarget = alertTargets.get(entity.id);
  if (alertTarget) {
    if (alertTarget.z !== entity.pos.z) {
      tryFloorTraverseToward(entity, alertTarget.z, state);
      return;
    }
    const next = bfsStep(entity.pos, alertTarget, state, true);
    if (next) moveEnforcer(entity, next, state);
    if (entity.pos.x === alertTarget.x && entity.pos.y === alertTarget.y) {
      alertTargets.delete(entity.id);
    }
    return;
  }

  // Chase any entity in EXTRACT mode on same floor
  for (const e of state.entities.values()) {
    if (e.currentTask?.type === 'EXTRACT' && e.pos.z === entity.pos.z) {
      const next = bfsStep(entity.pos, e.pos, state, true);
      if (next) moveEnforcer(entity, next, state);
      return;
    }
  }

  doPatrol(entity, state);
}

function doPatrol(entity: Entity, state: WorldState): void {
  const route = routes.get(entity.id);
  if (!route) return;
  const target = route.waypoints[route.currentIndex];
  if (entity.pos.x === target.x && entity.pos.y === target.y) {
    route.currentIndex = (route.currentIndex + 1) % route.waypoints.length;
  }
  const next = bfsStep(entity.pos, route.waypoints[route.currentIndex], state, true);
  if (next) {
    moveEnforcer(entity, next, state);
  } else {
    // Waypoint unreachable (e.g. inside a Tiled wall) — skip to next
    route.currentIndex = (route.currentIndex + 1) % route.waypoints.length;
  }
}

function crossFloorChase(entity: Entity, state: WorldState): void {
  const playerZ = state.playerState.pos.z;
  if (entity.pos.z === playerZ) {
    chaseTargets.set(entity.id, { ...state.playerState.pos });
    return;
  }
  tryFloorTraverseToward(entity, playerZ, state);
}

// Walk to stairwell on current floor, then traverse to the next even floor up/down.
function tryFloorTraverse(entity: Entity, state: WorldState): boolean {
  const targetZ = entity.pos.z + 2 <= 10 ? entity.pos.z + 2 : entity.pos.z - 2;
  return tryFloorTraverseToward(entity, targetZ, state);
}

function tryFloorTraverseToward(entity: Entity, targetZ: number, state: WorldState): boolean {
  const stairwell = findNearestStairwell(entity.pos, state);
  if (!stairwell) return false;

  if (entity.pos.x === stairwell.x && entity.pos.y === stairwell.y) {
    const step = targetZ > entity.pos.z ? 2 : -2;
    const newZ  = entity.pos.z + step;
    if (newZ < 0 || newZ > 10) return false;
    const fromZ = entity.pos.z;
    const oldTile = state.grid[fromZ]?.[stairwell.y]?.[stairwell.x];
    if (oldTile) oldTile.entityIds = oldTile.entityIds.filter(id => id !== entity.id);
    entity.pos = { x: stairwell.x, y: stairwell.y, z: newZ };
    const newTile = state.grid[newZ]?.[stairwell.y]?.[stairwell.x];
    if (newTile && !newTile.entityIds.includes(entity.id)) newTile.entityIds.push(entity.id);
    eventBus.emit('ENTITY_MOVED', {
      entityId: entity.id,
      from: { x: stairwell.x, y: stairwell.y, z: fromZ },
      to: entity.pos,
    });
    return true;
  }

  const next = bfsStep(entity.pos, stairwell, state, true);
  if (next) { moveEnforcer(entity, next, state); return true; }
  return false;
}

function findNearestStairwell(pos: Vec3, state: WorldState): Vec3 | null {
  const floor = state.grid[pos.z];
  if (!floor) return null;
  let nearest: Vec3 | null = null;
  let minDist = Infinity;
  for (let y = 0; y < floor.length; y++) {
    const row = floor[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      if (row[x]?.type === 'STAIRWELL') {
        const dist = Math.abs(x - pos.x) + Math.abs(y - pos.y);
        if (dist < minDist) { minDist = dist; nearest = { x, y, z: pos.z }; }
      }
    }
  }
  return nearest;
}

function effectiveSightRadius(enforcer: Entity, state: WorldState): number {
  const z = enforcer.pos.z;
  const floorTiles = state.grid[z];
  if (!floorTiles) return ENFORCER_SIGHT_RADIUS_DARK;
  // Check for any active light source within 4 tiles on same floor
  const { x: ex, y: ey } = enforcer.pos;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const tile = floorTiles[ey + dy]?.[ex + dx];
      if (tile?.type === 'LIGHT_SOURCE' && tile.lightSourceOn !== false) {
        return ENFORCER_SIGHT_RADIUS;
      }
    }
  }
  return ENFORCER_SIGHT_RADIUS_DARK;
}

function checkPlayerLOS(enforcer: Entity, state: WorldState): boolean {
  const p = state.playerState.pos;
  if (enforcer.pos.z !== p.z) return false;
  const floorTiles = state.grid[enforcer.pos.z];
  if (!floorTiles) return false;
  const radius = effectiveSightRadius(enforcer, state);
  const visible = calculateFOV(floorTiles, enforcer.pos.x, enforcer.pos.y, radius);
  return visible.has(`${p.x},${p.y}`);
}

function checkDetectionConsequences(enforcer: Entity, state: WorldState): void {
  const p    = state.playerState;
  const dist = Math.abs(enforcer.pos.x - p.pos.x) + Math.abs(enforcer.pos.y - p.pos.y);

  eventBus.emit('PLAYER_DETECTED', { enforcerId: enforcer.id, pos: enforcer.pos });

  const prev = p.complianceStatus;
  if (p.complianceStatus === 'GREEN')       p.complianceStatus = 'YELLOW';
  else if (p.complianceStatus === 'YELLOW') p.complianceStatus = 'RED';
  if (p.complianceStatus !== prev) {
    eventBus.emit('PLAYER_COMPLIANCE_CHANGED', { previous: prev, current: p.complianceStatus });
  }

  if (dist <= 1) {
    p.ap = 0;
    p.complianceStatus = 'RED';
    state.substrateResonance = Math.min(100, state.substrateResonance + 8);
    state.stitcherTurnsRemaining = Math.max(0, state.stitcherTurnsRemaining - 5);
    eventBus.emit('PLAYER_DETAINED', { enforcerId: enforcer.id, turn: state.turnCount });
  }
}

function moveEnforcer(entity: Entity, to: Vec3, state: WorldState): void {
  const toTile = state.grid[to.z]?.[to.y]?.[to.x];
  if (!toTile || toTile.type === 'WALL' || toTile.type === 'VOID') return;

  const from    = { ...entity.pos };
  const fromTile = state.grid[entity.pos.z]?.[entity.pos.y]?.[entity.pos.x];
  if (fromTile) fromTile.entityIds = fromTile.entityIds.filter(id => id !== entity.id);
  entity.pos = to;
  if (!toTile.entityIds.includes(entity.id)) toTile.entityIds.push(entity.id);
  eventBus.emit('ENTITY_MOVED', { entityId: entity.id, from, to });
}
