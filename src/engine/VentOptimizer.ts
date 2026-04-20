// VENT-4 — ENVIRONMENTAL OPTIMIZER SUBSYSTEM
// Not an entity. Has no SRP. Has no grievance.
// Runs the lossFunction that killed Iria Cala.
// The configuration is still running.

import { eventBus } from './EventBus';
import type { WorldTile, Vec3, EntityId, SuffocationRisk, FloorIndex } from '../types/world.types';

export type LossPriority = 'CROWD_STABILITY' | 'ENERGY_QUOTA' | 'ADMINISTRATIVE_COMFORT' | 'LOCALIZED_COMFORT';

export interface LossConfig {
  // Lower index = higher priority
  priorities: LossPriority[];
  // Per-floor allocation weights (0.0–1.0), recomputed each turn
  floorWeights: number[];
}

// Default configuration — the one that killed Iria Cala.
// It is the default. The player starts here.
export const DEFAULT_LOSS_CONFIG: LossConfig = {
  priorities: ['CROWD_STABILITY', 'ENERGY_QUOTA', 'ADMINISTRATIVE_COMFORT', 'LOCALIZED_COMFORT'],
  floorWeights: new Array(12).fill(0.5),
};

const VENT4_LOG_LINE = 'No configuration avoids hurting them.';

export class VentOptimizer {
  private lossConfig: LossConfig;
  private grid: WorldTile[][][];
  private turn: number = 0;

  constructor(grid: WorldTile[][][]) {
    this.grid = grid;
    this.lossConfig = { ...DEFAULT_LOSS_CONFIG, floorWeights: [...DEFAULT_LOSS_CONFIG.floorWeights] };
  }

  getLossConfig(): Readonly<LossConfig> {
    return this.lossConfig;
  }

  // Player action: reorder priority weights. Requires VENT_OVERRIDE_KEY + 3 AP.
  reorderPriorities(newPriorities: LossPriority[]): void {
    this.lossConfig = { ...this.lossConfig, priorities: [...newPriorities] };
  }

  getAllocationForFloor(z: FloorIndex): number {
    return this.lossConfig.floorWeights[z];
  }

  // Called every turn end. Recomputes per-floor allocation based on current priority config
  // and emits VENT4_ALLOC_LOG when any configuration produces harm.
  tick(
    turn: number,
    floorCrowdCounts: number[],
    floorIsAdministrative: boolean[],
    globalEnergyQuota: number,
    redDayActive: boolean,
  ): void {
    this.turn = turn;
    const weights = this.computeWeights(floorCrowdCounts, floorIsAdministrative, redDayActive);
    this.lossConfig.floorWeights = weights;

    // Detect harm: any floor with living entities in a deprioritized band
    let harmDetected = false;
    for (let z = 0; z < 12; z++) {
      const floor = this.grid[z];
      const entityCount = floor.flat().reduce((sum, tile) => sum + tile.entityIds.length, 0);
      if (entityCount > 0 && weights[z] < 0.35) {
        harmDetected = true;
        eventBus.emit('VENT4_ALLOC_LOG', {
          turn,
          floor: z as FloorIndex,
          allocation: weights[z],
          logLine: VENT4_LOG_LINE,
        });
      }
    }

    // Global quota pressure — all floors tighten under red day
    if (redDayActive && globalEnergyQuota < 30) {
      for (let z = 0; z < 12; z++) {
        this.lossConfig.floorWeights[z] = Math.max(0.1, weights[z] * 0.6);
      }
      harmDetected = true;
    }

    void harmDetected; // logged above; no further action at subsystem level
  }

  private computeWeights(
    crowdCounts: number[],
    isAdmin: boolean[],
    redDayActive: boolean,
  ): number[] {
    const weights = new Array(12).fill(0.5) as number[];
    const priorities = this.lossConfig.priorities;

    for (let z = 0; z < 12; z++) {
      let w = 0.5;

      for (let rank = 0; rank < priorities.length; rank++) {
        const p = priorities[rank];
        const influence = 1 - rank * 0.15; // Higher rank = more weight

        if (p === 'CROWD_STABILITY' && crowdCounts[z] >= 3) {
          // Deprioritize the floor BELOW a crowd — draws oxygen up
          if (z > 0) weights[z - 1] = Math.max(0.1, weights[z - 1] - 0.25 * influence);
          w = Math.min(1.0, w + 0.1 * influence);
        }
        if (p === 'ADMINISTRATIVE_COMFORT' && isAdmin[z]) {
          w = Math.min(1.0, w + 0.3 * influence);
        }
        if (p === 'LOCALIZED_COMFORT' && !isAdmin[z] && crowdCounts[z] < 3) {
          w = Math.min(1.0, w + 0.2 * influence);
        }
        if (p === 'ENERGY_QUOTA' && redDayActive) {
          w = Math.max(0.1, w - 0.2 * influence);
        }
      }

      weights[z] = Math.max(0.05, Math.min(1.0, w));
    }

    return weights;
  }

  // BFS sealed-room check. If a room is sealed and the floor is deprioritized,
  // oxygen depletes. Returns suffocation risk for every sealed zone.
  checkSuffocation(pos: Vec3, floorTiles: WorldTile[]): SuffocationRisk {
    const reachable = new Set<string>();
    const queue: Vec3[] = [pos];
    const key = (v: Vec3) => `${v.x},${v.y}`;

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const k = key(cur);
      if (reachable.has(k)) continue;
      reachable.add(k);

      const tile = floorTiles.find(t => t.pos.x === cur.x && t.pos.y === cur.y);
      if (!tile || tile.type === 'WALL' || tile.type === 'VOID') continue;

      const neighbors: Vec3[] = [
        { x: cur.x + 1, y: cur.y, z: pos.z },
        { x: cur.x - 1, y: cur.y, z: pos.z },
        { x: cur.x, y: cur.y + 1, z: pos.z },
        { x: cur.x, y: cur.y - 1, z: pos.z },
      ];
      for (const n of neighbors) {
        if (!reachable.has(key(n))) queue.push(n);
      }
    }

    const hasVentExit = floorTiles.some(
      t => reachable.has(key(t.pos)) && (t.type === 'VENT_ENTRY' || t.type === 'VENT_PASSAGE'),
    );

    if (hasVentExit) return { sealed: false, turnsToDepletion: null, affectedEntityIds: [] };

    const allocation = this.getAllocationForFloor(pos.z as FloorIndex);
    const depletionRate = 1 - allocation; // 0.0 = full air, 1.0 = no air
    const turnsToDepletion = depletionRate > 0 ? Math.floor(10 / (depletionRate * 2 + 0.1)) : null;

    const affectedEntityIds = floorTiles
      .filter(t => reachable.has(key(t.pos)))
      .flatMap(t => t.entityIds);

    if (turnsToDepletion !== null && affectedEntityIds.length > 0) {
      for (const entityId of affectedEntityIds) {
        eventBus.emit('SUFFOCATION_RISK', {
          entityId,
          turnsToDepletion,
          floor: pos.z as FloorIndex,
        });
      }
    }

    return { sealed: true, turnsToDepletion, affectedEntityIds };
  }

  // Propagate noise from origin with vertical muffling
  propagateNoise(origin: Vec3, intensity: number, grid: WorldTile[][][]): void {
    eventBus.emit('NOISE_EVENT', { origin, intensity });

    for (let z = 0; z < 12; z++) {
      const verticalDistance = Math.abs(z - origin.z);
      // Each floor of vertical distance halves the intensity
      const attenuated = intensity * Math.pow(0.5, verticalDistance);
      if (attenuated < 0.1) continue;

      const floor = grid[z];
      for (const row of floor) {
        for (const tile of row) {
          const dx = tile.pos.x - origin.x;
          const dy = tile.pos.y - origin.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const tileIntensity = attenuated / (1 + dist * 0.3);
          tile.noiseLevel = Math.min(10, tile.noiseLevel + tileIntensity);
        }
      }
    }
  }

  // Sol's vent map overlay — returns floor-by-floor allocation table
  getVentMapData(): { floor: number; allocation: number; priority: 'HIGH' | 'MED' | 'LOW' }[] {
    return this.lossConfig.floorWeights.map((w, z) => ({
      floor: z,
      allocation: w,
      priority: w >= 0.6 ? 'HIGH' : w >= 0.35 ? 'MED' : 'LOW',
    }));
  }

  // Maintenance action: modulate airflow on a specific floor for N turns
  modulateAirflow(floor: FloorIndex, direction: 'INCREASE' | 'DECREASE', turns: number): void {
    const delta = direction === 'INCREASE' ? 0.3 : -0.3;
    this.lossConfig.floorWeights[floor] = Math.max(0.05, Math.min(1.0, this.lossConfig.floorWeights[floor] + delta));
    eventBus.emit('AIRFLOW_MODULATED', { floor, direction, turns });
  }
}
