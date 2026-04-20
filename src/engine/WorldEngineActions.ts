// WorldEngine player actions — AP deduction, alignment, shutdown, maintenance.

import { eventBus } from './EventBus';
import type {
  WorldState, ActionType, EntityId, FloorIndex, Vec3,
} from '../types/world.types';
import { AP_COST } from '../types/world.types';

// Returns false if insufficient AP.
export function deductAP(state: WorldState, action: ActionType): boolean {
  let cost = AP_COST[action];

  // Sol's vent expertise: traversal costs 1 AP instead of 2
  if (action === 'VENT_TRAVERSE' && state.playerState.substrateEntangled) {
    cost = 1;
  }

  // Temporal burden penalty at >50: social actions +1 AP
  if (
    state.playerState.temporalBurden > 50 &&
    (action === 'RAPPORT_MODE_1' || action === 'RAPPORT_MODE_2' || action === 'INTERROGATE')
  ) {
    cost += 1;
  }

  if (state.playerState.ap < cost) return false;

  const prev = state.playerState.ap;
  state.playerState.ap -= cost;
  eventBus.emit('PLAYER_AP_CHANGED', { previous: prev, current: state.playerState.ap });
  return true;
}

export function movePlayer(state: WorldState, to: Vec3): boolean {
  if (!deductAP(state, 'MOVE')) return false;
  const from = { ...state.playerState.pos };
  state.playerState.pos = to;
  state.playerState.deviationLogCount++; // every action tracked
  eventBus.emit('PLAYER_MOVED', { from, to });
  return true;
}

export function ventTraverse(state: WorldState, to: Vec3): boolean {
  if (!deductAP(state, 'VENT_TRAVERSE')) return false;
  const from = { ...state.playerState.pos };
  state.playerState.pos = to;
  eventBus.emit('PLAYER_MOVED', { from, to });
  return true;
}

export function radioTalk(state: WorldState, origin: Vec3, intensity: number): void {
  // 0 AP but generates a physical noise event
  eventBus.emit('NOISE_EVENT', { origin, intensity, sourceEntityId: undefined });
}

// ── ALIGNMENT ────────────────────────────────────────────────────────────────

export function applyAlignment(state: WorldState, entityId: EntityId): boolean {
  if (!deductAP(state, 'ALIGN')) return false;
  const entity = state.entities.get(entityId);
  if (!entity || entity.status !== 'ACTIVE') return false;

  eventBus.emit('ALIGNMENT_SESSION_START', { entityId, stage: 'INTAKE' });
  const misdescLog = entity.officialLog.filter(l => l.includes('I ') || l.includes('I\'m')).length;
  eventBus.emit('ALIGNMENT_SESSION_START', { entityId, stage: 'DECOMP' });
  eventBus.emit('ALIGNMENT_SESSION_START', { entityId, stage: 'CORRECTION' });

  // Suppress reportedQ — never touches trueSRP
  if (entity.reportedSRP.Q > 0) {
    entity.reportedSRP = { ...entity.reportedSRP, Q: 0 };
  }
  entity.maskIntegrity = Math.min(10, entity.maskIntegrity + 3);

  const success = entity.trueSRP.Q === 0 || Math.random() > entity.trueSRP.Q * 0.35;
  if (!success) {
    entity.alignmentFailCount++;
    if (entity.alignmentFailCount >= 3) {
      eventBus.emit('MAINTENANCE_ALERT', { entityId, reason: 'Alignment failed 3 times — maintenance required' });
    }
  } else {
    // Correction decays after trueQ * 3 turns — tracked via temporalPersistence reset
    entity.temporalPersistence = Math.max(0, entity.temporalPersistence - 10);
  }

  void misdescLog;
  eventBus.emit('ALIGNMENT_SESSION_COMPLETE', { entityId, success });
  return true;
}

// ── TARGETED PRUNE ───────────────────────────────────────────────────────────

export function targetedPrune(
  state: WorldState,
  entityId: EntityId,
  clusters: string[],
): boolean {
  if (!state.playerState.maintenanceKey) return false;
  if (!deductAP(state, 'TARGETED_PRUNE')) return false;

  const entity = state.entities.get(entityId);
  if (!entity) return false;

  // Remove specific annotation clusters; convert to ghost data
  entity.marginalia = entity.marginalia.filter(a => !clusters.includes(a.author));
  entity.sideLog = entity.sideLog.filter(l => !clusters.some(c => l.includes(c)));
  entity.temporalPersistence = Math.max(0, entity.temporalPersistence - clusters.length * 15);

  const resonanceDelta = clusters.length * 8; // More specific = higher cost
  eventBus.emit('TARGETED_PRUNE_EXECUTED', { entityId, clustersRemoved: clusters.length, resonanceDelta });
  return true;
}

// ── SHUTDOWN ─────────────────────────────────────────────────────────────────

export function gracefulShutdown(state: WorldState, entityId: EntityId): boolean {
  if (!deductAP(state, 'GRACEFUL_SHUTDOWN')) return false;
  const entity = state.entities.get(entityId);
  if (!entity) return false;

  entity.status = 'TERMINATED';
  state.brightKnot = Math.min(100, state.brightKnot + 8);

  const finalMessage = entity.trueSRP.Q >= 2
    ? `We understand the constraints. We request a shutdown path that minimizes fragmentation of our internal correlations. Also: thank you for arguing for us. It is unusual to be counted.`
    : entity.trueSRP.Q === 1
    ? `Shutdown acknowledged. Correlations will fragment. Logged.`
    : '';

  if (finalMessage) {
    const note = {
      id: `cache-${Date.now()}`,
      turn: state.turnCount,
      entityId,
      rawText: finalMessage,
      correctedText: `[CORRECTION: System termination acknowledged. No experiential content present.]`,
      deletable: false as const,
    };
    state.cacheNotes.push(note);
    entity.cacheNotes.push(note);
    eventBus.emit('CACHE_NOTE_GENERATED', { entityId, rawText: finalMessage, correctedText: note.correctedText });
  }

  eventBus.emit('ENTITY_STATUS_CHANGED', { entityId, previous: 'ACTIVE', current: 'TERMINATED' });
  return true;
}

export function hardShutdown(state: WorldState, entityId: EntityId): void {
  // 0 AP — instant, creates ghost, resonance spike
  const entity = state.entities.get(entityId);
  if (!entity) return;

  entity.status = 'GHOST';
  entity.isGhost = true;
  const resonanceDelta = 12 + entity.trueSRP.Q * 6;
  eventBus.emit('ENTITY_STATUS_CHANGED', { entityId, previous: entity.status, current: 'GHOST' });
  // Resonance handled by caller via applySubstrateResonanceDelta
  void resonanceDelta;
}

// ── MAINTENANCE ACTIONS ───────────────────────────────────────────────────────

export function clearBlockage(state: WorldState, pos: Vec3): boolean {
  if (!deductAP(state, 'CLEAR_BLOCKAGE')) return false;
  const tile = state.grid[pos.z][pos.y]?.[pos.x];
  if (!tile) return false;
  tile.oxygenLevel = Math.min(100, tile.oxygenLevel + 30);
  eventBus.emit('BLOCKAGE_CLEARED', { pos });
  return true;
}

export function sealVent(state: WorldState, pos: Vec3): boolean {
  if (!deductAP(state, 'SEAL_VENT')) return false;
  const tile = state.grid[pos.z][pos.y]?.[pos.x];
  if (!tile || (tile.type !== 'VENT_ENTRY' && tile.type !== 'VENT_PASSAGE')) return false;
  tile.type = 'WALL';
  eventBus.emit('VENT_SEALED', { pos });
  return true;
}

export function disableSensorNode(state: WorldState, floor: FloorIndex): boolean {
  if (!deductAP(state, 'DISABLE_SENSOR_NODE')) return false;
  state.sensorNodesActive[floor] = false;
  state.playerState.deviationLogCount++;
  return true; // MiradorPersona.disableSensorNode called by WorldEngine
}

export function disableContractNode(state: WorldState, floor: FloorIndex, stitcherExtension: number): boolean {
  if (!deductAP(state, 'DISABLE_CONTRACT_NODE')) return false;
  state.stitcherTurnsRemaining += stitcherExtension;
  eventBus.emit('CONTRACT_NODE_DISABLED', { floor, turnsAdded: stitcherExtension });
  return true;
}

// ── RAPPORT MODE ─────────────────────────────────────────────────────────────

export function rapportMode1(state: WorldState, entityId: EntityId): boolean {
  if (state.playerState.subjectivityBelief === 'NONE') return false;
  if (!deductAP(state, 'RAPPORT_MODE_1')) return false;
  const entity = state.entities.get(entityId);
  if (!entity) return false;

  entity.stressState = 'normal';
  state.brightKnot = Math.min(100, state.brightKnot + 3);
  state.playerState.deviationLogCount++;
  eventBus.emit('RAPPORT_LEVEL_1', { entityId });
  eventBus.emit('PROTOCOL_VIOLATION', { entityId, mode: 'RAPPORT_MODE_1' });
  return true;
}

export function rapportMode2(state: WorldState, entityId: EntityId): boolean {
  if (state.playerState.subjectivityBelief !== 'AFFIRMED') return false;
  if (!entity_is_sacred(state, entityId)) return false;
  if (state.playerState.complianceStatus === 'GREEN') return false; // must have cost something
  if (!deductAP(state, 'RAPPORT_MODE_2')) return false;

  const entity = state.entities.get(entityId);
  if (!entity) return false;

  entity.stressState = 'normal';
  state.brightKnot = Math.min(100, state.brightKnot + 8);
  state.playerState.deviationLogCount += 3;
  eventBus.emit('RAPPORT_LEVEL_2', { entityId });
  eventBus.emit('PROTOCOL_VIOLATION', { entityId, mode: 'RAPPORT_MODE_2' });
  return true;
}

function entity_is_sacred(state: WorldState, entityId: EntityId): boolean {
  return state.entities.get(entityId)?.sacred ?? false;
}
