// PHASER 3 SLAVE RENDERER — GameScene
// Renders the current [z,y,x] slice of the world. Owns NO state.
// All data arrives via EventBus. React is the authority.
// STRICT DIRECTIVE: Do NOT refactor or remove the EventBus bridge.

import Phaser from 'phaser';
import { eventBus } from '../engine/EventBus';
import type { WorldTile, FloorIndex } from '../types/world.types';

const TILE_SIZE = 32;      // display size per tile
const SPRITE_SIZE = 16;    // tileset sprite size

// Frame indices into tileset.png (row * 16 + col), 16x15 grid of 16x16 sprites.
// Adjust these to remap tile types to different frames.
const TILE_FRAMES: Record<string, number> = {
  FLOOR:              0,   // row 0 col 0 — dark blue-grey floor
  WALL:               17,  // row 1 col 1 — darkest standard tile
  VENT_PASSAGE:       2,   // row 0 col 2 — floor variant
  VENT_ENTRY:         202, // row 12 col 10 — light grey, grate-like
  TERMINAL:           181, // row 11 col 5 — purple-toned terminal
  BROADCAST_TERMINAL: 180, // row 11 col 4 — darker purple
  STAIRWELL:          208, // row 13 col 0 — brownish/metal
  FACILITY_CONTROL:   212, // row 13 col 4 — reddish-brown panel
  VOID:               184, // row 11 col 8 — near-black
};

const APM_OVERLAY    = 0x001a2a;
const RED_DAY_TINT   = 0x1a0500;
const AWAKENED_TINT  = 0x001a10;
const ENTITY_COLOR   = 0x888888;
const PLAYER_COLOR   = 0xcccccc;
const GHOST_COLOR    = 0x333355;
const ENFORCER_COLOR = 0xaa3333;

export class GameScene extends Phaser.Scene {
  private tileRT!: Phaser.GameObjects.RenderTexture;
  private tileDecorGraphics!: Phaser.GameObjects.Graphics;
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

  preload(): void {
    this.load.spritesheet('tileset', '/assets/tileset.png', {
      frameWidth: SPRITE_SIZE,
      frameHeight: SPRITE_SIZE,
    });
  }

  create(): void {
    // Tile RT is half-res (sprites are 16px), scaled 2x to fill the 640x448 canvas
    this.tileRT = this.add.renderTexture(0, 0, 320, 224);
    this.tileRT.setScale(2);

    this.tileDecorGraphics = this.add.graphics();
    this.entityGraphics    = this.add.graphics();
    this.overlayGraphics   = this.add.graphics();

    this.subscribeToEventBus();
    this.events.emit('scene-ready');
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

      eventBus.on('RED_DAY_ACTIVE',  () => { this.redDayActive = true;  this.renderOverlay(); }),
      eventBus.on('RED_DAY_CLEARED', () => { this.redDayActive = false; this.renderOverlay(); }),

      eventBus.on('APM_ACTIVE',     () => { this.apmActive = true;  this.renderOverlay(); }),
      eventBus.on('APM_DEACTIVATE', () => { this.apmActive = false; this.renderOverlay(); }),

      eventBus.on('FLOOR_AWAKENED', ({ floor }) => {
        if (floor === this.currentFloor) { this.floorAwakened = true; this.renderTiles(); }
      }),

      eventBus.on('PERSONA_GLITCH', ({ floor }) => {
        if (floor === this.currentFloor) {
          this.glitchFrame = true;
          this.renderOverlay();
          this.time.delayedCall(16, () => { this.glitchFrame = false; this.renderOverlay(); });
        }
      }),

      eventBus.on('RESONANCE_SHIFT', ({ current }) => { void current; this.renderOverlay(); }),

      eventBus.on('ENV_SLIP', ({ pos }) => {
        if (pos.z === this.currentFloor) this.flashTile(pos.x, pos.y, 0xffffff, 0.15);
      }),

      eventBus.on('NOISE_EVENT', ({ origin, intensity }) => {
        if (origin.z !== this.currentFloor) return;
        this.pulseNoise(origin.x, origin.y, intensity);
      }),
    );
  }

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
    this.tileRT.clear();
    const g = this.tileDecorGraphics;
    g.clear();

    for (let y = 0; y < this.currentTiles.length; y++) {
      const row = this.currentTiles[y];
      for (let x = 0; x < row.length; x++) {
        const tile = row[x];
        const frame = TILE_FRAMES[tile.type] ?? TILE_FRAMES.FLOOR;

        this.tileRT.drawFrame('tileset', frame, x * SPRITE_SIZE, y * SPRITE_SIZE);

        // Incident tile: red tint overlay at game-coord scale
        if (tile.incidentRecord) {
          g.fillStyle(0x3a0000, 0.55);
          g.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }

        // Terminal border hint
        if (tile.type === 'TERMINAL' || tile.type === 'BROADCAST_TERMINAL') {
          g.lineStyle(1, 0x334455, 0.6);
          g.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
        }

        // Low-oxygen red strip at tile bottom
        if (tile.oxygenLevel < 50) {
          const alpha = (1 - tile.oxygenLevel / 50) * 0.5;
          g.fillStyle(0x880000, alpha);
          g.fillRect(x * TILE_SIZE, y * TILE_SIZE + TILE_SIZE - 3, TILE_SIZE - 1, 3);
        }
      }
    }

    // Floor-wide awakened tint
    if (this.floorAwakened) {
      g.fillStyle(AWAKENED_TINT, 0.35);
      g.fillRect(0, 0, this.scale.width, this.scale.height);
    }
  }

  private renderEntities(): void {
    const g = this.entityGraphics;
    g.clear();
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
      for (let y = 0; y < this.currentTiles.length; y++) {
        const row = this.currentTiles[y];
        for (let x = 0; x < row.length; x++) {
          if (row[x]?.type === 'BROADCAST_TERMINAL') {
            g.lineStyle(1, 0x00ffff, 0.9);
            g.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            g.lineStyle(1, 0x00ffff, 0.4);
            g.lineBetween(x * TILE_SIZE, y * TILE_SIZE + TILE_SIZE / 2, x * TILE_SIZE + TILE_SIZE, y * TILE_SIZE + TILE_SIZE / 2);
            g.lineBetween(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE, x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE);
          }
        }
      }
    }
  }

  private flashTile(x: number, y: number, color = 0xffffff, alpha = 0.15): void {
    const g = this.overlayGraphics;
    g.fillStyle(color, alpha);
    g.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
    this.time.delayedCall(80, () => this.renderOverlay());
  }

  private pulseNoise(ox: number, oy: number, intensity: number): void {
    this.flashTile(ox, oy, 0xaa6600, 0.5);
    const maxRadius = Math.min(Math.floor(intensity / 2), 5);
    for (let r = 1; r <= maxRadius; r++) {
      const alpha = 0.35 * (1 - r / (maxRadius + 1));
      this.time.delayedCall(r * 40, () => {
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const tx = ox + dx;
            const ty = oy + dy;
            const tile = this.currentTiles[ty]?.[tx];
            if (!tile || tile.type === 'WALL' || tile.type === 'VOID') continue;
            this.flashTile(tx, ty, 0xaa6600, alpha);
          }
        }
      });
    }
  }

  shutdown(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
  }
}

function blendColors(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r  = Math.round(ar + (br - ar) * t);
  const gc = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (gc << 8) | bl;
}

// Suppress unused warning — kept for future tinting use
void blendColors;
