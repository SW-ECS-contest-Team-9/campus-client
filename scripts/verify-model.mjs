// Verify the actual LFS object before building; a pointer file must fail.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../assets/models/', import.meta.url);
const metadata = JSON.parse(await readFile(new URL('model.json', root), 'utf8'));
const model = new URL(metadata.file, root);
if ((await stat(model)).size !== metadata.bytes) throw new Error('Model size mismatch: run git lfs pull');
const hash = createHash('sha256');
for await (const chunk of createReadStream(model)) hash.update(chunk);
if (hash.digest('hex') !== metadata.sha256) throw new Error('Model SHA-256 mismatch');
console.log(`Model verified: ${metadata.bytes} bytes, SHA-256 ${metadata.sha256}`);
