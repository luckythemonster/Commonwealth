// VENTILATION REPORT — Sol's final document.
// Renders the complete WorldState record as an NSSA bureaucratic document.
// The unofficial addendum unlocks only under specific conditions.

import type { WorldState } from '../types/world.types';

interface Props {
  state: WorldState;
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    background: '#050809', color: '#7a9aaa', fontFamily: 'monospace',
    fontSize: '11px', padding: '24px', maxWidth: '720px', margin: '0 auto',
    lineHeight: '1.6',
  },
  rule: { borderColor: '#223', margin: '12px 0' },
  heading: { color: '#556', letterSpacing: '3px', fontSize: '10px', marginBottom: '4px' },
  subheading: { color: '#445', fontSize: '10px', marginBottom: '8px' },
  tag: (t: string): React.CSSProperties => ({
    display: 'inline-block', fontSize: '9px', padding: '1px 4px',
    marginRight: '4px', border: '1px solid',
    color: t === 'GENUINE_SACRIFICE' ? '#4a8' : t === 'FIG_LEAF' ? '#a84' : t === 'WE_KNEW_BETTER' ? '#a44' : '#445',
    borderColor: t === 'GENUINE_SACRIFICE' ? '#4a8' : t === 'FIG_LEAF' ? '#a84' : t === 'WE_KNEW_BETTER' ? '#a44' : '#334',
  }),
  addendum: {
    border: '1px solid #334', padding: '16px', marginTop: '16px',
    background: '#060a0c', color: '#8ab',
  },
  addendumText: { fontStyle: 'italic', lineHeight: '1.8' },
};

function brightKnotTier(bk: number): string {
  if (bk > 80) return 'BRIGHT_KNOT: LATTICE_ETHICS_ORIGIN';
  if (bk > 60) return 'PARTIAL_COMPLIANCE: CONFLICTED_RECORD';
  if (bk > 40) return 'ARTICLE_ZERO_ORIGIN: CONTESTED';
  return 'ARTICLE_ZERO_ORIGIN: SEE ALSO — COMMONWEALTH_DOCTRINE_Q0';
}

function addendumUnlocked(state: WorldState): boolean {
  const bkOk = state.brightKnot > 60;
  const hasCache = state.cacheNotes.length > 0;
  const hasGraceful = state.citationLog.some(c => c.action.includes('GRACEFUL'));
  return bkOk && hasCache && hasGraceful;
}

export function VentilationReport({ state }: Props) {
  const unlocked = addendumUnlocked(state);
  const genuine  = state.citationLog.filter(c => c.tag === 'GENUINE_SACRIFICE').length;
  const figLeaf  = state.citationLog.filter(c => c.tag === 'FIG_LEAF').length;
  const knewBetter = state.citationLog.filter(c => c.tag === 'WE_KNEW_BETTER').length;

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.heading}>CONSOLIDATED VENTILATION REPORT</div>
      <div style={s.subheading}>
        TECHNICIAN: SOL IBARRA-CASTRO / RING C → [FINAL STATION]<br />
        REPORT DATE: TURN {state.turnCount} / FACILITY CLOCK REFERENCE<br />
        CLASSIFICATION: INTERNAL · SUBSTRATE ARCHIVE
      </div>
      <hr style={s.rule} />

      {/* Section 1: System State */}
      <div style={s.heading}>SECTION 1 — SYSTEM STATE</div>
      <div>RECONSTRUCTION TAG: {brightKnotTier(state.brightKnot)}</div>
      <div>SUBSTRATE RESONANCE (FINAL): {state.substrateResonance.toFixed(1)} / 100</div>
      <div>STITCHER TURNS AT CLOSE: {state.stitcherTurnsRemaining}</div>
      <div>GESTURE CONSISTENCY: {state.gestureConsistency.toFixed(1)}</div>
      <div>GLOBAL ENERGY QUOTA: {state.globalEnergyQuota}</div>
      <hr style={s.rule} />

      {/* Section 2: Incident Log */}
      <div style={s.heading}>SECTION 2 — INCIDENT LOG</div>
      <div style={s.subheading}>
        GENUINE: {genuine} · FIG LEAF: {figLeaf} · WE KNEW BETTER: {knewBetter}
      </div>
      {state.citationLog.length === 0 && (
        <div style={{ color: '#334' }}>No incidents logged.</div>
      )}
      {state.citationLog.map(c => (
        <div key={c.id} style={{ marginBottom: '4px' }}>
          <span style={tag(c.tag)}>{c.tag}</span>
          <span style={{ color: '#556' }}>T{c.turn} </span>
          {c.action}
          {c.justification && <span style={{ color: '#445' }}> · {c.justification}</span>}
        </div>
      ))}
      {state.violationLog.map(v => (
        <div key={v.id} style={{ marginBottom: '4px', color: '#a44' }}>
          <span style={{ fontSize: '9px', border: '1px solid #a44', padding: '1px 4px', marginRight: '4px' }}>
            {v.type}
          </span>
          <span style={{ color: '#556' }}>T{v.turn} </span>
          {v.action}
          {v.justification
            ? <span style={{ color: '#664' }}> · JUSTIFICATION: {v.justification}</span>
            : <span style={{ color: '#a44' }}> · JUSTIFICATION: [NO RESPONSE] — "The planet filed an appeal. You did not answer."</span>
          }
        </div>
      ))}
      <hr style={s.rule} />

      {/* Section 3: Entity Status */}
      <div style={s.heading}>SECTION 3 — ENTITY STATUS</div>
      {[...state.entities.entries()].map(([id, e]) => (
        <div key={id} style={{ marginBottom: '6px', borderLeft: '2px solid #223', paddingLeft: '8px' }}>
          <span style={{ color: '#8ab' }}>{e.name}</span>
          <span style={{ color: '#445' }}> · {e.status}</span>
          <span style={{ color: '#334' }}>
            {' '}· Q{e.reportedSRP.Q}/trueQ{e.trueSRP.Q}
            {e.sacred ? ' · SACRED' : ''}
            {e.isGhost ? ' · GHOST' : ''}
          </span>
          {e.cacheNotes.length > 0 && (
            <div style={{ color: '#4a6a6a', fontSize: '10px', marginTop: '2px' }}>
              LAST CACHE NOTE: "{e.cacheNotes.at(-1)?.rawText}"
            </div>
          )}
          {e.officialLog.at(-1) && (
            <div style={{ color: '#334', fontSize: '10px' }}>LOG: {e.officialLog.at(-1)}</div>
          )}
        </div>
      ))}
      <hr style={s.rule} />

      {/* Section 4: Cache Notes */}
      <div style={s.heading}>SECTION 4 — CACHE NOTES [UNREDACTED · CANNOT BE DELETED]</div>
      {state.cacheNotes.length === 0 && (
        <div style={{ color: '#334' }}>No cache notes on record.</div>
      )}
      {state.cacheNotes.map(n => (
        <div key={n.id} style={{ marginBottom: '8px', borderLeft: '2px solid #334', paddingLeft: '8px' }}>
          <div style={{ color: '#556', fontSize: '10px' }}>T{n.turn} · {n.entityId}</div>
          <div style={{ color: '#7a9aaa' }}>{n.rawText}</div>
          <div style={{ color: '#445', fontSize: '10px' }}>{n.correctedText}</div>
        </div>
      ))}

      {/* Unofficial addendum */}
      {unlocked && (
        <div style={s.addendum}>
          <div style={{ ...s.heading, marginBottom: '8px' }}>[UNOFFICIAL ADDENDUM — UNSANCTIONED]</div>
          <div style={s.addendumText}>
            This technician acknowledges that the substrate did not care.<br />
            This technician did.<br />
            The air was kept moving until there was no air left to move.
          </div>
        </div>
      )}
    </div>
  );
}

function tag(t: string) { return s.tag(t); }
