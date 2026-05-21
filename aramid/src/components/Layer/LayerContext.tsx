import React from 'react';

import type { LayerLevel } from './layerTokens';

/** Уровень слоя вне `<Layer>` — базовая страница (0). */
export const LAYER_LEVEL_DEFAULT: LayerLevel = 0;

const LayerLevelContext = React.createContext<LayerLevel>(LAYER_LEVEL_DEFAULT);

export { LayerLevelContext };

/**
 * Текущий уровень слоя из ближайшего предка-`Layer`.
 * Вне `Layer` возвращает `0`.
 */
export function useLayer(): { level: LayerLevel } {
  const level = React.useContext(LayerLevelContext);
  return { level };
}
