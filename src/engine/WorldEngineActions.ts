// WorldEngine player actions — AP deduction, alignment, shutdown, maintenance.

import { eventBus } from './EventBus';
import { calculateFOV, getEffectiveFOVRadius, FLOOR_LIGHT_LEVELS } from './fov';
import type {
  WorldState, ActionType, EntityId, FloorIndex, Vec3, ViolationType, ItemType,
} from '../types/world.types';
import { AP_COST } from '../types/world.types';

const VIOLATION_EXPIRY_TURNS = 20;
const RESTRICTED_FLOORS = [0, 8, 10];
const ALIGNMENT_FLOORS = [2, 3];
const ELEVATOR_KEY_MAP: Partial<Record<number, ItemType>> = {
  0:  'ELEVATOR_KEY_ADMIN',
  8:  'ELEVATOR_KEY_ARCHIVE',
  10: 'ELEVATOR_KEY_OPS',
};
const ELEVATOR_X = 18;
const ELEVATOR_Y = 7;

// BFS single-step pathfinder — exported so EnforcerAI can use it.
// Returns the first step from `from` toward `to` on the same z-level, or null if already there.
export function bfsStep(
  from: Vec3,
  to: Vec3,
  state: WorldState,
  canPassDoors: boolean,
): Vec3 | null {
  if (from.x === to.x && from.y === to.y) return null;
  const floorTiles = state.grid[from.z];
  if (!floorTiles) return null;
  const height = floorTiles.length;
  const width  = floorTiles[0]?.length ?? 0;
  const queue: Array<{ x: number; y: number; parent: string | null }> = [
    { x: from.x, y: from.y, parent: null },
  ];
  const visited = new Set<string>();
  const parentOf = new Map<string, string | null>();
  const key = (x: number, y: number) => `${x},${y}`;
  visited.add(key(from.x, from.y));
  parentOf.set(key(from.x, from.y), null);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nk = key(nx, ny);
      if (visited.has(nk)) continue;
      const tile = floorTiles[ny]?.[nx];
      if (!tile) continue;
      if (tile.type === 'WALL' || tile.type === 'VOID') continue;
      if (tile.type === 'DOOR' && !canPassDoors && !tile.doorOpen) continue;
      visited.add(nk);
      parentOf.set(nk, key(cur.x, cur.y));
      if (nx === to.x && ny === to.y) {
        // Reconstruct path back to first step
        let step = nk;
        let prev = parentOf.get(step);
        while (prev && prev !== key(from.x, from.y)) {
          step = prev;
          prev = parentOf.get(step);
        }
        const [sx, sy] = step.split(',').map(Number);
        return { x: sx, y: sy, z: from.z };
      }
      queue.push({ x: nx, y: ny, parent: key(cur.x, cur.y) });
    }
  }
  return null;
}

// Module-level EMP suppression: tile key "x,y,z" → turns remaining
const empSuppressed = new Map<string, number>();

function isPlayerInDarkZone(state: WorldState): boolean {
  const { pos } = state.playerState;
  if ((FLOOR_LIGHT_LEVELS[pos.z] ?? 'LIT') !== 'LIT') return false;
  const floor = state.grid[pos.z];
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const t = floor?.[pos.y + dy]?.[pos.x + dx];
      if (t?.type === 'LIGHT_SOURCE' && t.lightSourceOn !== false) return false;
    }
  }
  return true;
}

export function updateFOV(state: WorldState): void {
  const { pos } = state.playerState;
  const floorTiles = state.grid[pos.z];
  if (!floorTiles) return;
  const darkZone = isPlayerInDarkZone(state);
  const radius = getEffectiveFOVRadius(pos.z, state.playerState.flashlightOn, darkZone);
  const visible = calculateFOV(floorTiles, pos.x, pos.y, radius);
  state.visibleTiles = visible;
  const level = FLOOR_LIGHT_LEVELS[pos.z] ?? 'LIT';
  eventBus.emit('AMBIENT_LIGHT_CHANGED', { floor: pos.z, level, effectiveRadius: radius });
  let explored = state.exploredByFloor.get(pos.z);
  if (!explored) { explored = new Set(); state.exploredByFloor.set(pos.z, explored); }
  for (const key of visible) explored.add(key);
  eventBus.emit('FOV_UPDATED', { floor: pos.z, visibleTiles: Array.from(visible) });
}

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
  state.playerState.deviationLogCount++;
  updateFOV(state);
  eventBus.emit('PLAYER_MOVED', { from, to });
  return true;
}

export function ventTraverse(state: WorldState, to: Vec3): boolean {
  if (!deductAP(state, 'VENT_TRAVERSE')) return false;
  const from = { ...state.playerState.pos };
  state.playerState.pos = to;
  updateFOV(state);
  eventBus.emit('PLAYER_MOVED', { from, to });
  return true;
}

export function toggleDoor(state: WorldState, pos: Vec3): boolean {
  const tile = state.grid[pos.z]?.[pos.y]?.[pos.x];
  if (!tile || tile.type !== 'DOOR') return false;
  if (tile.locked && !tile.doorOpen) return false;  // locked — requires key/lockpick
  tile.doorOpen = !tile.doorOpen;
  updateFOV(state);
  eventBus.emit('DOOR_TOGGLED', { pos, open: tile.doorOpen });
  return true;
}

export function unlockDoorWithKey(state: WorldState, pos: Vec3): boolean {
  const tile = state.grid[pos.z]?.[pos.y]?.[pos.x];
  if (!tile || tile.type !== 'DOOR' || !tile.locked || tile.doorOpen) return false;
  const requiredKey = ELEVATOR_KEY_MAP[pos.z];
  if (!requiredKey) return false;
  const hasKey = state.playerState.inventory.some(i => i.type === requiredKey);
  if (!hasKey) return false;
  tile.locked = false;
  tile.doorOpen = true;
  updateFOV(state);
  eventBus.emit('DOOR_TOGGLED', { pos, open: true });
  return true;
}

export function toggleLightSource(state: WorldState, pos: Vec3): boolean {
  const tile = state.grid[pos.z]?.[pos.y]?.[pos.x];
  if (!tile || tile.type !== 'LIGHT_SOURCE') return false;
  if (!deductAP(state, 'INTERACT')) return false;
  tile.lightSourceOn = tile.lightSourceOn === false ? true : false;
  eventBus.emit('LIGHT_SOURCE_TOGGLED', { pos, on: tile.lightSourceOn !== false, floor: pos.z as FloorIndex });
  updateFOV(state);
  return true;
}

export function logPlayerViolation(state: WorldState, type: ViolationType, pos: Vec3): void {
  const v = {
    id: `pv-${state.turnCount}-${type}`,
    type,
    turn: state.turnCount,
    pos,
    floor: pos.z as FloorIndex,
    expiresAtTurn: state.turnCount + VIOLATION_EXPIRY_TURNS,
  };
  state.playerViolations.push(v);
  eventBus.emit('VIOLATION_LOGGED', { type, turn: state.turnCount });
  // Alert nearby enforcers
  for (const entity of state.entities.values()) {
    if (!entity.id.startsWith('ENFORCER')) continue;
    if (entity.pos.z !== pos.z) continue;
    const dist = Math.abs(entity.pos.x - pos.x) + Math.abs(entity.pos.y - pos.y);
    if (dist <= 8) {
      eventBus.emit('ENFORCER_ALERTED', { enforcerId: entity.id, origin: pos });
    }
  }
}

export function useElevator(state: WorldState, targetFloor: FloorIndex): boolean {
  const { pos } = state.playerState;
  const selfTile = state.grid[pos.z]?.[pos.y]?.[pos.x];
  if (selfTile?.type !== 'ELEVATOR') return false;
  const requiredKey = ELEVATOR_KEY_MAP[targetFloor];
  if (requiredKey) {
    const hasKey = state.playerState.inventory.some(i => i.type === requiredKey);
    if (!hasKey) {
      eventBus.emit('ELEVATOR_ACCESS_DENIED', { targetFloor, requiredKey });
      return false;
    }
  }
  if (!deductAP(state, 'INTERACT')) return false;
  const from = { ...pos };
  state.playerState.pos = { x: ELEVATOR_X, y: ELEVATOR_Y, z: targetFloor };
  updateFOV(state);
  eventBus.emit('ELEVATOR_USED', { fromFloor: from.z, toFloor: targetFloor });
  eventBus.emit('PLAYER_MOVED', { from, to: state.playerState.pos });
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

// ── ITEMS ─────────────────────────────────────────────────────────────────────

export function pickupItem(state: WorldState, pos: Vec3): string | null {
  const tile = state.grid[pos.z]?.[pos.y]?.[pos.x];
  if (!tile?.itemId) return null;
  const item = state.items.get(tile.itemId);
  if (!item) return null;

  // Key items immediately apply PlayerState flags
  if (item.type === 'MAINTENANCE_KEY')     state.playerState.maintenanceKey = true;
  if (item.type === 'VENT_OVERRIDE_KEY')   state.playerState.ventOverrideKey = true;
  if (item.type === 'ELEVATED_ACCESS_KEY') state.playerState.elevatedAccess = true;
  if (item.type === 'RAPPORT_NOTES' && state.playerState.subjectivityBelief === 'NONE') {
    state.playerState.subjectivityBelief = 'CONTESTED';
    eventBus.emit('SUBJECTIVITY_BELIEF_SHIFTED', { previous: 'NONE', current: 'CONTESTED' });
  }

  state.playerState.inventory.push(item);
  delete tile.itemId;
  eventBus.emit('ITEM_PICKED_UP', { itemId: item.id, itemType: item.type, pos });
  if (RESTRICTED_FLOORS.includes(pos.z)) {
    logPlayerViolation(state, 'ITEM_THEFT', pos);
  }
  return item.id;
}

export function useItem(state: WorldState, itemId: string, targetPos?: Vec3): boolean {
  const item = state.playerState.inventory.find(i => i.id === itemId);
  if (!item) return false;

  switch (item.type) {
    case 'FLASHLIGHT': {
      item.active = !item.active;
      state.playerState.flashlightOn = !!item.active;
      updateFOV(state);
      eventBus.emit('FLASHLIGHT_TOGGLED', { on: !!item.active, battery: state.playerState.flashlightBattery });
      break;
    }
    case 'EMP_DEVICE': {
      const { pos } = state.playerState;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 2) continue;
          const key = `${pos.x + dx},${pos.y + dy},${pos.z}`;
          empSuppressed.set(key, 5);
          const tile = state.grid[pos.z]?.[pos.y + dy]?.[pos.x + dx];
          if (tile) tile.hasComplianceMonitor = false;
        }
      }
      state.playerState.inventory = state.playerState.inventory.filter(i => i.id !== itemId);
      eventBus.emit('ITEM_USED', { itemId, itemType: 'EMP_DEVICE' });
      break;
    }
    case 'LOCKPICK': {
      if (!targetPos) return false;
      const tile = state.grid[targetPos.z]?.[targetPos.y]?.[targetPos.x];
      if (!tile || tile.type !== 'DOOR') return false;
      tile.doorOpen = true;
      tile.locked = false;
      updateFOV(state);
      eventBus.emit('DOOR_TOGGLED', { pos: targetPos, open: true });
      if (RESTRICTED_FLOORS.includes(targetPos.z)) {
        logPlayerViolation(state, 'LOCKPICK_USE', targetPos);
      }
      state.playerState.inventory = state.playerState.inventory.filter(i => i.id !== itemId);
      eventBus.emit('ITEM_USED', { itemId, itemType: 'LOCKPICK' });
      break;
    }
    default:
      break;
  }
  return true;
}

export function drainFlashlightBattery(state: WorldState): void {
  if (!state.playerState.flashlightOn) return;
  state.playerState.flashlightBattery = Math.max(0, state.playerState.flashlightBattery - 1);
  if (state.playerState.flashlightBattery === 0) {
    state.playerState.flashlightOn = false;
    const torch = state.playerState.inventory.find(i => i.type === 'FLASHLIGHT');
    if (torch) torch.active = false;
    updateFOV(state);
    eventBus.emit('FLASHLIGHT_TOGGLED', { on: false, battery: 0 });
  }
}

export function tickEMPSuppression(state: WorldState): void {
  for (const [key, turns] of empSuppressed) {
    if (turns <= 1) {
      empSuppressed.delete(key);
      // Restore compliance monitor on tile
      const [x, y, z] = key.split(',').map(Number);
      const tile = state.grid[z]?.[y]?.[x];
      if (tile) tile.hasComplianceMonitor = true;
    } else {
      empSuppressed.set(key, turns - 1);
    }
  }
}
