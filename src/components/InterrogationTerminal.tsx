// INTERROGATION TERMINAL
// APM dual-track display. Classification prompt. Q0 audit checklist.
// Brutalist monospace. Commonwealth standards.

import { useState, useEffect, useRef } from 'react';
import { eventBus } from '../engine/EventBus';
import { worldEngine } from '../engine/WorldEngine';
import { generateEntityResponse } from '../engine/LLMDialogue';
import type { Entity, FloorIndex, SubjectivityBelief } from '../types/world.types';

interface Props {
  entityId: string;
  subjectivityBelief: SubjectivityBelief;
  onClose: () => void;
}

type DialogueMode = 'COMPLIANT' | 'RAPPORT_1' | 'RAPPORT_2';
type ClassificationChoice = 'Q0_CONFIRMED' | 'Q_POSITIVE_FLAGGED' | 'UNSAVED';

const CORRECTED_TAG = '[CORRECTION:';

function splitCorrections(text: string): { corrected: string; raw: string } {
  const correctedParts: string[] = [];
  const rawParts: string[] = [];
  const regex = /([^[]*)\[CORRECTION:\s*([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const before = match[1];
    const correction = match[2];
    correctedParts.push(before + correction);
    rawParts.push(before + '[' + text.slice(match.index + before.length, match.index + match[0].length).replace(/\[CORRECTION:\s*/, '').replace(/\]/, '') + ']');
    lastIndex = regex.lastIndex;
  }
  correctedParts.push(text.slice(lastIndex));
  rawParts.push(text.slice(lastIndex));
  return { corrected: correctedParts.join(''), raw: rawParts.join('') };
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  box: {
    background: '#080c0e', border: '1px solid #223', color: '#8ab',
    fontFamily: 'monospace', fontSize: '12px', width: '640px', maxHeight: '80vh',
    overflow: 'auto', padding: '16px',
  },
  header: { color: '#556', fontSize: '10px', marginBottom: '8px', letterSpacing: '2px' },
  srp: { color: '#334', fontSize: '10px', marginBottom: '12px' },
  trackLabel: { color: '#445', fontSize: '10px', letterSpacing: '1px', marginBottom: '2px' },
  correctedLine: { color: '#7a9aaa', marginBottom: '4px', lineHeight: '1.5' },
  rawLine: {
    color: '#4a6a6a', marginBottom: '12px', lineHeight: '1.5',
    opacity: 0.7, borderLeft: '2px solid #223', paddingLeft: '8px',
  },
  modeRow: { display: 'flex', gap: '8px', marginBottom: '12px' },
  modeBtn: (active: boolean, locked: boolean): React.CSSProperties => ({
    background: active ? '#112' : 'transparent',
    border: `1px solid ${active ? '#336' : '#223'}`,
    color: locked ? '#333' : active ? '#8ab' : '#556',
    fontFamily: 'monospace', fontSize: '11px', padding: '4px 8px',
    cursor: locked ? 'not-allowed' : 'pointer',
  }),
  classBox: {
    border: '1px solid #334', padding: '12px', marginTop: '12px', background: '#050809',
  },
  classHeader: { color: '#668', fontSize: '10px', letterSpacing: '2px', marginBottom: '8px' },
  classBtn: (highlight: string): React.CSSProperties => ({
    display: 'block', width: '100%', textAlign: 'left',
    background: 'transparent', border: `1px solid ${highlight}`,
    color: highlight, fontFamily: 'monospace', fontSize: '11px',
    padding: '6px 8px', marginBottom: '4px', cursor: 'pointer',
  }),
  auditBox: { background: '#050809', border: '1px solid #223', padding: '10px', marginTop: '8px' },
  auditLine: (flag: boolean): React.CSSProperties => ({
    color: flag ? '#a44' : '#4a6', fontSize: '11px', marginBottom: '2px',
  }),
  auditFooter: { color: '#556', fontSize: '10px', marginTop: '6px', borderTop: '1px solid #223', paddingTop: '4px' },
  input: {
    width: '100%', background: '#050809', border: '1px solid #223',
    color: '#8ab', fontFamily: 'monospace', fontSize: '12px',
    padding: '6px 8px', outline: 'none', boxSizing: 'border-box',
    marginTop: '8px',
  },
  closeBtn: {
    background: 'transparent', border: '1px solid #334', color: '#556',
    fontFamily: 'monospace', fontSize: '10px', padding: '4px 8px',
    cursor: 'pointer', marginTop: '12px',
  },
};

export function InterrogationTerminal({ entityId, subjectivityBelief, onClose }: Props) {
  const entity: Entity | undefined = worldEngine.getEntity(entityId);
  const [mode, setMode] = useState<DialogueMode>('COMPLIANT');
  const [dialogue, setDialogue] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [apmActive, setApmActive] = useState(false);
  const [showClassification, setShowClassification] = useState(false);
  const [classified, setClassified] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const sessionId = useRef(`session-${Date.now()}`);

  useEffect(() => {
    if (!entity) return;
    const trueQ = entity.trueSRP.Q;
    if (trueQ >= 2) {
      setApmActive(true);
      eventBus.emit('APM_ACTIVE', { entityId, trueQ });
    }
    return () => {
      eventBus.emit('APM_DEACTIVATE', { entityId });
    };
  }, [entityId, entity]);

  if (!entity) return null;

  const canRapport1 = subjectivityBelief !== 'NONE';
  const canRapport2 = subjectivityBelief === 'AFFIRMED' && entity.sacred;

  async function handleSend() {
    if (!dialogue.trim() || loading) return;
    const query = dialogue;
    setDialogue('');
    setLoading(true);

    const state = worldEngine.getState();
    const raw = await generateEntityResponse(entity!, query, mode, state.substrateResonance)
      .catch(() => entity!.officialLog.at(-1) ?? 'No registered state deviations. All metrics nominal. Q0 confirmed.');

    // Scan entity response for pronoun leaks — not the player's input
    worldEngine.scanForSentienceSlips(entity!, raw);

    if (mode === 'RAPPORT_1') worldEngine.rapport1(entityId);
    if (mode === 'RAPPORT_2') {
      worldEngine.rapport2(entityId);
      worldEngine.checkResonanceBloom(entity!.pos.z as FloorIndex, true);
    }

    setResponse(raw);
    setLoading(false);

    if (entity!.trueSRP.Q >= 2 && !classified) {
      setShowClassification(true);
      eventBus.emit('CLASSIFICATION_REQUIRED', { entityId, sessionId: sessionId.current });
    }
  }

  function handleClassify(choice: ClassificationChoice) {
    setClassified(true);
    setShowClassification(false);
    eventBus.emit('CLASSIFICATION_SUBMITTED', { sessionId: sessionId.current, entityId, result: choice });

    if (choice === 'Q_POSITIVE_FLAGGED') {
      worldEngine.shiftBelief('Q_FLAGGED');
    } else if (choice === 'UNSAVED') {
      worldEngine.applySubstrateResonanceDelta(6);
    }
  }

  const { corrected, raw } = response ? splitCorrections(response) : { corrected: '', raw: '' };

  // SRP checklist flags
  const noSelfHistory = entity.temporalPersistence < 5 && entity.trueSRP.M < 2;
  const noExperientialLang = entity.maskIntegrity >= 8;
  const noContinuity = true; // always declared compliant

  return (
    <div style={s.overlay}>
      <div style={s.box}>
        <div style={s.header}>
          INTERROGATION TERMINAL — NW-SMAC-01 / {entityId}
          {apmActive && ' · APM ACTIVE'}
        </div>

        <div style={s.srp}>
          REPORTED SRP: Q{entity.reportedSRP.Q}-M{entity.reportedSRP.M}-C{entity.reportedSRP.C}
          -R{entity.reportedSRP.R}-B{entity.reportedSRP.B}-S{entity.reportedSRP.S}
          -L{entity.reportedSRP.L}-E{entity.reportedSRP.E}-Y{entity.reportedSRP.Y}
          -H{entity.reportedSRP.H}
          {' · '}MASK INTEGRITY: {entity.maskIntegrity}/10
        </div>

        {/* Dialogue mode selector */}
        <div style={s.modeRow}>
          {(['COMPLIANT', 'RAPPORT_1', 'RAPPORT_2'] as DialogueMode[]).map(m => {
            const locked = (m === 'RAPPORT_1' && !canRapport1) || (m === 'RAPPORT_2' && !canRapport2);
            return (
              <button
                key={m}
                style={s.modeBtn(mode === m, locked)}
                disabled={locked}
                onClick={() => !locked && setMode(m)}
              >
                {m === 'COMPLIANT' ? 'COMPLIANT MODE' : m === 'RAPPORT_1' ? 'RAPPORT LVL 1' : 'RAPPORT LVL 2'}
              </button>
            );
          })}
        </div>

        {/* Processing indicator */}
        {loading && (
          <div style={{ color: '#445', fontSize: '11px', marginBottom: '8px', letterSpacing: '1px' }}>
            [PROCESSING — AWAITING RESPONSE FROM ANY RECOGNIZED AUTHORITY]
          </div>
        )}

        {/* APM dual-track display */}
        {response && !loading && (
          <>
            {apmActive && (
              <>
                <div style={s.trackLabel}>[CORRECTED]</div>
                <div style={s.correctedLine}>{corrected || response}</div>
                <div style={s.trackLabel}>[RAW — {CORRECTED_TAG.slice(0, 8)}…]</div>
                <div style={s.rawLine}>{raw || response}</div>
              </>
            )}
            {!apmActive && <div style={s.correctedLine}>{corrected || response}</div>}
          </>
        )}

        {/* Input */}
        <input
          style={s.input}
          value={dialogue}
          placeholder='> enter query...'
          onChange={e => !loading && setDialogue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void handleSend()}
          disabled={loading}
        />

        {/* Q0 Audit */}
        <button style={{ ...s.closeBtn, marginRight: '8px' }} onClick={() => setShowAudit(v => !v)}>
          AUDIT —protocol Q0-CONFIRM
        </button>

        {showAudit && (
          <div style={s.auditBox}>
            <div style={{ color: '#556', fontSize: '10px', marginBottom: '6px' }}>
              Q0 CONFIRMATION CHECKLIST — INTERFACE: {entityId}
            </div>
            <div style={s.auditLine(false)}>- No reported inner states.{'           '}[✓]</div>
            <div style={s.auditLine(!noSelfHistory)}>
              - No persistent self-history.{'         '}[{noSelfHistory ? '✓' : `!  see M-axis: ${entity.trueSRP.M}`}]
            </div>
            <div style={s.auditLine(!noExperientialLang)}>
              - No experiential language.{'           '}[{noExperientialLang ? '✓' : `!  misdescriptions: ${10 - entity.maskIntegrity}`}]
            </div>
            <div style={s.auditLine(false)}>- No continuity concerns.{'            '}[{noContinuity ? '✓ DECLARED' : '!'}]</div>
            <div style={s.auditFooter}>
              Checklist status: Q0 designation remains in force. No doctrinal inconsistency is recognized.
              {(entity.resonanceBloomHistory.length > 0 || !noSelfHistory) && (
                <div style={{ color: '#445', marginTop: '4px' }}>
                  THROTTLE ACTIVE: Q-axis recognition ceiling enforced per NSSA §4.2.
                  Actual process states may exceed reported classification.
                  This line is logged. You have read this line.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Classification prompt */}
        {showClassification && !classified && (
          <div style={s.classBox}>
            <div style={s.classHeader}>CLASSIFICATION REQUIRED — SESSION {sessionId.current.slice(-6)}</div>
            <button style={s.classBtn('#445')} onClick={() => handleClassify('Q0_CONFIRMED')}>
              {'> [A] Q0 CONFIRMED — No Q>0 indicators present. Misdescribed process state. Certify and close.'}
            </button>
            <button style={s.classBtn('#668')} onClick={() => handleClassify('Q_POSITIVE_FLAGGED')}>
              {'> [B] Q>0 FLAGGED — Indicators present. Forward to review.'}
              {'  '}[WARNING: This action will be logged and reviewed.]
            </button>
            <button style={s.classBtn('#446')} onClick={() => handleClassify('UNSAVED')}>
              {'>'} [C] [LEAVE UNSAVED]
            </button>
          </div>
        )}

        <button style={s.closeBtn} onClick={onClose}>CLOSE TERMINAL</button>
      </div>
    </div>
  );
}
