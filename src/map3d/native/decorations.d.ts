import type { Scene, Object3D } from 'three';
import type { MapTheme } from './mapTheme';
export type { MapTheme } from './mapTheme';
export function normalizeMapTheme(value: unknown): MapTheme;
export function createDecorations(scene: Scene, root: Object3D, options?: { lowSpec?: boolean }): {
 setTheme(name: MapTheme): void;
 setMotion(enabled: boolean): void;
 tick(nowMs: number): boolean;
 dispose(): void;
};
