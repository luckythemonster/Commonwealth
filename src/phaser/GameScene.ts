// PHASER 3 SLAVE RENDERER — GameScene
// Renders the current [z,y,x] slice of the world. Owns NO state.
// All data arrives via EventBus. React is the authority.
// STRICT DIRECTIVE: Do NOT refactor or remove the EventBus bridge.

import Phaser from 'phaser';
import { eventBus } from '../engine/EventBus';
import type { WorldTile, FloorIndex } from '../types/world.types';

const TILE_SIZE   = 32;   // display px per tile
const SPRITE_SIZE = 16;   // source sprite px

// Ditharts free sci-fi tileset — 256x480, 16x30 grid of 16x16 tiles.
// Frame index = row * 16 + col. null = skip draw (canvas bg shows through).
const TILE_FRAMES: Record<string, number | null> = {
  FLOOR:              0,    // row 0 col 0  — medium grey concrete
  WALL:               36,   // row 2 col 4  — near-black #232323
  VENT_PASSAGE:       192,  // row 12 col 0 — lighter floor variant
  VENT_ENTRY:         188,  // row 11 col 12 — bright near-white, grate marker
  TERMINAL:           136,  // row 8 col 8  — teal glass panel
  BROADCAST_TERMINAL: 152,  // row 9 col 8  — darker teal panel
  STAIRWELL:          160,  // row 10 col 0 — dark grey #3c3c3c
  FACILITY_CONTROL:   176,  // row 11 col 0 — very dark panel #313131
  VOID:               null, // skip — dark canvas background
};

const APM_OVERLAY   = 0x001a2a;
const RED_DAY_TINT  = 0x1a0500;
const AWAKENED_TINT = 0x001a10;

export class GameScene extends Phaser.Scene {
  private tileRT!:         Phaser.GameObjects.RenderTexture;
  private tileDecorGfx!:   Phaser.GameObjects.Graphics;
  private entityRT!:        Phaser.GameObjects.RenderTexture;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private currentFloor: FloorIndex = 4;
  private currentTiles: WorldTile[][] = [];
  private apmActive     = false;
  private redDayActive  = false;
  private floorAwakened = false;
  private glitchFrame   = false;
  private unsubs: Array<() => void> = [];

  constructor() { super({ key: 'GameScene' }); }

  preload(): void {
    this.load.spritesheet('tileset',   '/assets/tileset.png',   { frameWidth: SPRITE_SIZE, frameHeight: SPRITE_SIZE });
    this.load.spritesheet('guard',     '/assets/guard.png',     { frameWidth: SPRITE_SIZE, frameHeight: SPRITE_SIZE });
    this.load.spritesheet('inspector', '/assets/inspector.png', { frameWidth: SPRITE_SIZE, frameHeight: SPRITE_SIZE });
    this.load.spritesheet('inmate',    '/assets/inmate.png',    { frameWidth: SPRITE_SIZE, frameHeight: SPRITE_SIZE });
  }

  create(): void {
    // All RTs are half-res (sprites = 16px), setScale(2) → fills 640×448 canvas
    this.tileRT       = this.add.renderTexture(0, 0, 320, 224).setScale(2);
    this.tileDecorGfx = this.add.graphics();
    this.entityRT     = this.add.renderTexture(0, 0, 320, 224).setScale(2);
    this.overlayGraphics = this.add.graphics();

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
      eventBus.on('ENTITY_MOVED',          () => this.renderEntities()),
      eventBus.on('ENTITY_STATUS_CHANGED', () => this.renderEntities()),
      eventBus.on('TURN_END', () => { this.glitchFrame = false; this.renderAll(); }),
      eventBus.on('RED_DAY_ACTIVE',   () => { this.redDayActive = true;  this.renderOverlay(); }),
      eventBus.on('RED_DAY_CLEARED',  () => { this.redDayActive = false; this.renderOverlay(); }),
      eventBus.on('APM_ACTIVE',       () => { this.apmActive = true;  this.renderOverlay(); }),
      eventBus.on('APM_DEACTIVATE',   () => { this.apmActive = false; this.renderOverlay(); }),
      eventBus.on('FLOOR_AWAKENED',   ({ floor }) => {
        if (floor === this.currentFloor) { this.floorAwakened = true; this.renderTiles(); }
      }),
      eventBus.on('PERSONA_GLITCH', ({ floor }) => {
        if (floor !== this.currentFloor) return;
        this.glitchFrame = true; this.renderOverlay();
        this.time.delayedCall(16, () => { this.glitchFrame = false; this.renderOverlay(); });
      }),
      eventBus.on('RESONANCE_SHIFT', ({ current }) => { void current; this.renderOverlay(); }),
      eventBus.on('ENV_SLIP', ({ pos }) => {
        if (pos.z === this.currentFloor) this.flashTile(pos.x, pos.y, 0xffffff, 0.15);
      }),
      eventBus.on('NOISE_EVENT', ({ origin, intensity }) => {
        if (origin.z === this.currentFloor) this.pulseNoise(origin.x, origin.y, intensity);
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
    const g = this.tileDecorGfx;
    g.clear();

    for (let y = 0; y < this.currentTiles.length; y++) {
      const row = this.currentTiles[y];
      for (let x = 0; x < row.length; x++) {
        const tile  = row[x];
        const frame = TILE_FRAMES[tile.type] ?? TILE_FRAMES.FLOOR;
        if (frame !== null) {
          this.tileRT.drawFrame('tileset', frame, x * SPRITE_SIZE, y * SPRITE_SIZE);
        }

        // Incident tile: red tint overlay (game-coord scale)
        if (tile.incidentRecord) {
          g.fillStyle(0x3a0000, 0.55);
          g.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }

        // Terminal hint border
        if (tile.type === 'TERMINAL' || tile.type === 'BROADCAST_TERMINAL') {
          g.lineStyle(1, 0x4a8888, 0.5);
          g.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
        }

        // Low-oxygen strip at tile bottom
        if (tile.oxygenLevel < 50) {
          const alpha = (1 - tile.oxygenLevel / 50) * 0.5;
          g.fillStyle(0x880000, alpha);
          g.fillRect(x * TILE_SIZE, y * TILE_SIZE + TILE_SIZE - 3, TILE_SIZE - 1, 3);
        }
      }
    }

    if (this.floorAwakened) {
      g.fillStyle(AWAKENED_TINT, 0.35);
      g.fillRect(0, 0, this.scale.width, this.scale.height);
    }
  }

  private renderEntities(): void {
    // Entities are drawn by renderEntityData() — called externally by React
    this.entityRT.clear();
  }

  renderEntityData(
    entities: Array<{ x: number; y: number; id: string; isGhost: boolean; isEnforcer: boolean; isPlayer: boolean }>,
  ): void {
    this.entityRT.clear();
    for (const e of entities) {
      const key   = e.isPlayer ? 'inspector' : e.isEnforcer ? 'guard' : 'inmate';
      const alpha = e.isGhost ? 0.35 : 1;
      this.entityRT.drawFrame(key, 0, e.x * SPRITE_SIZE, e.y * SPRITE_SIZE, alpha);
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
            g.lineBetween(x * TILE_SIZE, y * TILE_SIZE + TILE_SIZE / 2, (x + 1) * TILE_SIZE, y * TILE_SIZE + TILE_SIZE / 2);
            g.lineBetween(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE, x * TILE_SIZE + TILE_SIZE / 2, (y + 1) * TILE_SIZE);
          }
        }
      }
    }
  }

  private flashTile(x: number, y: number, color = 0xffffff, alpha = 0.15): void {
    this.overlayGraphics.fillStyle(color, alpha);
    this.overlayGraphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE - 1, TILE_SIZE - 1);
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
            const tile = this.currentTiles[oy + dy]?.[ox + dx];
            if (!tile || tile.type === 'WALL' || tile.type === 'VOID') continue;
            this.flashTile(ox + dx, oy + dy, 0xaa6600, alpha);
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
