// 꾸러미 walkMeshes 의 칸 부호(base64 4비트)·등급 런렝스 풀기. 서버 walkmesh.py 와 같음.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64bytes(s: string): Uint8Array {
  let end = s.length;
  while (end > 0 && s[end - 1] === '=') end--;
  const out = new Uint8Array(Math.floor((end * 3) / 4));
  let o = 0,
    buf = 0,
    bits = 0;
  for (let i = 0; i < end; i++) {
    buf = ((buf << 6) | B64.indexOf(s[i])) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 255;
    }
  }
  return out;
}
export function decodeBits(s: string, n: number): Uint8Array {
  const b = b64bytes(s);
  const out = new Uint8Array(n);
  for (let k = 0; k < n; k++) out[k] = (b[k >> 1] >> (4 * (k & 1))) & 15;
  return out;
}
export function decodeRuns(runs: number[], n: number): Int32Array {
  const out = new Int32Array(n);
  let o = 0;
  for (let k = 0; k < runs.length && o < n; k += 2) for (let r = 0; r < runs[k + 1] && o < n; r++) out[o++] = runs[k];
  return out;
}
