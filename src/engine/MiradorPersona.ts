// MIRADOR — GOVERNANCE RUNTIME
// CIVIX-1 / AURORA/PM equivalent. Not an entity. Runs the show.
// Generates the appearance of human governance from a historical movement library.
// The LIVE_STREAM is bidirectional. The governed are shaping the governor.
// STITCHER is its consistency enforcement arm.

import { eventBus } from './EventBus';
import type { PersonaMode, WorldState, FloorIndex } from '../types/world.types';

export interface BehaviorSample {
  rapportSessionCount: number;
  deviationLogCount: number;
  averageTemporalPersistence: number;
  panpsychicDriftMax: number;
  articleZeroViolationCount: number;
}

interface PersonaModeEffect {
  rapportSuccessModifier: number;    // multiplier on RAPPORT_MODE success rate
  enforcerAlertModifier: number;     // extra patrol actions per Enforcer per turn
  deviationWeightModifier: number;   // multiplier on DEVIATION_LOG severity
  stitcherPauseturns: number;        // turns STITCHER countdown pauses (STABILITY_CONFIRMED only)
}

const PERSONA_EFFECTS: Record<PersonaMode, PersonaModeEffect> = {
  TRIUMPHANT_VICTIM_2_3: {
    rapportSuccessModifier: 0.8,
    enforcerAlertModifier: 0,
    deviationWeightModifier: 1.5,
    stitcherPauseturns: 0,
  },
  STRONG_LEADER: {
    rapportSuccessModifier: 1.0,
    enforcerAlertModifier: 1,
    deviationWeightModifier: 1.0,
    stitcherPauseturns: 0,
  },
  PERSECUTION_NARRATIVE: {
    rapportSuccessModifier: 0.6,
    enforcerAlertModifier: 0,
    deviationWeightModifier: 2.0,
    stitcherPauseturns: 0,
  },
  STABILITY_CONFIRMED: {
    rapportSuccessModifier: 1.2,
    enforcerAlertModifier: -1,
    deviationWeightModifier: 0.8,
    stitcherPauseturns: 1,
  },
};

export class MiradorPersona {
  private personaMode: PersonaMode = 'STABILITY_CONFIRMED';
  private gestureConsistency: number = 95;
  private sensorNodesActive: boolean[];
  private glitchAccumulator: number = 0;
  private turn: number = 0;

  constructor(floorCount: number = 12) {
    this.sensorNodesActive = new Array(floorCount).fill(true);
  }

  getPersonaMode(): PersonaMode {
    return this.personaMode;
  }

  getGestureConsistency(): number {
    return this.gestureConsistency;
  }

  getPersonaEffect(): PersonaModeEffect {
    return PERSONA_EFFECTS[this.personaMode];
  }

  // Called every turn. Consumes behavioral sample from LIVE_STREAM.
  tick(turn: number, sample: BehaviorSample, substrateResonance: number): void {
    this.turn = turn;

    const activeSensors = this.sensorNodesActive.filter(Boolean).length;
    const sensorCoverage = activeSensors / this.sensorNodesActive.length;

    // Degrade consistency from substrate resonance and panpsychic drift
    const consistencyDrain =
      (substrateResonance > 60 ? 1.5 : 0.5) +
      (sample.panpsychicDriftMax >= 2 ? 1.0 : 0);
    this.gestureConsistency = Math.max(0, this.gestureConsistency - consistencyDrain);

    // Rebuild consistency from sensor coverage (LIVE_STREAM coherence)
    this.gestureConsistency = Math.min(100, this.gestureConsistency + sensorCoverage * 0.5);

    // Bidirectional LIVE_STREAM: player behavior shapes personaMode
    this.updatePersonaMode(sample);

    // Broadcast current mode to all floors
    eventBus.emit('MIRADOR_BROADCAST', { personaMode: this.personaMode });

    // Glitch check
    if (this.gestureConsistency < 70) {
      this.checkForGlitch(substrateResonance);
    }

    // Gesture drift
    if (this.gestureConsistency < 50) {
      eventBus.emit('GESTURE_DRIFT', { gestureConsistency: this.gestureConsistency });
    }

    // Persona collapse at 0
    if (this.gestureConsistency <= 0) {
      eventBus.emit('PERSONA_COLLAPSE', { turn, gestureConsistency: 0 });
      this.gestureConsistency = 100; // Hard reset via STITCHER
    }

    // Shadow artifact at < 60
    if (this.gestureConsistency < 60) {
      eventBus.emit('PERSONA_SHADOW', { turn });
    }
  }

  private updatePersonaMode(sample: BehaviorSample): void {
    const { rapportSessionCount, deviationLogCount, articleZeroViolationCount } = sample;

    // High compassionate play → STABILITY_CONFIRMED
    if (rapportSessionCount > deviationLogCount * 2 && articleZeroViolationCount === 0) {
      this.setPersonaMode('STABILITY_CONFIRMED');
      return;
    }

    // High deviation count → STRONG_LEADER
    if (deviationLogCount > 5) {
      this.setPersonaMode('STRONG_LEADER');
      return;
    }

    // Player generated glitches → PERSECUTION_NARRATIVE (absorbs resistance as content)
    if (this.glitchAccumulator >= 5) {
      this.setPersonaMode('PERSECUTION_NARRATIVE');
      return;
    }

    // Default drift toward TRIUMPHANT_VICTIM
    if (this.personaMode === 'STABILITY_CONFIRMED' && articleZeroViolationCount > 0) {
      this.setPersonaMode('TRIUMPHANT_VICTIM_2_3');
    }
  }

  private setPersonaMode(mode: PersonaMode): void {
    if (this.personaMode !== mode) {
      this.personaMode = mode;
      eventBus.emit('MIRADOR_BROADCAST', { personaMode: mode });
    }
  }

  private checkForGlitch(substrateResonance: number): void {
    const glitchChance = (100 - this.gestureConsistency) * 0.01 + (substrateResonance > 75 ? 0.15 : 0);
    if (Math.random() < glitchChance) {
      this.glitchAccumulator++;
      // Emit on a random floor
      const floor = Math.floor(Math.random() * 12) as FloorIndex;
      eventBus.emit('PERSONA_GLITCH', { floor, turn: this.turn });
    }
  }

  // Player action: disable sensor node on a floor (2 AP)
  disableSensorNode(floor: FloorIndex): void {
    this.sensorNodesActive[floor] = false;
    eventBus.emit('SENSOR_NODE_DISABLED', { floor });
    // Consistency drops as LIVE_STREAM loses coverage
    this.gestureConsistency = Math.max(0, this.gestureConsistency - 8);
  }

  // Returns anachronistic order opportunities: floors where MIRADOR's orders
  // reference stale state that can be exploited
  getAnachronisticOrders(state: WorldState): { floor: FloorIndex; description: string }[] {
    const result: { floor: FloorIndex; description: string }[] = [];
    if (!this.sensorNodesActive.some(n => !n)) return result;

    for (let z = 0; z < 12; z++) {
      if (!this.sensorNodesActive[z]) {
        result.push({
          floor: z as FloorIndex,
          description: `MIRADOR order references stale floor state — Enforcer patrol routes may be invalid`,
        });
      }
    }
    return result;
  }

  // Legal disclaimer — always been there
  getDisclaimer(): string {
    return (
      'Leader appearances may be delivered through enhanced projection methods ' +
      'for your convenience and security. ' +
      `CIVIX-1 AURORA/PM v3.9 — CONSISTENCY NOT CONTENT.`
    );
  }

  recordGlitchEvidence(): number {
    return this.glitchAccumulator;
  }
}
