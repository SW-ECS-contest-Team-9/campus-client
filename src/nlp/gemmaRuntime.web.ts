// llama.rn is a native module. The optional on-device model is unavailable on web.
import type { MapPackage, RouteRequest } from './types';

export const MODEL_FILE = 'gemma3-270m-route-Q4_K_M.gguf';
export const MODEL_URI = '';
export async function checkModel(): Promise<boolean> { return false; }
export async function freeModel(): Promise<void> {}
export async function cancelInterpret(): Promise<void> {}
export interface GemmaResult {
  req: RouteRequest | null;
  raw: string;
  loadMs: number | null;
  totalMs: number;
  promptMs: number | null;
  genMs: number | null;
  promptN: number | null;
  genN: number | null;
}
export async function interpretWithGemma(_text: string, _pkg: MapPackage): Promise<GemmaResult> {
  throw new Error('The optional on-device model is unavailable on web.');
}
