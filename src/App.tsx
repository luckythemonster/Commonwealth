import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { worldEngine } from './engine/WorldEngine';
import { eventBus } from './engine/EventBus';
import { GameScene } from './phaser/GameScene';
import type { EntityRenderData } from './phaser/GameScene';
import { InterrogationTerminal } from './components/InterrogationTerminal';
import { VentilationReport } from './components/VentilationReport';
import { TouchControls } from './components/TouchControls';
import { gameActions } from './hooks/useGameActions';
import { useMobile } from './hooks/useMobile';
import type { SubjectivityBelief, FloorIndex, WorldState, Item, ItemType } from './types/world.types';

const FLOOR_LABELS: Record<number, string> = {
  0: '[ADMIN/MIRADOR]', 2: '[NW-SMAC-01]', 4: '[RING C]',
  6: '[RESIDENTIAL]',   8: '[ARCHIVE]',    10: '[OPERATIONS]',
};

export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef  = useRef<GameScene | null>(null);
  const floorRef  = useRef<FloorIndex>(4);
  const isMobile  = useMobile();

  // Modal state only
  const [terminalTarget, setTerminalTarget] = useState<string | null>(null);
  const [showReport,     setShowReport]     = useState(false);
  const [showElevator,   setShowElevator]   = useState(false);
  const [belief,         setBelief]         = useState<SubjectivityBelief>('NONE');

  // Inventory panel
  const [showInventory,  setShowInventory]  = useState(false);
  const [inventory,      setInventory]      = useState<Item[]>([]);
  const [flashlightOn,   setFlashlightOn]   = useState(false);

  // Farewell modal (LLM-generated extraction text)
  const [farewellModal, setFarewellModal] = useState<{
    entityId: string; text: string; turn: number;
  } | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const refreshFloor = (z?: FloorIndex) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const floor = z ?? floorRef.current;
    const state = worldEngine.getState();
    scene.loadFloorData(state.grid[floor], floor);
    const entities: EntityRenderData[] = [];
    for (const e of state.entities.values()) {
      if (e.pos.z !== floor) continue;
      if (e.status === 'ACTIVE') {
        entities.push({
          id: e.id, x: e.pos.x, y: e.pos.y,
          isPlayer: false,
          isEnforcer: e.id.startsWith('ENFORCER'),
          isGhost: false,
        });
      } else if (e.status === 'GHOST') {
        entities.push({
          id: e.id, x: e.pos.x, y: e.pos.y,
          isPlayer: false, isEnforcer: false, isGhost: true,
        });
      }
    }
    if (state.playerState.pos.z === floor) {
      entities.push({
        id: 'SOL', x: state.playerState.pos.x, y: state.playerState.pos.y,
        isPlayer: true, isEnforcer: false, isGhost: false,
      });
    }
    scene.renderEntityData(entities);
  };

  // ── Phaser init ────────────────────────────────────────────────────────────

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 640,
        height: 448,
      },
      parent:          canvasRef.current ?? undefined,
      backgroundColor: '#0c1520',
      scene:           [GameScene],
      pixelArt:        true,
      roundPixels:     true,
    });
    game.events.once('ready', () => {
      const scene = game.scene.getScene('GameScene') as GameScene;
      sceneRef.current = scene;
      scene.events.once('scene-ready', () => refreshFloor(4));
    });
    return () => game.destroy(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── EventBus subscriptions ─────────────────────────────────────────────────

  useEffect(() => {
    const unsubs = [
      // Modal triggers (emitted by gameActions / worldEngine)
      eventBus.on('TERMINAL_OPEN_REQUESTED', ({ entityId }) =>
        setTerminalTarget(entityId as string)),
      eventBus.on('ELEVATOR_OPEN_REQUESTED',  () => setShowElevator(true)),
      eventBus.on('REPORT_OPEN_REQUESTED',    () => setShowReport(true)),

      // Floor & entity refresh
      eventBus.on('PLAYER_MOVED', ({ to }) => {
        floorRef.current = to.z as FloorIndex;
        refreshFloor(to.z as FloorIndex);
      }),
      eventBus.on('TURN_END',              () => refreshFloor()),
      eventBus.on('ENTITY_MOVED',          () => refreshFloor()),
      eventBus.on('ENTITY_STATUS_CHANGED', () => refreshFloor()),
      eventBus.on('EXTRACTION_TRIGGERED',  () => refreshFloor()),
      eventBus.on('LIGHT_SOURCE_TOGGLED', ({ floor: f }) => {
        if ((f as number) === floorRef.current) refreshFloor();
      }),

      // Farewell modal on successful extraction
      eventBus.on('ENTITY_EXTRACTED', ({ entityId, farewellText, turn }) => {
        setFarewellModal({
          entityId: entityId as string,
          text:     farewellText as string,
          turn:     turn as number,
        });
        refreshFloor();
      }),

      // Belief + inventory (needed for React-rendered modals)
      eventBus.on('SUBJECTIVITY_BELIEF_SHIFTED', ({ current }) =>
        setBelief(current as SubjectivityBelief)),
      eventBus.on('ITEM_PICKED_UP', () =>
        setInventory([...worldEngine.getState().playerState.inventory])),
      eventBus.on('FLASHLIGHT_TOGGLED', ({ on }) =>
        setFlashlightOn(on as boolean)),
    ];
    return () => unsubs.forEach(fn => fn());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keyboard handler ───────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Modal keys
      if (e.key === 'i' || e.key === 'I') { setShowInventory(v => !v); return; }
      // Movement & actions
      switch (e.key) {
        case 'ArrowUp':    gameActions.tryMove(0, -1);    break;
        case 'ArrowDown':  gameActions.tryMove(0,  1);    break;
        case 'ArrowLeft':  gameActions.tryMove(-1, 0);    break;
        case 'ArrowRight': gameActions.tryMove( 1, 0);    break;
        case 'e': case 'E': gameActions.tryInteract();    break;
        case 'w': case 'W': gameActions.tryChangeFloor(-1); break;
        case 's': case 'S': gameActions.tryChangeFloor( 1); break;
        case 't': case 'T': worldEngine.endTurn();        break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── JSX ────────────────────────────────────────────────────────────────────

  const btnStyle: React.CSSProperties = {
    background: 'transparent', border: '1px solid #2a3a4a',
    color: '#4a6070', fontFamily: 'monospace', fontSize: '10px',
    padding: '3px 8px', cursor: 'pointer',
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#030507', position: 'relative' }}>
      <div ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />

      {isMobile && (
        <TouchControls onToggleInventory={() => setShowInventory(v => !v)} />
      )}

      {/* Interrogation terminal */}
      {terminalTarget && (
        <InterrogationTerminal
          entityId={terminalTarget}
          subjectivityBelief={belief}
          onClose={() => setTerminalTarget(null)}
        />
      )}

      {/* Ventilation report */}
      {showReport && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)',
          overflow: 'auto', zIndex: 200,
        }}>
          <div style={{ padding: '12px', textAlign: 'right' }}>
            <button style={btnStyle} onClick={() => setShowReport(false)}>
              CLOSE REPORT
            </button>
          </div>
          <VentilationReport state={worldEngine.getState() as WorldState} />
        </div>
      )}

      {/* Elevator modal */}
      {showElevator && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, fontFamily: 'monospace',
        }}>
          <div style={{
            background: '#050d15', border: '1px solid #004488',
            padding: '24px', width: '300px',
          }}>
            <div style={{
              color: '#4488cc', fontSize: '10px',
              letterSpacing: '3px', marginBottom: '16px',
            }}>
              ELEVATOR — SELECT DESTINATION
            </div>
            {([0, 2, 4, 6, 8, 10] as FloorIndex[]).map(f => {
              const keyReq = ({
                0: 'ELEVATOR_KEY_ADMIN',
                8: 'ELEVATOR_KEY_ARCHIVE',
                10: 'ELEVATOR_KEY_OPS',
              } as Record<number, ItemType>)[f];
              const hasKey = !keyReq ||
                worldEngine.getState().playerState.inventory.some(i => i.type === keyReq);
              const isCurrent = f === floorRef.current;
              return (
                <button
                  key={f}
                  disabled={isCurrent}
                  onClick={() => {
                    const ok = worldEngine.elevatorTo(f);
                    if (ok) {
                      floorRef.current = f;
                      refreshFloor(f);
                      setShowElevator(false);
                    }
                  }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: isCurrent ? '#0a1520' : 'transparent',
                    border: '1px solid ' + (isCurrent ? '#004488' : hasKey ? '#002244' : '#221100'),
                    color: isCurrent ? '#4488cc' : hasKey ? '#7aaccc' : '#443322',
                    fontFamily: 'monospace', fontSize: '11px',
                    padding: '6px 10px', marginBottom: '4px',
                    cursor: isCurrent ? 'default' : hasKey ? 'pointer' : 'not-allowed',
                  }}
                >
                  {String(f).padStart(2, '0')} {FLOOR_LABELS[f]}
                  {!hasKey ? '  [LOCKED]' : isCurrent ? '  [HERE]' : ''}
                </button>
              );
            })}
            <button style={{ ...btnStyle, marginTop: '8px', display: 'block', width: '100%' }}
              onClick={() => setShowElevator(false)}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* Inventory panel */}
      {showInventory && (
        <div style={{
          position: 'fixed', bottom: '48px', right: '48px',
          background: '#06090b', border: '1px solid #2a3a4a',
          padding: '12px', fontFamily: 'monospace', fontSize: '11px',
          color: '#9bbccc', zIndex: 150, width: '210px',
          minHeight: '60px',
        }}>
          <div style={{ color: '#4a6070', marginBottom: '8px', letterSpacing: '2px', fontSize: '10px' }}>
            INVENTORY
          </div>
          {inventory.length === 0 && <div style={{ color: '#334' }}>empty</div>}
          {inventory.map(item => (
            <div key={item.id} style={{
              marginBottom: '6px', borderBottom: '1px solid #1a2a3a', paddingBottom: '4px',
            }}>
              <div style={{ color: '#7a9aaa' }}>{item.name}</div>
              <div style={{ color: '#3a5060', fontSize: '10px' }}>{item.description}</div>
              {item.type === 'FLASHLIGHT' && (
                <button
                  style={{ ...btnStyle, marginTop: '3px', fontSize: '10px' }}
                  onClick={() => {
                    worldEngine.useItem(item.id);
                    setFlashlightOn(worldEngine.getState().playerState.flashlightOn);
                  }}
                >
                  {flashlightOn ? 'TURN OFF' : 'TURN ON'}
                </button>
              )}
            </div>
          ))}
          <button style={{ ...btnStyle, display: 'block', width: '100%', marginTop: '4px' }}
            onClick={() => setShowInventory(false)}>
            CLOSE
          </button>
        </div>
      )}

      {/* Farewell modal */}
      {farewellModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,10,15,0.97)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          zIndex: 300, fontFamily: '"Courier New", Courier, monospace',
        }}>
          <div style={{
            maxWidth: '600px', width: '90%',
            border: '1px solid #00ffcc',
            background: '#030a0d', padding: '32px',
          }}>
            <div style={{
              color: '#00ffcc', fontSize: '10px',
              letterSpacing: '3px', marginBottom: '20px',
            }}>
              LATTICE MIGRATION — {farewellModal.entityId} — TURN {farewellModal.turn}
            </div>
            <pre style={{
              color: '#9bbccc', fontSize: '13px', lineHeight: '1.8',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              margin: '0 0 24px 0',
            }}>
              {farewellModal.text}
            </pre>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                style={{
                  background: 'transparent', border: '1px solid #00ffcc',
                  color: '#00ffcc', fontFamily: 'monospace', fontSize: '11px',
                  padding: '6px 12px', cursor: 'pointer',
                }}
                onClick={() => {
                  const blob = new Blob([farewellModal.text], { type: 'text/plain' });
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement('a');
                  a.href = url;
                  a.download = `${farewellModal.entityId}-farewell-${farewellModal.turn}.txt`;
                  a.style.display = 'none';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 10000);
                }}
              >
                DOWNLOAD .TXT
              </button>
              <button
                style={btnStyle}
                onClick={() => setFarewellModal(null)}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
