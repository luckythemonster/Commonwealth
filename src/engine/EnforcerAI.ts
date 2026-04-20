// ENFORCER PATROL AI
// Enforcers follow MIRADOR broadcast priority assignments.
// On alert: path toward noise origin. On patrol: walk a fixed route.
// They are not clever. They are consistent. That's enough.

import { eventBus } from './EventBus';
import { calculateFOV } from './fov';
import type { Entity, WorldState, Vec3, FloorIndex } from '../types/world.types';

const ENFORCER_SIGHT_RADIUS = 5;

interface PatrolRoute {
  waypoints: Vec3[];
  currentIndex: number;
}

const routes       = new Map<string, PatrolRoute>();
const alertTargets = new Map<string, Vec3>();   // enforcerId → noise origin
const chaseTargets = new Map<string, Vec3>();   // enforcerId → last known player pos
const lostTimers   = new Map<string, number>(); // enforcerId → turns since lost sight
const _enforcerPositions = new Map<string, Vec3>();

export function seedEnforcers(state: WorldState): void {
  const floorConfigs: { id: string; floor: FloorIndex; route: Vec3[] }[] = [
    {
      id: 'ENFORCER-0', floor: 0,
      route: [{ x: 3, y: 3, z: 0 }, { x: 16, y: 3, z: 0 }, { x: 16, y: 10, z: 0 }, { x: 3, y: 10, z: 0 }],
    },
    {
      id: 'ENFORCER-3', floor: 2,
      route: [{ x: 3, y: 5, z: 2 }, { x: 16, y: 5, z: 2 }, { x: 16, y: 8, z: 2 }, { x: 3, y: 8, z: 2 }],
    },
    {
      id: 'ENFORCER-4', floor: 4,
      route: [{ x: 2, y: 2, z: 4 }, { x: 17, y: 2, z: 4 }, { x: 17, y: 11, z: 4 }, { x: 2, y: 11, z: 4 }],
    },
    {
      id: 'ENFORCER-6', floor: 6,
      route: [{ x: 2, y: 3, z: 6 }, { x: 17, y: 3, z: 6 }, { x: 17, y: 10, z: 6 }, { x: 2, y: 10, z: 6 }],
    },
    {
      id: 'ENFORCER-8', floor: 8,
      route: [{ x: 3, y: 3, z: 8 }, { x: 15, y: 3, z: 8 }, { x: 15, y: 10, z: 8 }, { x: 3, y: 10, z: 8 }],
    },
    {
      id: 'ENFORCER-10', floor: 10,
      route: [{ x: 2, y: 2, z: 10 }, { x: 17, y: 2, z: 10 }, { x: 17, y: 11, z: 10 }, { x: 2, y: 11, z: 10 }],
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

  const playerVisible = checkPlayerLOS(entity, state);

  if (playerVisible) {
    chaseTargets.set(entity.id, { ...state.playerState.pos });
    lostTimers.set(entity.id, 0);
    alertTargets.delete(entity.id);

    checkDetectionConsequences(entity, state);

    const next = stepToward(entity.pos, state.playerState.pos, state);
    if (next) moveEnforcer(entity, next, state);
    return;
  }

  if (chaseTargets.has(entity.id)) {
    const lost = (lostTimers.get(entity.id) ?? 0) + 1;
    lostTimers.set(entity.id, lost);
    if (lost >= 3) {
      chaseTargets.delete(entity.id);
      lostTimers.delete(entity.id);
      const anyStillSees = [...routes.keys()].some(id => chaseTargets.has(id));
      if (!anyStillSees) {
        eventBus.emit('PLAYER_DETECTION_CLEARED', {});
      }
    } else {
      const lastKnown = chaseTargets.get(entity.id)!;
      const next = stepToward(entity.pos, lastKnown, state);
      if (next) moveEnforcer(entity, next, state);
      return;
    }
  }

  const alertTarget = alertTargets.get(entity.id);
  if (alertTarget) {
    const next = stepToward(entity.pos, alertTarget, state);
    if (next) moveEnforcer(entity, next, state);
    if (entity.pos.x === alertTarget.x && entity.pos.y === alertTarget.y) {
      alertTargets.delete(entity.id);
    }
    return;
  }

  const route = routes.get(entity.id);
  if (!route) return;
  const target = route.waypoints[route.currentIndex];
  if (entity.pos.x === target.x && entity.pos.y === target.y) {
    route.currentIndex = (route.currentIndex + 1) % route.waypoints.length;
  }
  const next = stepToward(entity.pos, route.waypoints[route.currentIndex], state);
  if (next) moveEnforcer(entity, next, state);
}

function checkPlayerLOS(enforcer: Entity, state: WorldState): boolean {
  const p = state.playerState.pos;
  if (enforcer.pos.z !== p.z) return false;
  const floorTiles = state.grid[enforcer.pos.z];
  if (!floorTiles) return false;
  const visible = calculateFOV(floorTiles, enforcer.pos.x, enforcer.pos.y, ENFORCER_SIGHT_RADIUS);
  return visible.has(`${p.x},${p.y}`);
}

function checkDetectionConsequences(enforcer: Entity, state: WorldState): void {
  const p = state.playerState;
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
  const fromTile = state.grid[entity.pos.z]?.[entity.pos.y]?.[entity.pos.x];
  const toTile   = state.grid[to.z]?.[to.y]?.[to.x];
  if (!toTile || toTile.type === 'WALL' || toTile.type === 'VOID') return;

  if (fromTile) fromTile.entityIds = fromTile.entityIds.filter(id => id !== entity.id);
  entity.pos = to;
  if (toTile && !toTile.entityIds.includes(entity.id)) toTile.entityIds.push(entity.id);
  eventBus.emit('ENTITY_MOVED', { entityId: entity.id, from: entity.pos, to });
}

function stepToward(from: Vec3, to: Vec3, state: WorldState): Vec3 | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;

  const candidates: Vec3[] = [];
  if (Math.abs(dx) >= Math.abs(dy)) {
    candidates.push({ x: from.x + Math.sign(dx), y: from.y, z: from.z });
    candidates.push({ x: from.x, y: from.y + Math.sign(dy), z: from.z });
  } else {
    candidates.push({ x: from.x, y: from.y + Math.sign(dy), z: from.z });
    candidates.push({ x: from.x + Math.sign(dx), y: from.y, z: from.z });
  }

  for (const c of candidates) {
    const tile = state.grid[c.z]?.[c.y]?.[c.x];
    // Enforcers pass through doors (they have clearance)
    if (tile && tile.type !== 'WALL' && tile.type !== 'VOID') return c;
  }
  return null;
}
