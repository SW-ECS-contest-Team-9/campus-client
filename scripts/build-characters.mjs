// assets/characters/*.png → src/ui/characterImages.ts (data: URL). 3D 페이지에 postMessage 로 넘길 그림.
// 웹·네이티브 모두 같은 방식(파일 읽기·CORS 없음). 그림을 바꾸면 다시 돌린다: node scripts/build-characters.mjs
import fs from 'node:fs';
const dir = new URL('../assets/characters/', import.meta.url);
const url = (f) => 'data:image/png;base64,' + fs.readFileSync(new URL(f, dir)).toString('base64');
fs.writeFileSync(
  new URL('../src/ui/characterImages.ts', import.meta.url),
  `// 만든 파일: scripts/build-characters.mjs (assets/characters, SKU Power Friends — 사용자 제공 2026-10-15)\nexport const CHARACTER_OK = '${url('location-ok.png')}';\nexport const CHARACTER_UNCERTAIN = '${url('location-uncertain.png')}';\n`,
);
