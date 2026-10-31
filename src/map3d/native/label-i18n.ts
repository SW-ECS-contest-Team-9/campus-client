import type { Language } from '../../i18n/translations';
import { localizedMapName } from '../../map/names-i18n';

export interface BuildingLabel { original: string; localized: string }

/** Keep a more specific model label (for example Eunjoo 1) than its grouped map entry. */
export function nativeBuildingLabel(modelName: string, mapName: BuildingLabel | undefined, language: Language): string {
  const fromModel = localizedMapName(modelName, language);
  if (!mapName) return fromModel;
  if (modelName !== mapName.original && (language === 'ko' || fromModel !== modelName)) return fromModel;
  return mapName.localized;
}
