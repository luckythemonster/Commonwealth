import { useMemo } from 'react';

export function useMobile(): boolean {
  return useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);
}
