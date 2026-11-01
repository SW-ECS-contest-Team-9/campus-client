import fixture from '../src/map/fixture/campus-fixture.json';
import { validatePackage } from '../src/map/package';
import { intentMessages, intentJsonSchema, parseSearchIntent, intentMaxTokens, intentContextSize } from '../src/nlp/searchIntent';
import { runSearchPipeline } from '../src/nlp/searchPipeline';

const validated = validatePackage(fixture);
if (!validated.ok) throw new Error(validated.errors.join('; '));
const pkg = validated.pkg;
export { intentMessages, intentJsonSchema, intentMaxTokens, intentContextSize };
export function evaluateProductionOutput(text: string, raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch {
    return { schemaPass: false, intent: null, resolution: null, request: null };
  }
  const intent = parseSearchIntent(parsed);
  if (!intent) return { schemaPass: false, intent: null, resolution: null, request: null };
  return { schemaPass: true, ...runSearchPipeline(text, intent, pkg) };
}
