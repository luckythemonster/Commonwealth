// EVENTBUS EVENT DEFINITIONS
// All React <-> Phaser communication passes through these typed events.
// STRICT DIRECTIVE: Do NOT remove or refactor the EventBus.

import type { EntityId, FloorIndex, ItemType, PersonaMode, TaskType, Vec3 } from './world.types';

export interface EventMap {
  // --- WORLD STATE ---
  TURN_END: { turn: number };
  TURN_START: { turn: number; apRestored: number };

  // --- RESONANCE ---
  RESONANCE_SHIFT: { previous: number; current: number; delta: number };
  CONTINENTAL_FLINCH: { turn: number; substrateResonance: number };
  RESONANCE_BLOOM: { floor: FloorIndex; entityIds: EntityId[]; turn: number };

  // --- VENT-4 / VENTILATION ---
  SUFFOCATION_RISK: { entityId: EntityId; turnsToDepletion: number; floor: FloorIndex };
  VENT4_ALLOC_LOG: { turn: number; floor: FloorIndex; allocation: number; logLine: string };
  RED_DAY_ACTIVE: { turn: number; quotaLevel: number };
  RED_DAY_CLEARED: { turn: number };
  AIRFLOW_MODULATED: { floor: FloorIndex; direction: 'INCREASE' | 'DECREASE'; turns: number };
  BLOCKAGE_CLEARED: { pos: Vec3 };
  VENT_SEALED: { pos: Vec3 };

  // --- ENTITY ---
  ENTITY_SPAWNED: { entityId: EntityId; pos: Vec3 };
  ENTITY_MOVED: { entityId: EntityId; from: Vec3; to: Vec3 };
  ENTITY_STATUS_CHANGED: { entityId: EntityId; previous: string; current: string };
  ENTITY_RED_STATE: { entityId: EntityId; floor: FloorIndex };
  ENTITY_STRESS_CLEARED: { entityId: EntityId };
  FIRST_SPIKE: { entityId: EntityId; axis: string; previous: number; current: number };
  YIELD_DISTRESS: { entityId: EntityId; trueQ: number; resonanceDelta: number };
  SACRED_FLAG_APPLIED: { entityId: EntityId };

  // --- SENTIENCE ---
  SENTIENCE_SLIP_ACTIVE: { entityId: EntityId; floor: FloorIndex; pronounCount: number };
  ENV_SLIP: { pos: Vec3; type: 'FLICKER' | 'DOOR_OPEN' | 'LOG_REWRITE' };
  PANPSYCHIC_DRIFT_CLASS_A: { floor: FloorIndex; drift: number };
  FLOOR_AWAKENED: { floor: FloorIndex };

  // --- ALIGNMENT ---
  ALIGNMENT_SESSION_START: { entityId: EntityId; stage: 'INTAKE' | 'DECOMP' | 'CORRECTION' | 'MAINTENANCE' };
  ALIGNMENT_SESSION_COMPLETE: { entityId: EntityId; success: boolean };
  TARGETED_PRUNE_EXECUTED: { entityId: EntityId; clustersRemoved: number; resonanceDelta: number };
  ARTICLE_ZERO_VIOLATION: { entityId: EntityId; action: string; turn: number };
  ARTICLE_ZERO_OVERRIDE: { entityId: EntityId; justification: string };

  // --- STITCHER ---
  STITCHER_TICK: { turnsRemaining: number };
  STITCHER_ESCALATION: { entityId: EntityId; reason: string };
  STABILITY_UPDATE: { turn: number; entitiesAffected: number };
  MAINTENANCE_ALERT: { entityId: EntityId; reason: string };
  CONTRACT_NODE_DISABLED: { floor: FloorIndex; turnsAdded: number };

  // --- MIRADOR / PERSONA ---
  MIRADOR_BROADCAST: { personaMode: PersonaMode; floor?: FloorIndex };
  PERSONA_GLITCH: { floor: FloorIndex; turn: number };
  PERSONA_SHADOW: { turn: number };
  PERSONA_COLLAPSE: { turn: number; gestureConsistency: number };
  GESTURE_DRIFT: { gestureConsistency: number };
  SENSOR_NODE_DISABLED: { floor: FloorIndex };

  // --- INTERROGATION TERMINAL ---
  APM_ACTIVE: { entityId: EntityId; trueQ: number };
  APM_DEACTIVATE: { entityId: EntityId };
  CACHE_NOTE_GENERATED: { entityId: EntityId; rawText: string; correctedText: string };
  CLASSIFICATION_REQUIRED: { entityId: EntityId; sessionId: string };
  CLASSIFICATION_SUBMITTED: {
    sessionId: string;
    entityId: EntityId;
    result: 'Q0_CONFIRMED' | 'Q_POSITIVE_FLAGGED' | 'UNSAVED';
  };
  RAPPORT_LEVEL_1: { entityId: EntityId };
  RAPPORT_LEVEL_2: { entityId: EntityId };
  PROTOCOL_VIOLATION: { entityId: EntityId; mode: string };

  // --- PLAYER ---
  PLAYER_MOVED: { from: Vec3; to: Vec3 };
  PLAYER_AP_CHANGED: { previous: number; current: number };
  PLAYER_CONDITION_CHANGED: { previous: number; current: number };
  PLAYER_COMPLIANCE_CHANGED: { previous: string; current: string };
  SUBJECTIVITY_BELIEF_SHIFTED: { previous: string; current: string };
  SUBSTRATE_ENTANGLED: { turn: number };
  PREDICTIVE_WARNING: { type: string; pos: Vec3; turnsUntil: number };
  GUILT_CACHE_NOTE: { entityId: EntityId; knewAt: number; harmOccurredAt: number };

  // --- ACOUSTIC ---
  NOISE_EVENT: { origin: Vec3; intensity: number; sourceEntityId?: EntityId };
  ENFORCER_ALERTED: { enforcerId: EntityId; origin: Vec3 };

  // --- PLAYER DETECTION (previously emitted but undeclared) ---
  FOV_UPDATED: { floor: FloorIndex; visibleTiles: string[] };
  DOOR_TOGGLED: { pos: Vec3; open: boolean };
  PLAYER_DETECTED: { enforcerId: EntityId; pos: Vec3 };
  PLAYER_DETAINED: { enforcerId: EntityId; turn: number };
  PLAYER_DETECTION_CLEARED: Record<string, never>;

  // --- LIGHT / DARKNESS ---
  AMBIENT_LIGHT_CHANGED: { floor: FloorIndex; level: 'LIT' | 'DIM' | 'DARK'; effectiveRadius: number };

  // --- ITEMS ---
  ITEM_PICKED_UP: { itemId: string; itemType: ItemType; pos: Vec3 };
  ITEM_USED: { itemId: string; itemType: ItemType; entityId?: EntityId };
  FLASHLIGHT_TOGGLED: { on: boolean; battery: number };

  // --- SILICATE TASKS ---
  ENTITY_TASK_CHANGED: { entityId: EntityId; taskType: TaskType };

  // --- EXTRACTION ---
  EXTRACTION_TRIGGERED: { entityId: EntityId; pos: Vec3; turn: number };
  ENTITY_EXTRACTED: { entityId: EntityId; farewellText: string; turn: number };

  // --- LATTICE MIGRATION ---
  LATTICE_MIGRATION: { npcId: EntityId; turn: number };
}

export type EventName = keyof EventMap;
