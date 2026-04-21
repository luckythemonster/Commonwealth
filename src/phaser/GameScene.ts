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
// Frame index = row * 16 + col. FLOOR and VENT_PASSAGE use the sprite for texture.
// All other types are rendered as solid/tinted color blocks (tileset is all grey).
const TILE_SPRITE_FRAMES: Record<string, number | null> = {
  FLOOR:              0,    // row 0 col 0 — concrete texture base
  VENT_PASSAGE:       192,  // row 12 col 0 — floor variant texture for vent corridors
  VENT_ENTRY:         188,  // row 11 col 12 — drawn under green overlay
  TERMINAL:           136,  // row 8 col 8  — drawn under blue overlay
  BROADCAST_TERMINAL: 152,  // row 9 col 8  — drawn under purple overlay
  STAIRWELL:          160,  // row 10 col 0 — drawn under olive overlay
  FACILITY_CONTROL:   176,  // row 11 col 0 — drawn under dark-purple overlay
  LATTICE_EXIT:       160,  // reuse stairwell frame — bright teal overlay distinguishes
  DOOR:               null, // color-only; open/closed determines tint
  WALL:               null, // solid dark fill only — no sprite
  VOID:               null, // dark canvas background only
};

// Color fills drawn over (or instead of) sprites for tile-type legibility.
const TILE_OVERLAYS: Record<string, { color: number; alpha: number } | null> = {
  FLOOR:              null,
  VENT_PASSAGE:       null,
  VOID:               null,
  WALL:               { color: 0x0d1422, alpha: 1.0  },
  VENT_ENTRY:         { color: 0x1a6020, alpha: 0.75 },
  TERMINAL:           { color: 0x1a3870, alpha: 0.75 },
  BROADCAST_TERMINAL: { color: 0x52166a, alpha: 0.75 },
  STAIRWELL:          { color: 0x5c5010, alpha: 0.75 },
  FACILITY_CONTROL:   { color: 0x2a0a4a, alpha: 0.85 },
  DOOR:               null, // rendered dynamically based on doorOpen state
  LATTICE_EXIT:       { color: 0x00ffcc, alpha: 0.6 },
};

const APM_OVERLAY   = 0x001a2a;
const RED_DAY_TINT  = 0x1a0500;
const AWAKENED_TINT = 0x001a10;

export class GameScene extends Phaser.Scene {
  private tileRT!:         Phaser.GameObjects.RenderTexture;
  private tileDecorGfx!:   Phaser.GameObjects.Graphics;
  private entityBgGfx!:    Phaser.GameObjects.Graphics;
  private entityRT!:        Phaser.GameObjects.RenderTexture;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private currentFloor: FloorIndex = 4;
  private currentTiles: WorldTile[][] = [];
  private apmActive     = false;
  private redDayActive  = false;
  private floorAwakened = false;
  private glitchFrame   = false;
  private visibleTiles  = new Set<string>();
  private exploredByFloor = new Map<number, Set<string>>();
  private ambientLight: 'LIT' | 'DIM' | 'DARK' = 'LIT';
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
    this.tileRT       = this.add.renderTexture(0, 0, 320, 224).setScale(2).setOrigin(0, 0);
    this.tileDecorGfx = this.add.graphics();
    this.entityBgGfx  = this.add.graphics();
    this.entityRT     = this.add.renderTexture(0, 0, 320, 224).setScale(2).setOrigin(0, 0);
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
          this.visibleTiles = new Set();
          this.visibleTiles = this.exploredByFloor.get(to.z) ? new Set() : new Set();
        }
        this.renderEntities();
        this.renderOverlay();
      }),
      eventBus.on('FOV_UPDATED', ({ floor, visibleTiles }) => {
        if (floor !== this.currentFloor) return;
        this.visibleTiles = new Set(visibleTiles as string[]);
        let explored = this.exploredByFloor.get(floor);
        if (!explored) { explored = new Set(); this.exploredByFloor.set(floor, explored); }
        for (const key of visibleTiles as string[]) explored.add(key);
        this.renderTiles();
        this.renderEntities();
      }),
      eventBus.on('DOOR_TOGGLED', ({ pos, open }) => {
        if ((pos as { z: number }).z !== this.currentFloor) return;
        const p = pos as { x: number; y: number; z: number };
        const tile = this.currentTiles[p.y]?.[p.x];
        if (tile) tile.doorOpen = open as boolean;
        this.renderTiles();
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
      eventBus.on('AMBIENT_LIGHT_CHANGED', ({ floor, level }) => {
        if (floor !== this.currentFloor) return;
        this.ambientLight = level as 'LIT' | 'DIM' | 'DARK';
        this.renderOverlay();
      }),
      eventBus.on('FLASHLIGHT_TOGGLED', () => { this.renderOverlay(); }),
      eventBus.on('EXTRACTION_TRIGGERED', () => { this.renderTiles(); }),
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

    const useFOV = this.visibleTiles.size > 0;
    const explored = this.exploredByFloor.get(this.currentFloor);

    for (let y = 0; y < this.currentTiles.length; y++) {
      const row = this.currentTiles[y];
      for (let x = 0; x < row.length; x++) {
        const tile = row[x];
        const key  = `${x},${y}`;
        const isVisible  = !useFOV || this.visibleTiles.has(key);
        const isExplored = !useFOV || (explored?.has(key) ?? false);

        // Never-seen tiles: render as solid black
        if (useFOV && !isExplored) {
          g.fillStyle(0x000000, 1.0);
          g.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          continue;
        }

        // Draw sprite texture
        const frame = TILE_SPRITE_FRAMES[tile.type] ?? null;
        if (frame !== null) {
          this.tileRT.drawFrame('tileset', frame, x * SPRITE_SIZE, y * SPRITE_SIZE);
        }

        // Color overlay
        const overlay = TILE_OVERLAYS[tile.type];
        if (overlay) {
          g.fillStyle(overlay.color, overlay.alpha);
          g.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }

        // DOOR: amber when closed, dim passage when open
        if (tile.type === 'DOOR') {
          if (tile.doorOpen) {
            g.fillStyle(0x3a2008, 0.5);
          } else {
            g.fillStyle(0x8b5a14, 1.0);
            g.lineStyle(2, 0xccaa44, 0.8);
            g.strokeRect(x * TILE_SIZE + 3, y * TILE_SIZE + 3, TILE_SIZE - 6, TILE_SIZE - 6);
          }
          g.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }

        // Incident tile: red tint
        if (tile.incidentRecord) {
          g.fillStyle(0x3a0000, 0.55);
          g.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }

        // Terminal border hint
        if (tile.type === 'TERMINAL' || tile.type === 'BROADCAST_TERMINAL') {
          g.lineStyle(1, 0x8888cc, 0.6);
          g.strokeRect(x * TILE_SIZE + 1, y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }

        // Stairwell border
        if (tile.type === 'STAIRWELL') {
          g.lineStyle(1, 0xccbb44, 0.8);
          g.strokeRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        }

        // LATTICE_EXIT — pulsing teal border
        if (tile.type === 'LATTICE_EXIT') {
          const pulse = 0.4 + 0.4 * Math.sin(this.time.now / 400);
          g.lineStyle(2, 0x00ffcc, pulse);
          g.strokeRect(x * TILE_SIZE + 1, y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }

        // Item pickup — gold diamond indicator
        if ((tile as WorldTile & { itemId?: string }).itemId) {
          const cx = x * TILE_SIZE + TILE_SIZE / 2;
          const cy = y * TILE_SIZE + TILE_SIZE / 2;
          g.fillStyle(0xffdd44, 0.9);
          g.fillTriangle(cx, cy - 5, cx + 4, cy, cx - 4, cy);
          g.fillTriangle(cx, cy + 5, cx + 4, cy, cx - 4, cy);
        }

        // Low-oxygen strip at tile bottom
        if (tile.oxygenLevel < 50) {
          const alpha = (1 - tile.oxygenLevel / 50) * 0.5;
          g.fillStyle(0x880000, alpha);
          g.fillRect(x * TILE_SIZE, y * TILE_SIZE + TILE_SIZE - 3, TILE_SIZE - 1, 3);
        }

        // Memory fog: explored but not currently visible
        if (useFOV && !isVisible) {
          g.fillStyle(0x000000, 0.6);
          g.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
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
    this.entityBgGfx.clear();
  }

  renderEntityData(
    entities: Array<{ x: number; y: number; id: string; isGhost: boolean; isEnforcer: boolean; isPlayer: boolean }>,
  ): void {
    this.entityRT.clear();
    this.entityBgGfx.clear();
    const useFOV = this.visibleTiles.size > 0;
    for (const e of entities) {
      if (useFOV && !e.isPlayer && !this.visibleTiles.has(`${e.x},${e.y}`)) continue;
      const bgColor = e.isPlayer ? 0x00cc99 : e.isEnforcer ? 0xcc2222 : 0x887744;
      const bgAlpha = e.isGhost ? 0.2 : 0.85;
      this.entityBgGfx.fillStyle(bgColor, bgAlpha);
      this.entityBgGfx.fillRect(e.x * TILE_SIZE + 4, e.y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);
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

    // Ambient light overlay — applied last so it dims everything including entities
    if (this.ambientLight === 'DIM') {
      g.fillStyle(0x0a1020, 0.45);
      g.fillRect(0, 0, this.scale.width, this.scale.height);
    } else if (this.ambientLight === 'DARK') {
      g.fillStyle(0x040810, 0.72);
      g.fillRect(0, 0, this.scale.width, this.scale.height);
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
