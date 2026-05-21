# Layer

Компонент поверхности слоя в духе [Carbon Layer](https://react.carbondesignsystem.com/?path=/docs/components-layer--overview) для темы **Gray 10** (светлая).

## Разделение ответственности

| Задача | Кто |
|--------|-----|
| Уровень слоя (0…3) | `Layer` + `useLayer()` |
| Фон панели / карточки | `Layer` → `--layer-background` |
| Фон поля, граница поля | Потребитель → `useLayerTokens()` |

`Layer` **не** задаёт токены полей. `Input`, `Textarea` и списки сами вызывают `useLayerTokens()` и применяют `fieldBackground`, `borderStrong` через `style`.

## Уровни (g10)

| Уровень | Фон поверхности | Фон поля |
|---------|-----------------|----------|
| 0 | gray-10 | white |
| 1 | white | gray-10 |
| 2 | gray-10 | white |
| 3 | white | gray-10 |

Токены в CSS: `--aramid-layer-N-background`, `--aramid-layer-N-field`, `--aramid-layer-N-border-strong`.

## Использование

```tsx
import { Layer, useLayerTokens } from '@miracle/aramid'

// Страница (уровень 0 — контекст по умолчанию, Layer не обязателен)
<Input />

// Белая карточка (уровень 1)
<Layer>
  <Input />
</Layer>

// Явный уровень
<Layer level={1}>
  ...
</Layer>
```

Вложенный `Layer` без `level` увеличивает уровень: родитель 1 → ребёнок 2.

## Поля ввода

```tsx
import { useLayerTokens } from '@miracle/aramid'

function MyField(props) {
  const { fieldBackground, borderStrong } = useLayerTokens()
  return (
    <input
      style={{
        backgroundColor: fieldBackground,
        borderBottomColor: borderStrong,
      }}
      {...props}
    />
  )
}
```

## Панели списков (dropdown / suggest)

Фон выпадающего списка — поверхность **следующего** слоя:

```tsx
import { useNextLayerTokens } from '@miracle/aramid'

const { layerBackground } = useNextLayerTokens()
```

## Диалог, вынесенный в корень документа

`DialogContent` часто рендерится в `document.body` вне дерева страницы — React Context `Layer` со страницы до полей не доходит. Оберните содержимое диалога в `<Layer level={1}>` (или нужный уровень) **внутри** разметки диалога.

## API

- **`Layer`** — `as`, `level?`, `className`, `style`, `children`
- **`useLayer()`** → `{ level }`
- **`useLayerTokens()`** → `{ level, layerBackground, fieldBackground, borderStrong }`
- **`getLayerTokens(level)`** — без React, для утилит
- **`useNextLayerTokens()`** / **`getNextLayerTokens(level)`** — токены следующего слоя
