# Правила создания и стилизации компонентов

## Структура проекта

- **`packages/aramid`** — внутренний дизайн-пакет. Источник истины для токенов и базовых компонентов (Grid, Stack, Text и т.д.)
- **`front/src`** — фронтенд-приложение, потребляет Aramid
- Tailwind и shadcn установлены, но **только для сторонних/стандартных контролов** (base-ui и т.п.). В собственных компонентах не используются

---

## CSS: где и как

- CSS-файлы компонентов живут в **`front/src/design/`** (рядом с `base.css`), не в папке компонента
- Одна тема — один файл: `input.css`, `textarea.css`, `input-dropdown.css` и т.д.
- Компонент импортирует свой CSS через алиас: `import "@/design/component.css"`
- **Никаких Tailwind-классов** в собственных компонентах — только именованные CSS-классы

---

## Именование CSS-классов

- Полные слова, BEM-стиль: `.block`, `.block--modifier`, `.block-element`, `.block-element--modifier`
- Примеры: `.input`, `.input--sm`, `.input--full`, `.input-field`, `.input-dropdown-list`, `.input-dropdown-item:hover`
- Никаких сокращений (не `.inp`, не `.txa`, не `.btn`)

---

## Базовый HTML-элемент

- Компоненты строятся на **нативных HTML-тегах** (`<button>`, `<input>`, `<textarea>`) — не на примитивах BaseUI, Radix, Shadcn
- Тип пропсов: `React.ComponentProps<"button"> & BaseButtonProps`
- Исключение: если сторонний примитив предоставляет нетривиальное поведение (aria-расширяемые попапы, drag-and-drop и т.п.) — допустимо, но стилизация всё равно только через собственные CSS-классы

---

## TypeScript: компонентный контракт

- Для семейства схожих компонентов — **общий интерфейс** в файле-основании (например, `input-variants.ts`)
- Каждый компонент в семействе реализует этот интерфейс (через `extends` или пересечение типов `& BaseXxxProps`)
- Если типы размеров расходятся — `Omit<BaseInputProps, "size"> & { size?: TextareaSize }`

```ts
// Пример структуры базового интерфейса
export interface BaseInputProps {
  size?: InputSize      // общие размеры семейства
  full?: boolean        // ширина: false = фиксированная (default), true = 100%
  disabled?: boolean
  label?: string
}
```

## Состояния: hover / active / disabled

**Hover и active** — всегда с guard `:not(:disabled)`, не через reset в disabled-блоке:

```css
.button--primary:hover:not(:disabled) { background-color: ...; }
.button--primary:active:not(:disabled) { background-color: ...; }
```

**Disabled** задаётся отдельно для каждого варианта (visual treatment различается):

```css
/* Залитые (primary, secondary, danger) */
.button--primary:disabled {
  background-color: var(--aramid-color-gray-30);
  color: var(--aramid-color-gray-50);
}
/* Прозрачные (tertiary, ghost) */
.button--tertiary:disabled {
  border-color: var(--aramid-color-gray-30);
  color: var(--aramid-color-gray-30);
}
/* Базовый cursor — общий */
.button:disabled { cursor: not-allowed; }
```

---

## Состояния: focus-visible

```css
/* Светлый/прозрачный фон (tertiary, ghost) */
.button--ghost:focus-visible {
  outline: 2px solid var(--aramid-color-semantic-interactive);
  outline-offset: 2px;
}

/* Тёмный фон (primary, secondary, danger) — добавляется белое внутреннее кольцо */
.button--primary:focus-visible {
  outline: 2px solid var(--aramid-color-semantic-interactive);
  outline-offset: 2px;
  box-shadow: inset 0 0 0 2px var(--aramid-color-white-0);
}
```

---

## Доступность (a11y)

- **Icon-only элементы**: `label` prop → `aria-label` на нативном теге, никаких `sr-only`-span внутри
- **Иконки**: оборачиваются в `<span aria-hidden="true">`, не читаются screen reader'ом
- **Декоративные SVG**: `aria-hidden="true"` напрямую на svg-теге

---

## Кнопки (Carbon Design System v11)

Дизайн-референс: [carbondesignsystem.com/components/button/usage](https://carbondesignsystem.com/components/button/usage/)

**Анатомия и позиционирование:**
- Лейбл — всегда **слева** (`.button-label`)
- Иконка — всегда **справа, trailing** (`.button-icon`). Leading-icon не используется
- `justify-content: space-between` на контейнере прижимает элементы к краям
- `icon-button` — квадратная кнопка (ширина = высота = `--button-h`), только иконка, лейбл → `aria-label`

**Цветовые роли:**

| Variant | Цвет | Назначение |
|---|---|---|
| `primary` | `--aramid-color-brand` (sand-50) | Главное бренд-действие |
| `secondary` | `--aramid-color-gray-80` | Вторичное нейтральное |
| `tertiary` | border + text `--aramid-color-sand-60` | Outline primary (sand-60 для контраста на белом) |
| `ghost` | text `--aramid-color-semantic-interactive` | Лёгкое системное действие |
| `danger` | `--aramid-color-semantic-danger` | Деструктивное действие |
| `icon-button` | ghost-стиль | Только иконка |

**Фиксированная ширина:**
- `--button-fixed-width: var(--aramid-spacing-13)` (160px) — одна для всех размеров
- Размер (`xs`/`sm`/`md`/`lg`/`xl`) меняет только высоту, padding и шрифт
- `fluid` переопределяет на `width: 100%`

---

## Группировка контролов: `<fieldset>` + `<legend>`

Когда несколько однотипных контролов объединены под одним смыслом (чекбоксы, радио), используется `<fieldset>/<legend>` — не `<div>/<span>`. Screen reader'ы читают имя группы перед каждым контролом внутри.

`<fieldset>` нужно полностью сбрасывать в CSS:

```css
.group {
  margin: 0;
  padding: 0;
  border: none;
  min-inline-size: 0; /* fieldset-specific: без этого ломается flex/grid layout */
}
```

Лейбл группы рендерится через `<Text.Helper as="legend">`.

---

## Кастомный визуальный контрол: скрытый нативный input

Когда нативный элемент нужно визуально заменить (кастомный checkbox, radio, toggle), нативный input прячут через clip, а все стили вешают на видимый сосед:

```html
<!-- нативный input идёт первым — это важно для CSS-сиблинга -->
<input class="native-input" type="checkbox" />
<span class="visual-box" aria-hidden="true"></span>
```

```css
.native-input {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap; border: 0;
  outline: none;
}

/* focus-visible передаётся на видимый сосед через ~ */
.native-input:focus-visible ~ .visual-box {
  outline: 2px solid var(--aramid-color-semantic-interactive);
  outline-offset: 2px;
}
```

Это сохраняет нативную доступность (Tab, Space, submit формы) без JS.

---

## `data-state` / `data-disabled` для нестандартных состояний

Когда состояние нельзя выразить CSS-псевдоклассом, добавляется `data-атрибут` на контейнер:

```tsx
<label data-state="excluded" data-disabled={disabled ? "true" : undefined}>
```

```css
.item[data-state="excluded"] .box { ... }
.item[data-disabled="true"] { cursor: not-allowed; }
```

**`data-disabled` vs `:has(:disabled)`**

`:has(:disabled)` — нативная CSS-альтернатива, не требует JS:

```css
/* Работает, но: */
.item:has(:disabled) { cursor: not-allowed; }
```

Недостатки `:has()` в этом контексте:
- Специфичность выше — тяжелее переопределить
- Читается хуже: неочевидно на что именно проверяется `:has`
- При вложенных контролах (несколько `<input>` внутри) срабатывает на любой disabled-потомок, даже нецелевой
- `data-disabled` явно указан из JS → состояние видно в DevTools на нужном узле

`data-disabled` предпочтительнее, когда контейнер содержит скрытый нативный input (паттерн кастомного контрола).

---

## CVA

- Используется для управления вариантами, **не** для хранения стилей
- Значения вариантов — короткие CSS-классы, не Tailwind-строки

```ts
// Правильно
cva("input", { variants: { size: { sm: "input--sm", md: "", lg: "input--lg" } } })

// Неправильно
cva("h-8 w-full border border-input ...", { variants: { size: { sm: "h-8 px-2.5 ..." } } })
```

---

## Ширина компонентов

- `full` — boolean prop, **default `false`** (фиксированная ширина)
- Фиксированная ширина задаётся через CSS-переменную `--input-fixed-width` (определена в `design/base.css`), не хардкодится в компоненте
- Составные компоненты (dropdown, suggest) управляют шириной через обёртку `.input-wrap` / `.input-wrap--full`, а не через сам элемент

---

## Слои (Layer)

Поверхности и поля ввода завязаны на [Carbon Layer](https://react.carbondesignsystem.com/?path=/docs/components-layer--overview) (тема g10).

- **`Layer`** из `@miracle/aramid` — фон панели (`--layer-background`) и уровень в React Context (0…3). Вложенный `Layer` без `level` увеличивает уровень на 1.
- **Поля ввода** (`Input`, `Textarea`, dropdown, suggest) сами вызывают `useLayerTokens()` и задают фон/границу через inline `style` (хелпер `useFieldLayerStyle` в `front/src/lib/use-field-layer-style.ts`). Каскад `--field-background` с предка **не используется**.
- **Диалог** рендерится в корне документа (`body`) вне дерева страницы — внутри `DialogContent` уже есть `<Layer level={1}>`.
- Карточки с формами оборачиваются в `<Layer>` (белая поверхность, поля `gray-10`).

Подробнее: [`aramid/docs/LAYER.md`](../../aramid/docs/LAYER.md).

---

## DesignationDisplay / DesignationInspector

- **Display** — `DesignationDisplay.tsx`, `design/designation-display.css`: компактная строка, без резолва TC.
- **Inspector** — `DesignationInspector.tsx`, `design/designation-inspector.css`: таблица проблемных слотов; имена из TC по `tcId`; колонка «Позиция» — **1-based** (`#1`, `#2`, …), как подписи слотов в карточке ТУ.
- Логика: `lib/designation-display.ts` (пороги, `buildDesignationDisplayParts`, `buildDesignationInspectorRows`, `designationToneClassName`).
- Подсветка: `warn` — пустое/`"null"` или `confidence < 0.7`; `critical` — значение есть и `confidence < 0.5`. В инспектор попадают пропуски, пустые и critical (не warn 0.5–0.7).

---

## Label

- Все input-компоненты поддерживают `label?: string` через `BaseInputProps`
- При наличии label компонент оборачивается в `.input-field` / `.textarea-field` (flex-column + gap)
- Текст лейбла — `<Text.Helper as="span">` из Aramid
