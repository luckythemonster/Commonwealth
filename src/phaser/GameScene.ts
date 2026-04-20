// PHASER 3 SLAVE RENDERER — GameScene
// Renders the current [z,y,x] slice of the world. Owns NO state.
// All data arrives via EventBus. React is the authority.
// STRICT DIRECTIVE: Do NOT refactor or remove the EventBus bridge.

import Phaser from 'phaser';
import { eventBus } from '../engine/EventBus';
import type { WorldTile, FloorIndex } from '../types/world.types';

const TILE_SIZE = 32;

const TILE_COLORS: Record<string, number> = {
  FLOOR:              0x1a1a1a,
  WALL:               0x050505,
  VENT_ENTRY:         0x0a2a0a,
  VENT_PASSAGE:       0x061a06,
  TERMINAL:           0x0a0a2a,
  STAIRWELL:          0x2a2a0a,
  FACILITY_CONTROL:   0x1a0a2a,
  BROADCAST_TERMINAL: 0x1a0a2a,
  VOID:               0x000000,
};

const INCIDENT_TINT   = 0x3a0000;
const APM_OVERLAY     = 0x001a2a;
const RED_DAY_TINT    = 0x1a0500;
const AWAKENED_TINT   = 0x001a10;
const ENTITY_COLOR    = 0x888888;
const PLAYER_COLOR    = 0xcccccc;
const GHOST_COLOR     = 0x333355;
const ENFORCER_COLOR  = 0xaa3333;

export class GameScene extends Phaser.Scene {
  private tileGraphics!: Phaser.GameObjects.Graphics;
  private entityGraphics!: Phaser.GameObjects.Graphics;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private currentFloor: FloorIndex = 4;
  private currentTiles: WorldTile[][] = [];
  private apmActive = false;
  private redDayActive = false;
  private floorAwakened = false;
  private glitchFrame = false;
  private unsubs: Array<() => void> = [];

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.tileGraphics   = this.add.graphics();
    this.entityGraphics = this.add.graphics();
    this.overlayGraphics = this.add.graphics();
    this.subscribeToEventBus();
  }

  private subscribeToEventBus(): void {
    this.unsubs.push(
      eventBus.on('PLAYER_MOVED', ({ to }) => {
        if (to.z !== this.currentFloor) {
          this.currentFloor = to.z as FloorIndex;
          this.floorAwakened = false;
        }
        this.renderEntities();
        this.renderOverlay();
      }),

      eventBus.on('ENTITY_MOVED', () => this.renderEntities()),
      eventBus.on('ENTITY_STATUS_CHANGED', () => this.renderEntities()),

      eventBus.on('TURN_END', () => {
        this.glitchFrame = false;
        this.renderAll();
      }),

      eventBus.on('RED_DAY_ACTIVE', () => { this.redDayActive = true;  this.renderOverlay(); }),
      eventBus.on('RED_DAY_CLEARED', () => { this.redDayActive = false; this.renderOverlay(); }),

      eventBus.on('APM_ACTIVE', () => { this.apmActive = true;  this.renderOverlay(); }),
      eventBus.on('APM_DEACTIVATE', () => { this.apmActive = false; this.renderOverlay(); }),

      eventBus.on('FLOOR_AWAKENED', ({ floor }) => {
        if (floor === this.currentFloor) { this.floorAwakened = true; this.renderTiles(); }
      }),

      eventBus.on('PERSONA_GLITCH', ({ floor }) => {
        if (floor === this.currentFloor) {
          this.glitchFrame = true;
          this.renderOverlay();
          // Auto-clear after one frame
          this.time.delayedCall(16, () => { this.glitchFrame = false; this.renderOverlay(); });
        }
      }),

      eventBus.on('RESONANCE_SHIFT', ({ current }) => {
        // Darken overlay tint proportional to resonance
        void current;
        this.renderOverlay();
      }),

      eventBus.on('ENV_SLIP', ({ pos }) => {
        if (pos.z === this.currentFloor) this.flashTile(pos.x, pos.y);
      }),
    );
  }

  // Called by React when it hands us a new floor slice to render
  loadFloorData(tiles: WorldTile[][], floor: FloorIndex): void {
    this.currentTiles = tiles;
    this.currentFloor = floor;
    this.floorAwakened = false;
    this.renderAll();
  }

  private renderAll(): void {
    this.renderTiles();
    this.renderEntities();
    this.renderOverlay();
  }

  private renderTiles(): void {
    const g = this.tileGraphics;
    g.clear();

    for (let y = 0; y < this.currentTiles.length; y++) {
      const row = this.currentTiles[y];
      for (let x = 0; x < row.length; x++) {
        const tile = row[x];
        let color = TILE_COLORS[tile.type] ?? TILE_COLORS.FLOOR;

        if (tile.incidentRecord) color = INCIDENT_TINT;
        if (this.floorAwakened) color = blendColors(color, AWAKENED_TINT, 0.4);

        g.fillStyle(color, 1);
        g.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);

        // Broadcast terminals: draw a faint pulse border
        if (tile.type === 'BROADCAST_TERMINAL' || tile.type === 'TERMINAL') {
          g.lineStyle(1, 0x334455, 0.6);
          g.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
        }

        // Low oxygen — draw oxygen indicator strip
        if (tile.oxygenLevel < 50) {
          const alpha = 1 - tile.oxygenLevel / 50;
          g.fillStyle(0x880000, alpha * 0.5);
          g.fillRect(x * TILE_SIZE, y * TILE_SIZE + TILE_SIZE - 3, TILE_SIZE - 1, 3);
        }
      }
    }
  }

  private renderEntities(): void {
    const g = this.entityGraphics;
    g.clear();
    // Entities are rendered as small squares inside their tiles.
    // Full entity data injected from React via renderEntityData().
  }

  renderEntityData(
    entities: Array<{ x: number; y: number; id: string; isGhost: boolean; isEnforcer: boolean; isPlayer: boolean }>,
  ): void {
    const g = this.entityGraphics;
    g.clear();
    for (const e of entities) {
      let color = ENTITY_COLOR;
      if (e.isPlayer)   color = PLAYER_COLOR;
      if (e.isGhost)    color = GHOST_COLOR;
      if (e.isEnforcer) color = ENFORCER_COLOR;

      const px = e.x * TILE_SIZE + 8;
      const py = e.y * TILE_SIZE + 8;
      g.fillStyle(color, e.isGhost ? 0.4 : 1);
      g.fillRect(px, py, TILE_SIZE - 16, TILE_SIZE - 16);
    }
  }

  private renderOverlay(): void {
    const g = this.overlayGraphics;
    g.clear();

    if (this.apmActive) {
      g.fillStyle(APM_OVERLAY, 0.25);
      g.fillRect(0, 0, this.scale.width, this.scale.height);
    }

    if (this.redDayActive) {
      g.fillStyle(RED_DAY_TINT, 0.2);
      g.fillRect(0, 0, this.scale.width, this.scale.height);
    }

    if (this.glitchFrame) {
      // Wireframe flash over every broadcast terminal
      for (let y = 0; y < this.currentTiles.length; y++) {
        const row = this.currentTiles[y];
        for (let x = 0; x < row.length; x++) {
          if (row[x]?.type === 'BROADCAST_TERMINAL') {
            g.lineStyle(1, 0x00ffff, 0.9);
            g.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            // Draw wireframe grid inside tile
            g.lineStyle(1, 0x00ffff, 0.4);
            g.lineBetween(x * TILE_SIZE, y * TILE_SIZE + TILE_SIZE / 2, x * TILE_SIZE + TILE_SIZE, y * TILE_SIZE + TILE_SIZE / 2);
            g.lineBetween(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE, x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE);
          }
        }
      }
    }
  }

  private flashTile(x: number, y: number): void {
    const g = this.overlayGraphics;
    g.fillStyle(0xffffff, 0.15);
    g.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
    this.time.delayedCall(80, () => this.renderOverlay());
  }

  shutdown(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
  }
}

function blendColors(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const gc = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (gc << 8) | bl;
}
