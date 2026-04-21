import { useMemo } from 'react';

// pointer: coarse is true on touch devices (Android/iOS), false on desktop mice.
// Synchronous and stable for the session lifetime — no useEffect needed.
export function useMobile(): boolean {
  return useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);
}
