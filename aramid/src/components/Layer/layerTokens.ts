import { useLayer } from './LayerContext';

export type LayerLevel = 0 | 1 | 2 | 3;

const MAX_LAYER_LEVEL: LayerLevel = 3;

/** Ограничивает уровень слоя диапазоном 0…3. */
export function clampLayerLevel(level: number): LayerLevel {
  if (level <= 0) return 0;
  if (level >= MAX_LAYER_LEVEL) return MAX_LAYER_LEVEL;
  return level as LayerLevel;
}

export type LayerTokens = {
  layerBackground: string;
  fieldBackground: string;
  borderStrong: string;
};

/**
 * Токены поверхности и поля для уровня слоя (g10, светлая тема).
 * Значения — ссылки на `--aramid-layer-N-*` из `dist/css/tokens.css`.
 */
export function getLayerTokens(level: LayerLevel): LayerTokens {
  return {
    layerBackground: `var(--aramid-layer-${level}-background)`,
    fieldBackground: `var(--aramid-layer-${level}-field)`,
    borderStrong: `var(--aramid-layer-${level}-border-strong)`,
  };
}

/** Токены для текущего уровня из React Context (`useLayer`). */
export function useLayerTokens(): LayerTokens & { level: LayerLevel } {
  const { level } = useLayer();
  return { level, ...getLayerTokens(level) };
}

/**
 * Токены для «следующего» слоя (панель списка поверх текущей поверхности).
 * Уровень 3 не растёт выше — остаётся 3.
 */
export function getNextLayerTokens(level: LayerLevel): LayerTokens {
  return getLayerTokens(clampLayerLevel(level + 1));
}

export function useNextLayerTokens(): LayerTokens & { level: LayerLevel } {
  const { level } = useLayer();
  const nextLevel = clampLayerLevel(level + 1);
  return { level: nextLevel, ...getLayerTokens(nextLevel) };
}
