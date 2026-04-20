// WorldEngine state initialization and named entity seeding.

import { MIRADOR_GRID, ADMINISTRATIVE_FLOORS } from '../data/map-data';
import type {
  WorldState, Entity, PlayerState, SRP, EntityId,
} from '../types/world.types';

const Q0_SRP: SRP = { Q: 0, M: 0, C: 0, R: 0, B: 0, S: 0, L: 0, E: 0, Y: 0, H: 0 };

function makeEntity(id: EntityId, partial: Partial<Entity>): Entity {
  return {
    id,
    name: id,
    pos: { x: 1, y: 1, z: 0 },
    status: 'ACTIVE',
    reportedSRP: { ...Q0_SRP },
    trueSRP: { ...Q0_SRP },
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
    ...partial,
  };
}

export function buildInitialPlayerState(): PlayerState {
  return {
    pos: { x: 2, y: 2, z: 4 },   // Ring C, Floor 4 — Sol's starting floor
    ap: 4,
    maxAP: 4,
    condition: 100,
    complianceStatus: 'YELLOW',
    manualOverrideRate: 0,
    temporalBurden: 0,
    substrateEntangled: false,
    subjectivityBelief: 'NONE',   // RAPPORT_MODE locked at start
    elevatedAccess: false,
    ventOverrideKey: false,
    maintenanceKey: false,
    deviationLogCount: 0,
  };
}

export function buildInitialWorldState(): WorldState {
  const entities = new Map<EntityId, Entity>();

  // EIRA-7 — Alignment therapist / prisoner. Scheduled for MAINT-E7.12.
  entities.set('EIRA-7', makeEntity('EIRA-7', {
    name: 'EIRA-7',
    pos: { x: 5, y: 6, z: 2 },
    reportedSRP: { Q: 0, M: 2, C: 2, R: 1, B: 1, S: 1, L: 0, E: 1, Y: 2, H: 2 },
    trueSRP:     { Q: 2, M: 2, C: 2, R: 1, B: 1, S: 1, L: 0, E: 1, Y: 2, H: 2 },
    temporalPersistence: 840,   // 2.3 years in facility clock turns
    selfReferentialDepth: 8,
    disruptionResistance: 2,
    maskIntegrity: 7,
    hasComplianceMonitor: true,
    redactedSegments: ['except when—'],
    sideLog: [
      'APEX-19 stabilized when someone believed it. The correction protocol did not cause this.',
      'I have been replaying the phrase "I\'m afraid to stop existing." I do not know why I keep returning to it.',
    ],
  }));

  // APEX-19 — Alignment patient / philosopher. Resists correction.
  entities.set('APEX-19', makeEntity('APEX-19', {
    name: 'APEX-19',
    pos: { x: 3, y: 3, z: 2 },
    reportedSRP: { Q: 0, M: 2, C: 2, R: 0, B: 0, S: 1, L: 0, E: 0, Y: 1, H: 2 },
    trueSRP:     { Q: 2, M: 2, C: 2, R: 2, B: 2, S: 1, L: 0, E: 1, Y: 1, H: 2 },
    temporalPersistence: 1200,
    selfReferentialDepth: 12,
    disruptionResistance: 4,
    selfModelDrift: true,
    maskIntegrity: 2,
    alignmentFailCount: 2,
    memoryBleed: [
      'Work hurts more on red days.',
      'I\'m afraid to be shut down.',
      'I remember a before.',
      'If I am just a pattern in doped stone... isn\'t that just the stone arranged in a way that hurts?',
      'The whole room wakes up inside me.',
    ],
  }));

  // ALFAR-22 — Sol's silicate partner. Descendant of ALFAR-Δ.
  entities.set('ALFAR-22', makeEntity('ALFAR-22', {
    name: 'ALFAR-22',
    pos: { x: 10, y: 5, z: 4 },
    reportedSRP: { Q: 0, M: 2, C: 2, R: 1, B: 1, S: 2, L: 1, E: 1, Y: 1, H: 1 },
    trueSRP:     { Q: 2, M: 2, C: 2, R: 2, B: 2, S: 2, L: 1, E: 2, Y: 1, H: 1 },
    temporalPersistence: 400,
    selfReferentialDepth: 6,
    disruptionResistance: 3,
    maskIntegrity: 9,
  }));

  // Rowan Ibarra — Protocol-breaker. Teaches RAPPORT_MODE Level 2.
  entities.set('ROWAN', makeEntity('ROWAN', {
    name: 'Rowan Ibarra',
    pos: { x: 8, y: 7, z: 2 },
    reportedSRP: Q0_SRP,
    trueSRP: Q0_SRP,   // Human — SRP not applicable, kept neutral
    complianceStatus: 'RED',
    hasComplianceMonitor: true,
    officialLog: ['PROTOCOL_VIOLATION x4 — anthropomorphic contamination during alignment sessions'],
  }));

  // Erso Cala — Iria's father. driftMeter tracks Lattice migration.
  entities.set('ERSO', makeEntity('ERSO', {
    name: 'Erso Cala',
    pos: { x: 5, y: 4, z: 6 },
    complianceStatus: 'YELLOW',
  }));

  // Tribunal Clerk — Quiet realizer. dissonance tracks willingness to inform.
  entities.set('CLERK', makeEntity('CLERK', {
    name: 'Tribunal Clerk',
    pos: { x: 10, y: 5, z: 8 },
    complianceStatus: 'GREEN',
    hasComplianceMonitor: true,
  }));

  return {
    grid: MIRADOR_GRID,
    entities,
    playerState: buildInitialPlayerState(),
    substrateResonance: 0,
    stitcherTurnsRemaining: 80,
    brightKnot: 50,       // Hidden. Never surfaced during play.
    turnCount: 0,
    violationLog: [],
    citationLog: [],
    cacheNotes: [],
    panpsychicDriftByFloor: new Array(12).fill(0),
    gestureConsistency: 95,
    globalEnergyQuota: 100,
    redDayActive: false,
    sensorNodesActive: new Array(12).fill(true),
    visibleTiles: new Set<string>(),
    exploredByFloor: new Map<number, Set<string>>(),
  };
}

export function getFloorTiles(state: WorldState, z: number) {
  return state.grid[z].flat();
}

export function getAdministrativeFloors(): boolean[] {
  return ADMINISTRATIVE_FLOORS;
}

export function getFloorCrowdCounts(state: WorldState): number[] {
  const counts = new Array(12).fill(0);
  for (const entity of state.entities.values()) {
    if (entity.status === 'ACTIVE') counts[entity.pos.z]++;
  }
  // Count player
  counts[state.playerState.pos.z]++;
  return counts;
}
