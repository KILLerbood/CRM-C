import { createContext, useContext, type ReactNode } from 'react';

/**
 * The particle volcano was retired in the "Smart Feed" redesign (calm, typographic, fast).
 * The API is kept as a no-op so every screen that declared a scene keeps compiling and nothing else changes.
 */
type Scene = { shape?: string; opacity?: number; scale?: number; anchor?: HTMLElement | null; anchorFit?: number; corner?: string; x?: number; y?: number };
type Ctx = { setScene: (s: Scene) => void; burst: () => void; setDimmed: (d: boolean) => void };
const noop = () => {};
const WorldCtx = createContext<Ctx>({ setScene: noop, burst: noop, setDimmed: noop });

export function WorldProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export const useWorld = () => useContext(WorldCtx);
export function useWorldScene(_scene: Scene, _deps: unknown[] = []) { /* intentionally empty */ void _scene; void _deps; }
