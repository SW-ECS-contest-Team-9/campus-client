import { describe, expect, it } from 'vitest';
import fixture from '../map/fixture/campus-fixture.json';
import type { MapPackage } from '../map/package';
import model from './intentModel.json';
import { emptyIntent, intentMessages, intentJsonSchema, parseSearchIntent } from './searchIntent';
import { runSearchPipeline } from './searchPipeline';

const pkg = fixture as unknown as MapPackage;
const example = () => JSON.parse(model.messages.find((m) => m.role === 'assistant')!.content);
const named = (name: string) => ({ ...emptyIntent(), dest: { ...emptyIntent().dest, kind: 'place' as const, name } });
describe('production intent to grounded lookup', () => {
  it('sends an intent contract without map/office candidate lists or a forced name enum', () => {
    const messages = intentMessages('화장실');
    expect(messages.at(-1)?.content).toBe('화장실');
    expect(JSON.stringify(messages)).not.toContain('facility-draft:');
    expect(intentJsonSchema.properties.dest.properties.name).not.toHaveProperty('enum');
    expect(intentJsonSchema.properties.categories.items.enum).toContain('room');
  });
  it('maps model fields without repairing an incorrect destination', () => {
    const raw = { ...example(), dest: { name: '문예관', floor: null }, kind: 'place' };
    const intent = parseSearchIntent(raw)!;
    expect(intent.dest.name).toBe('문예관');
    const result = runSearchPipeline('장문수 교수님이 어디계시지?', intent, pkg);
    expect(result.resolution.valid).toBe(false);
    expect(result.request).toBeNull();
  });
  it('rejects malformed or model-authored availability claims', () => {
    expect(parseSearchIntent({ dest: { name: '혜인관' } })).toBeNull();
    expect(parseSearchIntent({ ...example(), unsupported: [{ text: '화장실', reason: '시설 없음' }] })).toBeNull();
  });
  it('keeps building entrances unselected and rain protection explicitly unguaranteed', () => {
    const result = runSearchPipeline('비 오는데 혜인관', { ...named('혜인관'), mode: 'rainProtected' }, pkg);
    expect(result.resolution.valid).toBe(true);
    expect(result.request?.destination.buildingKey).toBe('b:혜인관');
    expect(result.request?.destination.placeKey).toBeNull();
    expect(result.request?.mode).toBe('rainProtected');
    expect(result.request?.unsupported.some((u) => u.text === '비 회피')).toBe(true);
  });
  it('preserves a hard condition without pretending that the model extracted it correctly', () => {
    const intent = named('혜인관');
    const result = runSearchPipeline('휠체어로 혜인관', intent, pkg);
    expect(result.request?.mandatory).toEqual(expect.arrayContaining(['avoidStairs', 'wheelchairNeeded']));
    expect(result.request?.mode).toBe('accessible');
    expect(result.intent.mandatory).toEqual([]);
    expect(result.intent.mode).toBe('shortest');
  });
  it('does not substitute the current location for an unverified requested origin', () => {
    const intent = { ...named('혜인관'), origin: { name: '없는창고', floor: null, current: false } };
    const result = runSearchPipeline('없는창고에서 혜인관', intent, pkg);
    expect(result.originIssue).toBe(true);
    expect(result.request).toBeNull();
  });
  it('shows recorded facilities without fabricating a route or entrance destination', () => {
    const intent = { ...emptyIntent(), dest: { ...emptyIntent().dest, kind: 'category' as const, categories: ['restroom'] } };
    const result = runSearchPipeline('화장실', intent, pkg);
    expect(result.resolution.candidates).toHaveLength(40);
    expect(result.resolution.status).toBe('unroutable');
    expect(result.request).toBeNull();
  });
});
