import { translate, type Language } from '../i18n/translations';
import { localizedEntityName, localizedMapName } from '../map/names-i18n';
import type { MapPackage } from '../map/package';

export type QrMessage = { kind: 'success'; label: string } | { kind: 'invalid' | 'missing' | 'error' };

/** Keep the outcome structured so it can be re-rendered in a different language. */
export function localizedQrMessage(message: QrMessage, language: Language, pkg: Pick<MapPackage, 'places' | 'buildings'> | null): string {
  if (message.kind !== 'success') {
    return translate(language, message.kind === 'invalid' ? 'qrInvalid' : message.kind === 'missing' ? 'qrMissing' : 'qrError');
  }
  // QR node labels may be arbitrary administrator-entered names. Translate only
  // an exact known map name; otherwise preserve the full original label.
  const item = pkg?.places.find((p) => p.name === message.label) ?? pkg?.buildings.find((b) => b.name === message.label);
  const label = item ? localizedEntityName(item, language) : localizedMapName(message.label, language);
  return translate(language, 'qrSuccess', { label });
}
