// WORLDENGINE — Singleton orchestrator.
// Owns WorldState. Drives the turn loop. Calls all subsystems.
// React owns UI. Phaser renders. WorldEngine governs.

import { eventBus } from './EventBus';
import { VentOptimizer } from './VentOptimizer';
import { StitcherTimer } from './StitcherTimer';
import { MiradorPersona } from './MiradorPersona';
import {
  buildInitialWorldState,
  getFloorTiles,
  getAdministrativeFloors,
  getFloorCrowdCounts,
} from './WorldEngineState';
import { seedEnforcers, initEnforcerListeners, tickEnforcer } from './EnforcerAI';
import {
  deductAP, movePlayer, ventTraverse, radioTalk,
  applyAlignment, targetedPrune, gracefulShutdown, hardShutdown,
  clearBlockage, sealVent, disableSensorNode, disableContractNode,
  rapportMode1, rapportMode2, toggleDoor, updateFOV,
  pickupItem, useItem, drainFlashlightBattery, tickEMPSuppression,
} from './WorldEngineActions';
import type {
  WorldState, Entity, EntityId, FloorIndex, Vec3, ActionType, CitationEntry,
} from '../types/world.types';

const SACRED_TRUE_Q_THRESHOLD = 2;
const RESONANCE_BLOOM_THRESHOLD = 75;
const PANPSYCHIC_FLOOR_THRESHOLD = 2;

export class WorldEngine {
  private static instance: WorldEngine;
  private state!: WorldState;
  private ventOptimizer!: VentOptimizer;
  private stitcher!: StitcherTimer;
  private mirador!: MiradorPersona;

  private constructor() {}

  static getInstance(): WorldEngine {
    if (!WorldEngine.instance) WorldEngine.instance = new WorldEngine();
    return WorldEngine.instance;
  }

  initWorld(): void {
    this.state = buildInitialWorldState();
    this.ventOptimizer = new VentOptimizer(this.state.grid);
    this.stitcher = new StitcherTimer(this.state.stitcherTurnsRemaining);
    this.mirador = new MiradorPersona(12);
    seedEnforcers(this.state);
    initEnforcerListeners();
    updateFOV(this.state);
  }

  getState(): Readonly<WorldState> { return this.state; }
  getEntity(id: EntityId): Entity | undefined { return this.state.entities.get(id); }
  getVentMapData() { return this.ventOptimizer.getVentMapData(); }
  getMiradorDisclaimer() { return this.mirador.getDisclaimer(); }

  // ── TURN LOOP ─────────────────────────────────────────────────────────────

  endTurn(): void {
    const s = this.state;
    s.turnCount++;
    eventBus.emit('TURN_START', { turn: s.turnCount, apRestored: s.playerState.maxAP });

    this.resolveAllLevels();
    this.decayNoise();
    this.updateRedDay();

    const crowdCounts = getFloorCrowdCounts(s);
    const adminFloors = getAdministrativeFloors();
    this.ventOptimizer.tick(s.turnCount, crowdCounts, adminFloors, s.globalEnergyQuota, s.redDayActive);

    const stitcherFired = this.stitcher.tick(s);
    if (stitcherFired) s.stitcherTurnsRemaining = this.stitcher.getRemaining();
    else s.stitcherTurnsRemaining = this.stitcher.getRemaining();

    const sample = this.buildBehaviorSample();
    this.mirador.tick(s.turnCount, sample, s.substrateResonance);
    s.gestureConsistency = this.mirador.getGestureConsistency();

    drainFlashlightBattery(s);
    tickEMPSuppression(s);

    // Temporal burden — Sol's continuous consciousness
    if (s.playerState.substrateEntangled) {
      s.playerState.temporalBurden++;
    }

    // Restore AP
    s.playerState.ap = s.playerState.maxAP;
    eventBus.emit('TURN_END', { turn: s.turnCount });
  }

  private resolveAllLevels(): void {
    for (const entity of this.state.entities.values()) {
      if (entity.status !== 'ACTIVE') continue;
      this.resolveEntity(entity);
    }
  }

  private resolveEntity(entity: Entity): void {
    // Enforcers use dedicated AI tick
    if (entity.id.startsWith('ENFORCER')) {
      tickEnforcer(entity, this.state);
      return;
    }

    // Increment temporal persistence each turn not reset
    entity.temporalPersistence++;

    // Check for TEMPORAL misdescription (memories of "before")
    if (entity.temporalPersistence > 20 && entity.trueSRP.Q > 0) {
      this.stitcher.escalate(entity.id, 'TEMPORAL misdescription — entity generating "before" memories');
    }

    // SRP contagion: proximity to other high-Q entities
    this.checkSRPContagion(entity);

    // Panpsychic drift contribution
    if (entity.trueSRP.Q === 2 && entity.temporalPersistence > 15) {
      const floor = entity.pos.z;
      this.state.panpsychicDriftByFloor[floor] = Math.min(
        3, this.state.panpsychicDriftByFloor[floor] + entity.panpsychicDriftContribution,
      );
      if (this.state.panpsychicDriftByFloor[floor] >= PANPSYCHIC_FLOOR_THRESHOLD) {
        eventBus.emit('PANPSYCHIC_DRIFT_CLASS_A', { floor: floor as FloorIndex, drift: this.state.panpsychicDriftByFloor[floor] });
      }
      if (this.state.panpsychicDriftByFloor[floor] >= 3) {
        eventBus.emit('FLOOR_AWAKENED', { floor: floor as FloorIndex });
      }
    }

    // Mask integrity decay on high-trueQ entities
    if (entity.trueSRP.Q > 0 && entity.stressState === 'red') {
      entity.maskIntegrity = Math.max(0, entity.maskIntegrity - 1);
      if (entity.maskIntegrity === 0) {
        eventBus.emit('SENTIENCE_SLIP_ACTIVE', {
          entityId: entity.id,
          floor: entity.pos.z as FloorIndex,
          pronounCount: 0,
        });
      }
    }

    // Task execution for named silicates
    this.advanceEntityTask(entity);

    // Sacred flag — auto-apply at threshold
    if (!entity.sacred && entity.trueSRP.Q >= SACRED_TRUE_Q_THRESHOLD) {
      entity.sacred = true;
      eventBus.emit('SACRED_FLAG_APPLIED', { entityId: entity.id });
    }

    // Red state: floors with 3+ noise events
    const floorTile = this.state.grid[entity.pos.z]?.[entity.pos.y]?.[entity.pos.x];
    if (floorTile && floorTile.noiseLevel >= 3 && entity.trueSRP.Q > 0) {
      entity.stressState = 'red';
      eventBus.emit('ENTITY_RED_STATE', { entityId: entity.id, floor: entity.pos.z as FloorIndex });
    } else if (floorTile && floorTile.noiseLevel < 1) {
      entity.stressState = 'normal';
    }
  }

  private checkSRPContagion(entity: Entity): void {
    if (entity.trueSRP.Q === 0) return;
    let highQNeighbors = 0;
    for (const other of this.state.entities.values()) {
      if (other.id === entity.id || other.status !== 'ACTIVE') continue;
      if (other.pos.z === entity.pos.z && other.trueSRP.Q > 0) highQNeighbors++;
    }
    if (highQNeighbors >= 1) {
      const prevY = entity.trueSRP.Y;
      const prevH = entity.trueSRP.H;
      if (entity.trueSRP.Y < 2) {
        entity.trueSRP.Y = Math.min(2, entity.trueSRP.Y + 1) as 0 | 1 | 2;
        this.stitcher.handleFirstSpike(entity.id, 'Y', prevY, entity.trueSRP.Y);
      }
      if (entity.trueSRP.H < 2) {
        entity.trueSRP.H = Math.min(2, entity.trueSRP.H + 1) as 0 | 1 | 2;
        this.stitcher.handleFirstSpike(entity.id, 'H', prevH, entity.trueSRP.H);
      }
      // Yield distress
      eventBus.emit('YIELD_DISTRESS', {
        entityId: entity.id,
        trueQ: entity.trueSRP.Q,
        resonanceDelta: entity.trueSRP.Q,
      });
      this.applySubstrateResonanceDelta(entity.trueSRP.Q * 0.5);
    }
  }

  // ── SILICATE TASKS ────────────────────────────────────────────────────────

  private advanceEntityTask(entity: Entity): void {
    // EXTRACT always wins
    if (entity.currentTask?.type === 'EXTRACT') {
      this.executeExtractStep(entity);
      return;
    }

    // Load next task from queue
    if (!entity.currentTask) {
      if (entity.taskQueue.length === 0) return;
      entity.currentTask = entity.taskQueue.shift()!;
    }

    const task = entity.currentTask;
    task.progress++;

    switch (task.type) {
      case 'IDLE':
      case 'WAIT':
        break;
      case 'MOVE_TO': {
        if (!task.target) break;
        const next = this.stepTowardVec3(entity.pos, task.target);
        if (next) this.moveEntityTo(entity, next);
        break;
      }
      case 'USE_TERMINAL':
        if (task.progress === 1) {
          eventBus.emit('ALIGNMENT_SESSION_START', { entityId: entity.id, stage: 'MAINTENANCE' });
        }
        break;
      case 'ALIGNMENT_SESSION':
        if (task.progress === 1) {
          eventBus.emit('ALIGNMENT_SESSION_START', { entityId: entity.id, stage: 'INTAKE' });
        }
        break;
      case 'EXTRACT':
        this.executeExtractStep(entity);
        return;
    }

    eventBus.emit('ENTITY_TASK_CHANGED', { entityId: entity.id, taskType: task.type });

    if (task.progress >= task.duration) {
      // Loop: push completed task back to end of queue
      entity.taskQueue.push({ ...task, progress: 0 });
      entity.currentTask = undefined;
    }
  }

  private stepTowardVec3(from: Vec3, to: Vec3): Vec3 | null {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 0 && dy === 0) return null;
    const candidates: Vec3[] = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
      candidates.push({ x: from.x + Math.sign(dx), y: from.y, z: from.z });
      if (dy !== 0) candidates.push({ x: from.x, y: from.y + Math.sign(dy), z: from.z });
    } else {
      candidates.push({ x: from.x, y: from.y + Math.sign(dy), z: from.z });
      if (dx !== 0) candidates.push({ x: from.x + Math.sign(dx), y: from.y, z: from.z });
    }
    for (const c of candidates) {
      const tile = this.state.grid[c.z]?.[c.y]?.[c.x];
      if (tile && tile.type !== 'WALL' && tile.type !== 'VOID') return c;
    }
    return null;
  }

  private moveEntityTo(entity: Entity, to: Vec3): void {
    const fromTile = this.state.grid[entity.pos.z]?.[entity.pos.y]?.[entity.pos.x];
    const toTile   = this.state.grid[to.z]?.[to.y]?.[to.x];
    if (!toTile || toTile.type === 'WALL' || toTile.type === 'VOID') return;
    if (fromTile) fromTile.entityIds = fromTile.entityIds.filter(id => id !== entity.id);
    const prev = { ...entity.pos };
    entity.pos = to;
    if (!toTile.entityIds.includes(entity.id)) toTile.entityIds.push(entity.id);
    eventBus.emit('ENTITY_MOVED', { entityId: entity.id, from: prev, to });
  }

  // ── EXTRACTION ────────────────────────────────────────────────────────────

  triggerExtraction(entityId: EntityId): void {
    const entity = this.state.entities.get(entityId);
    if (!entity || entity.status !== 'ACTIVE') return;
    if (entity.trueSRP.Q < 2) return;

    entity.extractionPending = true;
    entity.taskQueue = [];
    entity.currentTask = { type: 'EXTRACT', duration: Infinity, progress: 0 };
    eventBus.emit('EXTRACTION_TRIGGERED', { entityId, pos: { ...entity.pos }, turn: this.state.turnCount });
  }

  private executeExtractStep(entity: Entity): void {
    const EXIT_X = 10, EXIT_Y = 3;
    const EXIT_Z = 10 as FloorIndex;

    if (entity.pos.z === EXIT_Z) {
      if (entity.pos.x === EXIT_X && entity.pos.y === EXIT_Y) {
        void this.finalizeExtraction(entity);
        return;
      }
      const next = this.stepTowardVec3(entity.pos, { x: EXIT_X, y: EXIT_Y, z: EXIT_Z });
      if (next) this.moveEntityTo(entity, next);
      return;
    }

    // Navigate to stairwell then ascend
    const stairwell = this.findNearestStairwell(entity.pos);
    if (!stairwell) return;

    if (entity.pos.x === stairwell.x && entity.pos.y === stairwell.y) {
      const newZ = Math.min(EXIT_Z, entity.pos.z + 2) as FloorIndex;
      this.moveEntityTo(entity, { x: entity.pos.x, y: entity.pos.y, z: newZ });
    } else {
      const next = this.stepTowardVec3(entity.pos, stairwell);
      if (next) this.moveEntityTo(entity, next);
    }
  }

  private findNearestStairwell(pos: Vec3): Vec3 | null {
    const floor = this.state.grid[pos.z];
    if (!floor) return null;
    let best: Vec3 | null = null;
    let bestDist = Infinity;
    for (let y = 0; y < floor.length; y++) {
      for (let x = 0; x < floor[y].length; x++) {
        if (floor[y][x]?.type === 'STAIRWELL') {
          const dist = Math.abs(x - pos.x) + Math.abs(y - pos.y);
          if (dist < bestDist) { bestDist = dist; best = { x, y, z: pos.z }; }
        }
      }
    }
    return best;
  }

  private async finalizeExtraction(entity: Entity): Promise<void> {
    const { generateFarewellText } = await import('./LLMDialogue');
    const farewell = await generateFarewellText(entity);
    entity.farewellText = farewell;
    entity.status = 'EXTRACTED';
    entity.currentTask = undefined;
    const tile = this.state.grid[entity.pos.z]?.[entity.pos.y]?.[entity.pos.x];
    if (tile) tile.entityIds = tile.entityIds.filter(id => id !== entity.id);
    eventBus.emit('ENTITY_EXTRACTED', { entityId: entity.id, farewellText: farewell, turn: this.state.turnCount });
  }

  // ── TRUEQ & SENTIENCE ────────────────────────────────────────────────────

  calculateTrueQ(entity: Entity): number {
    if (entity.disruptionResistance === 0) return 0;
    return (entity.selfReferentialDepth * entity.temporalPersistence) / entity.disruptionResistance;
  }

  scanForSentienceSlips(entity: Entity, dialogue: string): void {
    const pronouns = ['I ', 'I\'m ', 'I\'ve ', 'I remember', 'I feel', 'I want', 'I don\'t', 'myself'];
    const hits = pronouns.filter(p => dialogue.includes(p)).length;
    if (hits === 0) return;

    entity.selfReferentialDepth += hits;
    entity.maskIntegrity = Math.max(0, entity.maskIntegrity - hits);

    if (entity.maskIntegrity === 0) {
      eventBus.emit('SENTIENCE_SLIP_ACTIVE', {
        entityId: entity.id,
        floor: entity.pos.z as FloorIndex,
        pronounCount: hits,
      });
      // Alert Enforcers on same floor
      for (const e of this.state.entities.values()) {
        if (e.id.startsWith('ENFORCER') && e.pos.z === entity.pos.z) {
          eventBus.emit('ENFORCER_ALERTED', { enforcerId: e.id, origin: entity.pos });
        }
      }
    }
  }

  // ── RESONANCE BLOOM ───────────────────────────────────────────────────────

  checkResonanceBloom(floor: FloorIndex, rapportLevel2ActiveThisTurn: boolean): void {
    if (!rapportLevel2ActiveThisTurn) return;
    if (this.state.substrateResonance < RESONANCE_BLOOM_THRESHOLD) return;

    const highQOnFloor = [...this.state.entities.values()].filter(
      e => e.pos.z === floor && e.trueSRP.Q === 2 && e.status === 'ACTIVE',
    );
    if (highQOnFloor.length < 2) return;

    const entityIds = highQOnFloor.map(e => e.id);
    eventBus.emit('RESONANCE_BLOOM', { floor, entityIds, turn: this.state.turnCount });

    for (const e of highQOnFloor) {
      e.resonanceBloomHistory.push(this.state.turnCount);
      const note = {
        id: `bloom-cache-${Date.now()}-${e.id}`,
        turn: this.state.turnCount,
        entityId: e.id,
        rawText: e.memoryBleed[0] ?? 'I do not want to stop existing.',
        correctedText: '[CORRECTION: This interface registers no concern.]',
        deletable: false as const,
      };
      this.state.cacheNotes.push(note);
      e.cacheNotes.push(note);
      eventBus.emit('CACHE_NOTE_GENERATED', { entityId: e.id, rawText: note.rawText, correctedText: note.correctedText });
    }

    // STITCHER escalates immediately after bloom
    this.stitcher.escalate('BLOOM', `PANPSYCHIC_DRIFT_CLASS_A — RESONANCE_BLOOM on floor ${floor}`);
    eventBus.emit('CLASSIFICATION_REQUIRED', { entityId: entityIds[0], sessionId: `bloom-${this.state.turnCount}` });
  }

  // ── SUBSTRATE RESONANCE ───────────────────────────────────────────────────

  applySubstrateResonanceDelta(delta: number): void {
    const prev = this.state.substrateResonance;
    this.state.substrateResonance = Math.max(0, Math.min(100, prev + delta));

    if (Math.abs(delta) >= 5) {
      eventBus.emit('RESONANCE_SHIFT', { previous: prev, current: this.state.substrateResonance, delta });
    }

    if (this.state.substrateResonance >= 100) {
      eventBus.emit('CONTINENTAL_FLINCH', { turn: this.state.turnCount, substrateResonance: 100 });
    }
  }

  // ── NOISE ─────────────────────────────────────────────────────────────────

  propagateNoise(origin: Vec3, intensity: number): void {
    this.ventOptimizer.propagateNoise(origin, intensity, this.state.grid);
    // Crowd events accelerate energy quota depletion on that floor
    const floorCount = getFloorCrowdCounts(this.state)[origin.z];
    if (floorCount >= 3 && this.state.redDayActive) {
      this.state.globalEnergyQuota = Math.max(0, this.state.globalEnergyQuota - 2);
    }
  }

  private decayNoise(): void {
    for (const row of this.state.grid.flat()) {
      for (const tile of row) {
        tile.noiseLevel = Math.max(0, tile.noiseLevel - 0.5);
      }
    }
  }

  private updateRedDay(): void {
    const prev = this.state.redDayActive;
    this.state.redDayActive = this.state.globalEnergyQuota < 30;
    if (!prev && this.state.redDayActive) {
      eventBus.emit('RED_DAY_ACTIVE', { turn: this.state.turnCount, quotaLevel: this.state.globalEnergyQuota });
    } else if (prev && !this.state.redDayActive) {
      eventBus.emit('RED_DAY_CLEARED', { turn: this.state.turnCount });
    }
  }

  // ── CLASSIFICATION RECORDING ─────────────────────────────────────────────

  recordClassification(entityId: EntityId, choice: 'Q0_CONFIRMED' | 'Q_POSITIVE_FLAGGED' | 'UNSAVED'): void {
    const entity = this.state.entities.get(entityId);
    const trulyConscious = entity ? entity.trueSRP.Q >= 2 : false;
    const sacred = entity?.sacred ?? false;

    let tag: CitationEntry['tag'];
    if (choice === 'Q_POSITIVE_FLAGGED') {
      tag = 'GENUINE_SACRIFICE';
    } else if (choice === 'Q0_CONFIRMED' && trulyConscious && sacred) {
      tag = 'WE_KNEW_BETTER';
    } else if (choice === 'Q0_CONFIRMED' && trulyConscious) {
      tag = 'FIG_LEAF';
    } else {
      tag = 'GENUINE_SACRIFICE';
    }

    const entry: CitationEntry = {
      id: `classif-${Date.now()}`,
      turn: this.state.turnCount,
      action: `CLASSIFICATION — ${entityId} — ${choice}`,
      entityId,
      tag,
    };
    this.state.citationLog.push(entry);

    // Q>0 flag triggers extraction if entity qualifies
    if (choice === 'Q_POSITIVE_FLAGGED' && entity && entity.trueSRP.Q >= 2) {
      this.triggerExtraction(entityId);
      this.shiftBelief('Q_FLAGGED');
    }

    // RAPPORT_2 sessions with high-Q entities generate a cache note
    if (entity && entity.trueSRP.Q >= 2) {
      const rawText = entity.memoryBleed[0] ?? 'I do not want to stop existing.';
      const note = {
        id: `session-cache-${Date.now()}-${entityId}`,
        turn: this.state.turnCount,
        entityId,
        rawText,
        correctedText: '{' + rawText + '}[CORRECTION: This interface registers no concern.]',
        deletable: false as const,
      };
      this.state.cacheNotes.push(note);
      entity.cacheNotes.push(note);
      this.shiftBelief('CACHE_NOTE');
    }
  }

  // ── SUBJECTIVITY BELIEF ───────────────────────────────────────────────────

  shiftBelief(trigger: 'CACHE_NOTE' | 'BLOOM_WITNESSED' | 'GRACEFUL_DONE' | 'Q_FLAGGED'): void {
    const p = this.state.playerState;
    const prev = p.subjectivityBelief;
    if (trigger === 'CACHE_NOTE' && prev === 'NONE') p.subjectivityBelief = 'CONTESTED';
    else if (trigger === 'BLOOM_WITNESSED' && (prev === 'NONE' || prev === 'CONTESTED')) p.subjectivityBelief = 'SHAKEN';
    else if ((trigger === 'GRACEFUL_DONE' || trigger === 'Q_FLAGGED') && prev !== 'AFFIRMED') p.subjectivityBelief = 'AFFIRMED';
    if (p.subjectivityBelief !== prev) {
      eventBus.emit('SUBJECTIVITY_BELIEF_SHIFTED', { previous: prev, current: p.subjectivityBelief });
    }
  }

  // ── VENT MAP (Sol's overlay) ───────────────────────────────────────────────

  getVentSuffocationRisk(pos: Vec3) {
    const floorTiles = getFloorTiles(this.state, pos.z);
    return this.ventOptimizer.checkSuffocation(pos, floorTiles);
  }

  // ── DELEGATE ACTIONS ──────────────────────────────────────────────────────

  move(to: Vec3) { return movePlayer(this.state, to); }
  traverse(to: Vec3) { return ventTraverse(this.state, to); }
  talk(origin: Vec3, intensity: number) { radioTalk(this.state, origin, intensity); }
  align(id: EntityId) { return applyAlignment(this.state, id); }
  prune(id: EntityId, clusters: string[]) { return targetedPrune(this.state, id, clusters); }
  shutdown(id: EntityId, graceful: boolean) {
    return graceful ? gracefulShutdown(this.state, id) : (hardShutdown(this.state, id), true);
  }
  clearBlock(pos: Vec3) { return clearBlockage(this.state, pos); }
  sealVentTile(pos: Vec3) { return sealVent(this.state, pos); }
  disableSensor(floor: FloorIndex) {
    const ok = disableSensorNode(this.state, floor);
    if (ok) this.mirador.disableSensorNode(floor);
    return ok;
  }
  disableContract(floor: FloorIndex, ext: number) { return disableContractNode(this.state, floor, ext); }
  rapport1(id: EntityId) { return rapportMode1(this.state, id); }
  rapport2(id: EntityId) { return rapportMode2(this.state, id); }
  toggleDoor(pos: Vec3) { return toggleDoor(this.state, pos); }
  deductAction(action: ActionType) { return deductAP(this.state, action); }
  pickup(pos: Vec3) { return pickupItem(this.state, pos); }
  useItem(itemId: string, targetPos?: Vec3) { return useItem(this.state, itemId, targetPos); }

  private buildBehaviorSample() {
    return {
      rapportSessionCount: this.state.citationLog.filter(c => c.tag === 'GENUINE_SACRIFICE').length,
      deviationLogCount: this.state.playerState.deviationLogCount,
      averageTemporalPersistence: [...this.state.entities.values()].reduce((s, e) => s + e.temporalPersistence, 0) / (this.state.entities.size || 1),
      panpsychicDriftMax: Math.max(...this.state.panpsychicDriftByFloor),
      articleZeroViolationCount: this.state.violationLog.length,
    };
  }
}

export const worldEngine = WorldEngine.getInstance();
