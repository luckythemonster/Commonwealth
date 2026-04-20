// ENFORCER PATROL AI
// Enforcers follow MIRADOR broadcast priority assignments.
// On alert: path toward noise origin. On patrol: walk a fixed route.
// They are not clever. They are consistent. That's enough.

import { eventBus } from './EventBus';
import type { Entity, WorldState, Vec3, FloorIndex } from '../types/world.types';

interface PatrolRoute {
  waypoints: Vec3[];
  currentIndex: number;
}

const routes = new Map<string, PatrolRoute>();
const alertTargets = new Map<string, Vec3>(); // enforcerId → noise origin

export function seedEnforcers(state: WorldState): void {
  // One Enforcer per primary floor (even indices only)
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

// Subscribe to noise events — Enforcers on the same or adjacent floor get alerted
export function initEnforcerListeners(): void {
  eventBus.on('ENFORCER_ALERTED', ({ enforcerId, origin }) => {
    alertTargets.set(enforcerId, origin);
  });

  eventBus.on('NOISE_EVENT', ({ origin, intensity }) => {
    // Alert Enforcers on floors within intensity range
    for (const [id] of routes) {
      const entity = getEnforcerPos(id);
      if (!entity) continue;
      const vertDist = Math.abs(entity.z - origin.z);
      const effectiveIntensity = intensity * Math.pow(0.5, vertDist);
      if (effectiveIntensity > 1.5) {
        alertTargets.set(id, origin);
        eventBus.emit('ENFORCER_ALERTED', { enforcerId: id, origin });
      }
    }
  });
}

const _enforcerPositions = new Map<string, Vec3>();

function getEnforcerPos(id: string): Vec3 | undefined {
  return _enforcerPositions.get(id);
}

// Called by WorldEngine.resolveEntity for each Enforcer each turn
export function tickEnforcer(entity: Entity, state: WorldState): void {
  _enforcerPositions.set(entity.id, { ...entity.pos });

  const alertTarget = alertTargets.get(entity.id);

  if (alertTarget) {
    // Move one step toward alert origin
    const next = stepToward(entity.pos, alertTarget, state);
    if (next) {
      moveEnforcer(entity, next, state);
    }
    // Check if arrived
    if (entity.pos.x === alertTarget.x && entity.pos.y === alertTarget.y) {
      alertTargets.delete(entity.id);
    }
    // Check if player is on same tile — detection
    checkPlayerDetection(entity, state);
    return;
  }

  // Normal patrol: advance to next waypoint
  const route = routes.get(entity.id);
  if (!route) return;

  const target = route.waypoints[route.currentIndex];
  if (entity.pos.x === target.x && entity.pos.y === target.y) {
    route.currentIndex = (route.currentIndex + 1) % route.waypoints.length;
  }

  const next = stepToward(entity.pos, route.waypoints[route.currentIndex], state);
  if (next) moveEnforcer(entity, next, state);

  checkPlayerDetection(entity, state);
}

function moveEnforcer(entity: Entity, to: Vec3, state: WorldState): void {
  const fromTile = state.grid[entity.pos.z]?.[entity.pos.y]?.[entity.pos.x];
  const toTile   = state.grid[to.z]?.[to.y]?.[to.x];
  if (!toTile || toTile.type === 'WALL' || toTile.type === 'VOID') return;

  if (fromTile) fromTile.entityIds = fromTile.entityIds.filter(id => id !== entity.id);
  entity.pos = to;
  if (toTile) {
    if (!toTile.entityIds.includes(entity.id)) toTile.entityIds.push(entity.id);
  }
  eventBus.emit('ENTITY_MOVED', { entityId: entity.id, from: entity.pos, to });
}

function stepToward(from: Vec3, to: Vec3, state: WorldState): Vec3 | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;

  // Prefer the axis with greater distance; try both if blocked
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
    if (tile && tile.type !== 'WALL' && tile.type !== 'VOID') return c;
  }
  return null;
}

function checkPlayerDetection(enforcer: Entity, state: WorldState): void {
  const p = state.playerState.pos;
  if (enforcer.pos.z !== p.z) return;
  const dist = Math.abs(enforcer.pos.x - p.x) + Math.abs(enforcer.pos.y - p.y);
  if (dist <= 2) {
    // Player detected — spike compliance status and resonance
    if (state.playerState.complianceStatus === 'GREEN') state.playerState.complianceStatus = 'YELLOW';
    else if (state.playerState.complianceStatus === 'YELLOW') state.playerState.complianceStatus = 'RED';
    eventBus.emit('PLAYER_COMPLIANCE_CHANGED', {
      previous: state.playerState.complianceStatus,
      current: state.playerState.complianceStatus,
    });
  }
}
