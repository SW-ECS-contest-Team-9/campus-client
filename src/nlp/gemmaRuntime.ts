// 기기 안 Gemma 3 270M(미세조정, Q4_K_M 253 MB)을 llama.rn 으로. 처음 쓸 때 불러오고, 앱이 뒤로 가면 놓음.
// 모델은 APK 에 넣지 않음. v1.0 시험: PC 에서 adb push 로 앱 외부 파일 폴더에 둠(README "AI 문장 해석").
// 나중: 백엔드(FastAPI) 정적 파일로 받아 sha256 확인 뒤 같은 자리에 저장(백엔드는 아직 안 바꿈).
import { File } from 'expo-file-system';
import { initLlama, type LlamaContext } from 'llama.rn';
import { AppState, Platform } from 'react-native';
import { messages, jsonSchema, toRouteRequest, type ModelOutput } from './gemma';
import type { MapPackage, RouteRequest } from './types';

export const MODEL_FILE = 'gemma3-270m-route-Q4_K_M.gguf';
/** 앱 외부 파일 폴더(권한 없이 앱이 읽음, adb push 가능) */
export const MODEL_URI = `file:///storage/emulated/0/Android/data/kr.ac.skuniv.campusclient/files/${MODEL_FILE}`;

let ctx: LlamaContext | null = null;
let loading: Promise<LlamaContext> | null = null;
export let lastLoadMs: number | null = null;

export function modelAvailable(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    return new File(MODEL_URI).exists;
  } catch {
    return false;
  }
}

async function load(): Promise<LlamaContext> {
  if (ctx) return ctx;
  if (!loading) {
    const t0 = Date.now();
    // S21 실측(llama-bench): 4 스레드가 가장 빠름. 문맥 2048, CPU 만(GPU 층 0)
    loading = initLlama({ model: MODEL_URI, n_ctx: 2048, n_threads: 4, n_gpu_layers: 0, use_mlock: false })
      .then((c) => {
        ctx = c;
        lastLoadMs = Date.now() - t0;
        return c;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

/** 놓기(메모리 반환). 앱이 뒤로 가면 부름. */
export async function freeModel(): Promise<void> {
  const c = ctx;
  ctx = null;
  if (c) await c.release().catch(() => undefined);
}
AppState.addEventListener('change', (s) => {
  if (s !== 'active') void freeModel();
});

export async function cancelInterpret(): Promise<void> {
  await ctx?.stopCompletion().catch(() => undefined);
}

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

/** 문장 → 요청(AI). 출력은 JSON 스키마로 제한(목록 안 이름만). 해석 실패면 req null. */
export async function interpretWithGemma(text: string, pkg: MapPackage): Promise<GemmaResult> {
  const t0 = Date.now();
  const firstLoad = !ctx;
  const c = await load();
  const { places, messages: msgs } = messages(text, pkg);
  const r = await c.completion({
    messages: msgs,
    temperature: 0,
    n_predict: 300,
    response_format: { type: 'json_schema', json_schema: { schema: jsonSchema(places, pkg) } },
  });
  let req: RouteRequest | null = null;
  try {
    req = toRouteRequest(JSON.parse(r.text) as ModelOutput, pkg);
  } catch {
    req = null;
  }
  const tm = r.timings as { prompt_ms?: number; predicted_ms?: number; prompt_n?: number; predicted_n?: number } | undefined;
  return {
    req,
    raw: r.text,
    loadMs: firstLoad ? lastLoadMs : null,
    totalMs: Date.now() - t0,
    promptMs: tm?.prompt_ms ?? null,
    genMs: tm?.predicted_ms ?? null,
    promptN: tm?.prompt_n ?? null,
    genN: tm?.predicted_n ?? null,
  };
}
