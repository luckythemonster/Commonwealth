// useInput — keyboard-only wrapper around useGameActions.
// Attaches a keydown listener and routes key presses to the shared action callbacks.
// For touch controls, see TouchControls.tsx which uses the same GameActions.

import { useEffect } from 'react';
import type { GameActions } from './useGameActions';

interface KeyboardHandlers {
  onEndTurn: () => void;
  onOpenInventory: () => void;
}

export function useInput(actions: GameActions, { onEndTurn, onOpenInventory }: KeyboardHandlers) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      switch (e.key) {
        case 'ArrowUp':    actions.tryMove(0, -1);   break;
        case 'ArrowDown':  actions.tryMove(0,  1);   break;
        case 'ArrowLeft':  actions.tryMove(-1, 0);   break;
        case 'ArrowRight': actions.tryMove(1,  0);   break;
        case 'w': case 'W': actions.tryChangeFloor(-1); break;
        case 's': case 'S': actions.tryChangeFloor(1);  break;
        case 'e': case 'E': actions.tryInteract();       break;
        case 't': case 'T': onEndTurn();                 break;
        case 'i': case 'I': onOpenInventory();           break;
        default: return;
      }
      e.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions, onEndTurn, onOpenInventory]);
}
