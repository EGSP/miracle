import { Layer, type LayerProps } from "@miracle/aramid"
import type * as React from "react"

import { cn } from "@/lib/utils"

import "@/design/tile.css"

type TileProps<C extends React.ElementType = "div"> = LayerProps<C>

/**
 * Tile — базовый контейнер-поверхность (адаптация Carbon `Tile` v11 под Aramid).
 *
 * Это статичная, **не интерактивная** версия: чистый прямоугольный блок с фоном
 * слоя, который визуально обособляет сгруппированный внутри контент. Кликабельные,
 * выбираемые и раскрывающиеся варианты (ClickableTile / SelectableTile /
 * ExpandableTile) намеренно не реализованы — это отдельные компоненты.
 *
 * ## Механизм слоёв (Layering)
 *
 * Tile рендерится как Aramid `<Layer>`, поэтому ведёт себя ровно как Carbon-плитка:
 * автоматически поднимается на следующий уровень слоя относительно родительского
 * контекста. На фоне страницы (level 0) Tile получает фон `layer-1`, Tile внутри
 * Tile — `layer-2` и т.д. (до 3). Цвет фона приходит из токена
 * `--aramid-layer-N-background` — он не хардкодится.
 *
 * Поскольку Tile задаёт контекст слоя, любые вложенные компоненты, читающие
 * `useLayerTokens` (Input, Textarea, StructuredList…), автоматически берут поля и
 * границы нужного уровня. Уровень можно переопределить пропом `level`.
 *
 * ## Ширина
 *
 * Tile **не задаёт собственную ширину** (`width: 100%`) — её определяет контейнер:
 * колонка `<Grid>/<Column>` и активный режим сетки (wide / narrow / condensed).
 * Не задавайте плитке фиксированную ширину — регулируйте размер числом колонок.
 *
 * ## Полиморфизм
 *
 * По умолчанию рендерится `<div>`. Через `as` можно сменить тег (например,
 * `as="section"` / `as="article"`) — пропсы выбранного элемента типизируются.
 *
 * @example
 * <Grid>
 *   <Column sm={4} md={4} lg={8}>
 *     <Tile>
 *       <Text.Heading>Заголовок</Text.Heading>
 *       <p>Содержимое плитки.</p>
 *     </Tile>
 *   </Column>
 * </Grid>
 *
 * @example
 * // Семантический тег + явный уровень слоя
 * <Tile as="section" level={2}>…</Tile>
 */
function Tile<C extends React.ElementType = "div">({
  className,
  children,
  ...props
}: TileProps<C>) {
  return (
    <Layer data-slot="tile" className={cn("tile", className)} {...(props as LayerProps<C>)}>
      {children}
    </Layer>
  )
}

export type { TileProps }
export { Tile }
