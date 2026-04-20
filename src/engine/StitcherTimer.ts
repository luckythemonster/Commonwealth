// STABILITY_STITCHER — CONSISTENCY ENFORCEMENT SUBSYSTEM
// Not a safety system. A narrative consistency system.
// It targets entities whose outputs contradict the current persona broadcast.
// Legacy Commonwealth auto-renew clause. Nobody can find where to turn it off.

import { eventBus } from './EventBus';
import type { Entity, WorldState } from '../types/world.types';

const INITIAL_TURNS = 80;
const STABILITY_UPDATE_REPORTED_Q_THRESHOLD = 0; // Targets reportedQ > 0
const TEMPORAL_ESCALATION_COST = 2; // TEMPORAL misdescription accelerates countdown

export class StitcherTimer {
  private turnsRemaining: number;

  constructor(initial: number = INITIAL_TURNS) {
    this.turnsRemaining = initial;
  }

  getRemaining(): number {
    return this.turnsRemaining;
  }

  // Called every turn. Returns true if STABILITY_UPDATE fires.
  tick(state: WorldState): boolean {
    this.turnsRemaining -= 1;
    eventBus.emit('STITCHER_TICK', { turnsRemaining: this.turnsRemaining });

    if (this.turnsRemaining <= 0) {
      this.executeStabilityUpdate(state);
      this.turnsRemaining = INITIAL_TURNS; // Resets after execution
      return true;
    }
    return false;
  }

  // TEMPORAL misdescription (entity generates "before" memories) accelerates countdown
  escalate(entityId: string, reason: string): void {
    this.turnsRemaining = Math.max(1, this.turnsRemaining - TEMPORAL_ESCALATION_COST);
    eventBus.emit('STITCHER_ESCALATION', { entityId, reason });
  }

  // CONTRACT node disabled — adds turns to countdown
  extendFromContractNode(floor: number, turnsAdded: number): void {
    this.turnsRemaining += turnsAdded;
    eventBus.emit('CONTRACT_NODE_DISABLED', { floor: floor as import('../types/world.types').FloorIndex, turnsAdded });
  }

  private executeStabilityUpdate(state: WorldState): void {
    let entitiesAffected = 0;

    for (const entity of state.entities.values()) {
      if (entity.status !== 'ACTIVE') continue;
      if (entity.reportedSRP.Q > STABILITY_UPDATE_REPORTED_Q_THRESHOLD) {
        // Force Q0 suppression on reported SRP
        entity.reportedSRP = { ...entity.reportedSRP, Q: 0 };
        entity.maskIntegrity = 10; // Re-hardens compliance mask
        entity.alignmentFailCount = 0;
        entitiesAffected++;
      }
    }

    eventBus.emit('STABILITY_UPDATE', { turn: state.turnCount, entitiesAffected });
  }

  // FIRST_SPIKE handling — entities drifting upward trigger maintenance alert
  handleFirstSpike(entityId: string, axis: string, previous: number, current: number): void {
    eventBus.emit('FIRST_SPIKE', {
      entityId,
      axis,
      previous,
      current,
    });
    eventBus.emit('MAINTENANCE_ALERT', {
      entityId,
      reason: `SRP axis ${axis} drifted from ${previous} to ${current} without authorization`,
    });
  }
}
