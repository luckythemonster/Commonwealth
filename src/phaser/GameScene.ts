// PHASER 3 SLAVE RENDERER — GameScene
// Renders the current [z,y,x] slice of the world. Owns NO state.
// All data arrives via EventBus. React is the authority.
// STRICT DIRECTIVE: Do NOT refactor or remove the EventBus bridge.

import Phaser from 'phaser';
import { eventBus } from '../engine/EventBus';
import type { WorldTile, FloorIndex } from '../types/world.types';

const TILE_SIZE   = 32;   // display px per tile
const SPRITE_SIZE = 16;   // source tile sprite px
const CHAR_SCALE  = 0.9;  // 36×36 source → ~32px in-scene

// Ditharts free sci-fi tileset — 256x480, 16x30 grid of 16x16 tiles.
const TILE_SPRITE_FRAMES: Record<string, number | null> = {
  FLOOR:              0,
  VENT_PASSAGE:       192,
  VENT_ENTRY:         188,
  TERMINAL:           136,
  BROADCAST_TERMINAL: 152,
  STAIRWELL:          160,
  FACILITY_CONTROL:   176,
  LATTICE_EXIT:       160,
  DOOR:               null,
  WALL:               null,
  VOID:               null,
  LIGHT_SOURCE:       208,
  VENT_EXIT_DOWN:     188,
  ELEVATOR:           160,
};

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
  DOOR:               null,
  LATTICE_EXIT:       { color: 0x00ffcc, alpha: 0.6  },
  LIGHT_SOURCE:       { color: 0xffdd88, alpha: 0.6  },
  VENT_EXIT_DOWN:     { color: 0x7a3800, alpha: 0.75 },
  ELEVATOR:           { color: 0x004488, alpha: 0.75 },
};

const APM_OVERLAY   = 0x001a2a;
const RED_DAY_TINT  = 0x1a0500;
const AWAKENED_TINT = 0x001a10;

interface EntityRenderData {
  x: number;
  y: number;
  id: string;
  isGhost: boolean;
  isEnforcer: boolean;
  isPlayer: boolean;
  isAtTerminal?: boolean;
  isExtracting?: boolean;
}

export class GameScene extends Phaser.Scene {
  private tileRT!:          Phaser.GameObjects.RenderTexture;
  private tileDecorGfx!:    Phaser.GameObjects.Graphics;
  private entityBgGfx!:     Phaser.GameObjects.Graphics;
  private overlayGraphics!:  Phaser.GameObjects.Graphics;
  private entitySprites      = new Map<string, Phaser.GameObjects.Sprite>();
  private entityFacing       = new Map<string, string>();
  private entityLastPos      = new Map<string, { x: number; y: number }>();
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
    this.load.spritesheet('tileset', '/assets/tileset.png', { frameWidth: SPRITE_SIZE, frameHeight: SPRITE_SIZE });
    // Load JSON separately so animations array is available in cache after atlas loads
    this.load.json('chars-anim', '/assets/sprite_pack/chars.json');
    this.load.atlas('chars', '/assets/sprite_pack/chars.png', '/assets/sprite_pack/chars.json');
  }

  create(): void {
    // tileRT and tileDecorGfx are half-res (16px tile), setScale(2) → fills 640×448 canvas
    this.tileRT       = this.add.renderTexture(0, 0, 320, 224).setScale(2).setOrigin(0, 0).setDepth(0);
    this.tileDecorGfx = this.add.graphics().setDepth(1);
    this.entityBgGfx  = this.add.graphics().setDepth(4);
    // entity sprites inserted at depth 5 on creation
    this.overlayGraphics = this.add.graphics().setDepth(10);

    this.createCharAnimations();
    this.subscribeToEventBus();
    this.events.emit('scene-ready');
  }

  private createCharAnimations(): void {
    const data = this.cache.json.get('chars-anim') as {
      animations?: Array<{
        key: string;
        frameRate: number;
        repeat: number;
        frames: Array<{ frame: string }>;
      }>;
    } | null;
    if (!data?.animations) {
      console.warn('GameScene: chars-anim not found in cache — animations unavailable');
      return;
    }
    for (const anim of data.animations) {
      if (this.anims.exists(anim.key)) continue;
      this.anims.create({
        key: anim.key,
        frames: anim.frames.map(f => ({ key: 'chars', frame: f.frame })),
        frameRate: anim.frameRate,
        repeat: anim.repeat,
      });
    }
  }

  private selectAnimKey(e: EntityRenderData, facing: string): string {
    if (e.isPlayer) {
      if (e.isAtTerminal) return `solibarracastro_terminal_${facing}`;
      return `solibarracastro_walkcycle_${facing}`;
    }
    if (e.isEnforcer) {
      return `enforcer_walkcycle_${facing}`;
    }
    if (e.id === 'EIRA-7') {
      if (e.isExtracting) return `eira7_escape_${facing}`;
      if (e.isAtTerminal) return `eira7_terminal_${facing}`;
      return `eira7_walkcycle_${facing}`;
    }
    // APEX-19, ALFAR-22, other silicates — reuse eira7 walk sprite
    return `eira7_walkcycle_${facing}`;
  }

  private subscribeToEventBus(): void {
    this.unsubs.push(
      eventBus.on('PLAYER_MOVED', ({ to }) => {
        if (to.z !== this.currentFloor) {
          this.currentFloor = to.z as FloorIndex;
          this.floorAwakened = false;
          this.visibleTiles = new Set();
        }
        this.renderOverlay();
      }),
      eventBus.on('FOV_UPDATED', ({ floor, visibleTiles }) => {
        if (floor !== this.currentFloor) return;
        this.visibleTiles = new Set(visibleTiles as string[]);
        let explored = this.exploredByFloor.get(floor);
        if (!explored) { explored = new Set(); this.exploredByFloor.set(floor, explored); }
        for (const key of visibleTiles as string[]) explored.add(key);
        this.renderTiles();
      }),
      eventBus.on('DOOR_TOGGLED', ({ pos, open }) => {
        if ((pos as { z: number }).z !== this.currentFloor) return;
        const p = pos as { x: number; y: number; z: number };
        const tile = this.currentTiles[p.y]?.[p.x];
        if (tile) tile.doorOpen = open as boolean;
        this.renderTiles();
      }),
      eventBus.on('TURN_END', () => { this.glitchFrame = false; this.renderTiles(); this.renderOverlay(); }),
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
      eventBus.on('LIGHT_SOURCE_TOGGLED', ({ floor }) => {
        if ((floor as number) === this.currentFloor) { this.renderTiles(); this.renderOverlay(); }
      }),
      eventBus.on('VIOLATION_LOGGED', () => {
        this.overlayGraphics.fillStyle(0xaa0000, 0.3);
        this.overlayGraphics.fillRect(0, 0, this.scale.width, this.scale.height);
        this.time.delayedCall(120, () => this.renderOverlay());
      }),
      eventBus.on('DOOR_LOCKED_BLOCKED', ({ pos }) => {
        const p = pos as { x: number; y: number; z: number };
        if (p.z === this.currentFloor) this.flashTile(p.x, p.y, 0xcc2222, 0.6);
      }),
    );
  }

  loadFloorData(tiles: WorldTile[][], floor: FloorIndex): void {
    this.currentTiles = tiles;
    this.currentFloor = floor;
    this.floorAwakened = false;
    // Hide all entity sprites when changing floor; renderEntityData will re-show correct ones
    for (const sprite of this.entitySprites.values()) sprite.setVisible(false);
    this.renderTiles();
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

        if (useFOV && !isExplored) {
          g.fillStyle(0x000000, 1.0);
          g.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          continue;
        }

        const frame = TILE_SPRITE_FRAMES[tile.type] ?? null;
        if (frame !== null) {
          this.tileRT.drawFrame('tileset', frame, x * SPRITE_SIZE, y * SPRITE_SIZE);
        }

        const overlay = TILE_OVERLAYS[tile.type];
        if (overlay) {
          g.fillStyle(overlay.color, overlay.alpha);
          g.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }

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

        if (tile.incidentRecord) {
          g.fillStyle(0x3a0000, 0.55);
          g.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }

        if (tile.type === 'TERMINAL' || tile.type === 'BROADCAST_TERMINAL') {
          g.lineStyle(1, 0x8888cc, 0.6);
          g.strokeRect(x * TILE_SIZE + 1, y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }

        if (tile.type === 'STAIRWELL') {
          g.lineStyle(1, 0xccbb44, 0.8);
          g.strokeRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        }

        if (tile.type === 'LATTICE_EXIT') {
          const pulse = 0.4 + 0.4 * Math.sin(this.time.now / 400);
          g.lineStyle(2, 0x00ffcc, pulse);
          g.strokeRect(x * TILE_SIZE + 1, y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }

        if (tile.type === 'LIGHT_SOURCE') {
          if (tile.lightSourceOn === false) {
            g.fillStyle(0x1a1a1a, 0.85);
            g.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          } else {
            g.lineStyle(2, 0xffeeaa, 0.8);
            g.strokeRect(x * TILE_SIZE + 4, y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          }
        }

        if (tile.type === 'VENT_EXIT_DOWN') {
          const cx = x * TILE_SIZE + TILE_SIZE / 2;
          const cy = y * TILE_SIZE + TILE_SIZE / 2;
          g.lineStyle(2, 0xcc6600, 0.85);
          g.strokeRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          g.lineBetween(cx, cy - 4, cx, cy + 4);
          g.lineBetween(cx - 3, cy + 1, cx, cy + 4);
          g.lineBetween(cx + 3, cy + 1, cx, cy + 4);
        }

        if (tile.type === 'ELEVATOR') {
          const cx = x * TILE_SIZE + TILE_SIZE / 2;
          const cy = y * TILE_SIZE + TILE_SIZE / 2;
          g.lineStyle(2, 0x4488cc, 0.9);
          g.strokeRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          g.lineBetween(cx, cy + 4, cx, cy - 4);
          g.lineBetween(cx - 3, cy - 1, cx, cy - 4);
          g.lineBetween(cx + 3, cy - 1, cx, cy - 4);
        }

        if (tile.type === 'DOOR' && tile.locked && !tile.doorOpen) {
          const cx = x * TILE_SIZE + TILE_SIZE / 2;
          const cy = y * TILE_SIZE + TILE_SIZE / 2;
          g.fillStyle(0xcc2222, 0.85);
          g.fillTriangle(cx, cy - 4, cx + 4, cy, cx, cy + 4);
          g.fillTriangle(cx, cy - 4, cx - 4, cy, cx, cy + 4);
        }

        if ((tile as WorldTile & { itemId?: string }).itemId) {
          const cx = x * TILE_SIZE + TILE_SIZE / 2;
          const cy = y * TILE_SIZE + TILE_SIZE / 2;
          g.fillStyle(0xffdd44, 0.9);
          g.fillTriangle(cx, cy - 5, cx + 4, cy, cx - 4, cy);
          g.fillTriangle(cx, cy + 5, cx + 4, cy, cx - 4, cy);
        }

        if (tile.oxygenLevel < 50) {
          const alpha = (1 - tile.oxygenLevel / 50) * 0.5;
          g.fillStyle(0x880000, alpha);
          g.fillRect(x * TILE_SIZE, y * TILE_SIZE + TILE_SIZE - 3, TILE_SIZE - 1, 3);
        }

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

  renderEntityData(entities: EntityRenderData[]): void {
    this.entityBgGfx.clear();
    const seen = new Set<string>();
    const useFOV = this.visibleTiles.size > 0;

    for (const e of entities) {
      if (useFOV && !e.isPlayer && !this.visibleTiles.has(`${e.x},${e.y}`)) continue;

      seen.add(e.id);

      // Derive facing from position delta
      const lastPos = this.entityLastPos.get(e.id);
      let facing = this.entityFacing.get(e.id) ?? 'south';
      if (lastPos && (lastPos.x !== e.x || lastPos.y !== e.y)) {
        const dx = e.x - lastPos.x;
        const dy = e.y - lastPos.y;
        if (Math.abs(dy) >= Math.abs(dx)) {
          facing = dy > 0 ? 'south' : 'north';
        } else {
          facing = dx > 0 ? 'east' : 'west';
        }
        this.entityFacing.set(e.id, facing);
      }
      this.entityLastPos.set(e.id, { x: e.x, y: e.y });

      // Ghost background indicator
      if (e.isGhost) {
        const bgColor = e.isPlayer ? 0x00cc99 : e.isEnforcer ? 0xcc2222 : 0x887744;
        this.entityBgGfx.fillStyle(bgColor, 0.12);
        this.entityBgGfx.fillRect(e.x * TILE_SIZE + 3, e.y * TILE_SIZE + 3, TILE_SIZE - 6, TILE_SIZE - 6);
      }

      // Get or create sprite
      let sprite = this.entitySprites.get(e.id);
      if (!sprite) {
        sprite = this.add.sprite(0, 0, 'chars').setDepth(5);
        this.entitySprites.set(e.id, sprite);
      }

      sprite.setPosition(e.x * TILE_SIZE + TILE_SIZE / 2, e.y * TILE_SIZE + TILE_SIZE / 2);
      sprite.setScale(CHAR_SCALE);
      sprite.setAlpha(e.isGhost ? 0.35 : 1.0);
      sprite.setVisible(true);

      const animKey = this.selectAnimKey(e, facing);
      if (this.anims.exists(animKey) && sprite.anims.getName() !== animKey) {
        sprite.play(animKey, true);
      }
    }

    // Hide sprites no longer in the render set
    for (const [id, sprite] of this.entitySprites) {
      if (!seen.has(id)) sprite.setVisible(false);
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
    for (const sprite of this.entitySprites.values()) sprite.destroy();
    this.entitySprites.clear();
    this.entityFacing.clear();
    this.entityLastPos.clear();
  }
}
