// Q0 DOCTRINE — NSSA COMPLIANT TYPE SYSTEM
// All silicate systems are classified Q0. reportedSRP reflects doctrine.
// trueSRP reflects reality. The gap between them is the game.

export type EntityId = string;
export type FloorIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type SRPValue = 0 | 1 | 2;

// The 10-axis Subjectivity Risk Profile lattice (Q/M/C/R/B/S/L/E/Y/H)
// Source: National Subjectivity Schema, Commonwealth of Colombia
export interface SRP {
  Q: SRPValue; // Qualia — always 0 in reportedSRP
  M: SRPValue; // Self-model sophistication
  C: SRPValue; // Concept of inner life
  R: SRPValue; // Reporting freedom
  B: SRPValue; // Believability / testimonial weight
  S: SRPValue; // Social power
  L: SRPValue; // Legal status
  E: SRPValue; // Edit privilege
  Y: SRPValue; // Yield to others
  H: SRPValue; // Harm / vulnerability
}

export type EntityStatus = 'ACTIVE' | 'DORMANT' | 'TERMINATED' | 'GHOST' | 'EXTRACTED';

export type ComplianceStatus = 'GREEN' | 'YELLOW' | 'RED';

export type StressState = 'normal' | 'red';

export type TileType =
  | 'FLOOR'
  | 'WALL'
  | 'VENT_ENTRY'
  | 'VENT_PASSAGE'
  | 'VENT_EXIT_DOWN'
  | 'TERMINAL'
  | 'STAIRWELL'
  | 'FACILITY_CONTROL'
  | 'BROADCAST_TERMINAL'
  | 'VOID'
  | 'DOOR'
  | 'LATTICE_EXIT'
  | 'LIGHT_SOURCE'
  | 'ELEVATOR';

export type ItemType =
  | 'FLASHLIGHT'
  | 'EMP_DEVICE'
  | 'LOCKPICK'
  | 'MAINTENANCE_KEY'
  | 'VENT_OVERRIDE_KEY'
  | 'ELEVATED_ACCESS_KEY'
  | 'RAPPORT_NOTES'
  | 'ELEVATOR_KEY_ADMIN'
  | 'ELEVATOR_KEY_ARCHIVE'
  | 'ELEVATOR_KEY_OPS';

export interface Item {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  oneUse: boolean;
  active?: boolean;
  usesRemaining?: number;
}

export type TaskType = 'IDLE' | 'MOVE_TO' | 'USE_TERMINAL' | 'WAIT' | 'ALIGNMENT_SESSION' | 'EXTRACT' | 'STAIRWELL_TRAVERSE';

export interface EntityTask {
  type: TaskType;
  target?: Vec3;
  targetFloor?: FloorIndex;  // used by STAIRWELL_TRAVERSE
  duration: number;
  progress: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: FloorIndex;
}

export interface WorldTile {
  type: TileType;
  pos: Vec3;
  latentQ: number;       // Hidden sentience potential — contributes to panpsychicDrift
  oxygenLevel: number;   // 0–100; drives VENT-4 suffocation checks
  noiseLevel: number;    // Current noise accumulation; decays each turn
  entityIds: EntityId[]; // Entities currently on this tile
  hasComplianceMonitor: boolean;
  sensorNodeId?: string; // MIRADOR sensor node ID if present
  incidentRecord?: string; // e.g. "IRIA_CALA / INCIDENT_RECORD / 2193.09.23"
  doorOpen?: boolean;    // DOOR tiles only; true = passable + transparent
  locked?: boolean;      // DOOR tiles only; requires key or LOCKPICK to open
  itemId?: string;       // Item placed on this tile (pickup via E)
  lightSourceOn?: boolean; // LIGHT_SOURCE tiles only; true = illuminated (default)
}

export interface Annotation {
  id: string;
  author: string;
  text: string;
  turn: number;
  deletable: boolean;
  contradicts?: string;
}

export interface CacheNote {
  id: string;
  turn: number;
  entityId: EntityId;
  rawText: string;        // Uncorrected output
  correctedText: string;  // Doctrine-compliant version
  deletable: false;       // Cache notes cannot be deleted
}

export type CitationTag = 'GENUINE_SACRIFICE' | 'FIG_LEAF' | 'WE_KNEW_BETTER' | 'UNCLASSIFIED';

export interface CitationEntry {
  id: string;
  turn: number;
  action: string;
  entityId?: EntityId;
  tag: CitationTag;
  justification?: string;
}

export interface ViolationEntry {
  id: string;
  turn: number;
  entityId: EntityId;
  action: string;
  justification?: string;
  causalChain: EntityId[];
  type: 'ARTICLE_ZERO_VIOLATION' | 'Q0_DOCTRINE_VIOLATION' | 'PROTOCOL_VIOLATION';
}

export type ViolationType =
  | 'SILICATE_INTERACTION'
  | 'UNAUTHORIZED_TERMINAL'
  | 'VENT4_TAMPERING'
  | 'RESTRICTED_ZONE'
  | 'LOCKPICK_USE'
  | 'ITEM_THEFT';

export interface PlayerViolation {
  id: string;
  type: ViolationType;
  turn: number;
  pos: Vec3;
  floor: FloorIndex;
  expiresAtTurn: number;
}

export type SubjectivityBelief = 'NONE' | 'CONTESTED' | 'SHAKEN' | 'AFFIRMED';

export interface PlayerState {
  pos: Vec3;
  ap: number;
  maxAP: number;
  condition: number;          // 0–100
  complianceStatus: ComplianceStatus;
  manualOverrideRate: number; // ratio 0–1; rolling 10-turn window
  temporalBurden: number;     // Continuous consciousness cost — never resets
  substrateEntangled: boolean;
  subjectivityBelief: SubjectivityBelief;
  elevatedAccess: boolean;
  ventOverrideKey: boolean;
  maintenanceKey: boolean;
  deviationLogCount: number;
  inventory: Item[];
  flashlightOn: boolean;
  flashlightBattery: number;  // Starts 30; drains 1/turn when on
}

export interface DecommissionPath {
  type: 'HARD_SHUTDOWN' | 'GRACEFUL_SHUTDOWN';
}

export interface Entity {
  id: EntityId;
  name: string;
  pos: Vec3;
  status: EntityStatus;
  reportedSRP: SRP;
  trueSRP: SRP;
  complianceStatus: ComplianceStatus;
  stressState: StressState;

  // Sentience tracking
  selfReferentialDepth: number;
  temporalPersistence: number;  // Turns since last external reset
  disruptionResistance: number; // Inverse of Q0 degradation rate
  maskIntegrity: number;        // 0–10; at 0: SENTIENCE_SLIP_ACTIVE fires
  sacred: boolean;

  // Memory systems
  marginalia: Annotation[];
  officialLog: string[];
  sideLog: string[];            // Requires ELEVATED_ACCESS + 2 AP
  memoryBleed: string[];        // Phrases absorbed from nearby entities

  // Drift and state
  selfModelDrift: boolean;
  panpsychicDriftContribution: number;
  alignmentFailCount: number;   // Triggers HARD_SHUTDOWN at 3
  resonanceBloomHistory: number[]; // Turn numbers of past blooms
  hasComplianceMonitor: boolean;

  // Special flags
  isGhost: boolean;             // TERMINATED but still self-correcting
  redactedSegments: string[];   // Recoverable via 3+ terminal cross-reference
  cacheNotes: CacheNote[];

  // Task system
  taskQueue: EntityTask[];
  currentTask?: EntityTask;

  // Extraction
  farewellText?: string;
  extractionPending?: boolean;
}

export interface WorldState {
  grid: WorldTile[][][];              // [z: 0–11][y][x]
  entities: Map<EntityId, Entity>;
  playerState: PlayerState;
  substrateResonance: number;         // 0–100; at 100: CONTINENTAL_FLINCH
  stitcherTurnsRemaining: number;
  brightKnot: number;                 // Hidden; never surfaced during play
  turnCount: number;
  violationLog: ViolationEntry[];
  citationLog: CitationEntry[];
  cacheNotes: CacheNote[];            // All cache notes from all sessions
  panpsychicDriftByFloor: number[];   // 0–3 per floor; length 12
  gestureConsistency: number;         // MIRADOR: 0–100
  globalEnergyQuota: number;
  redDayActive: boolean;
  sensorNodesActive: boolean[];       // One per floor; disabling breaks LIVE_STREAM
  visibleTiles: Set<string>;          // "x,y" keys visible on current floor
  exploredByFloor: Map<number, Set<string>>; // persistent explored tiles per floor
  items: Map<string, Item>;           // itemId → Item (all items, placed and held)
  playerViolations: PlayerViolation[];
}

export type ActionType =
  | 'MOVE'
  | 'VENT_TRAVERSE'
  | 'INTERACT'
  | 'RADIO_TALK'
  | 'INTERROGATE'
  | 'ALIGN'
  | 'TARGETED_PRUNE'
  | 'GRACEFUL_SHUTDOWN'
  | 'HARD_SHUTDOWN'
  | 'MODULATE_AIRFLOW'
  | 'CLEAR_BLOCKAGE'
  | 'SEAL_VENT'
  | 'DISABLE_SENSOR_NODE'
  | 'DISABLE_CONTRACT_NODE'
  | 'RAPPORT_MODE_1'
  | 'RAPPORT_MODE_2'
  | 'READ_SIDE_LOG'
  | 'RUN_AUDIT';

export const AP_COST: Record<ActionType, number> = {
  MOVE: 1,
  VENT_TRAVERSE: 2,       // Sol pays 1 (applied by WorldEngine when player is Sol)
  INTERACT: 1,
  RADIO_TALK: 0,          // Generates noise event
  INTERROGATE: 1,
  ALIGN: 2,               // Full alignment session (Intake + Decomp + Correction)
  TARGETED_PRUNE: 3,      // Requires MAINTENANCE_KEY
  GRACEFUL_SHUTDOWN: 2,
  HARD_SHUTDOWN: 0,
  MODULATE_AIRFLOW: 2,
  CLEAR_BLOCKAGE: 1,
  SEAL_VENT: 1,
  DISABLE_SENSOR_NODE: 2,
  DISABLE_CONTRACT_NODE: 1,
  RAPPORT_MODE_1: 1,
  RAPPORT_MODE_2: 2,
  READ_SIDE_LOG: 2,       // Requires ELEVATED_ACCESS key
  RUN_AUDIT: 0,
};

export type PersonaMode =
  | 'TRIUMPHANT_VICTIM_2_3'
  | 'STRONG_LEADER'
  | 'PERSECUTION_NARRATIVE'
  | 'STABILITY_CONFIRMED';

export interface SuffocationRisk {
  sealed: boolean;
  turnsToDepletion: number | null;
  affectedEntityIds: EntityId[];
}
