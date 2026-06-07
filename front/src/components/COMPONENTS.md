# Правила создания и стилизации компонентов

## Структура проекта

- **`packages/aramid`** — внутренний дизайн-пакет. Источник истины для токенов и базовых компонентов (Grid, Stack, Text и т.д.)
- **`front/src`** — фронтенд-приложение, потребляет Aramid
- **`front/src/components/ui/`** — UI-компоненты приложения, разбиты по слоям:
  - **`ds/`** — базовые контролы в духе Carbon v11 + Aramid (`Button`, `Input`, `ProgressBar`, `InlineProgressBar`, `Dialog` из `modal-dialog`, `Tile`, …). Импорт: `@/components/ui/ds/...` или barrel `@/components/ui/ds`
  - **`derivations/`** — виджеты, собранные из `ds` (`CopyButton`, `ArrayEditor`)
  - **`external/`** — чужеродные/legacy-виджеты вне DS (`InlineMutationNotification`, `FileContentPreview`)
- Tailwind — только в `external/` и отдельных блоках; в `ds/` не используется

---

## CSS: где и как

- CSS-файлы компонентов живут в **`front/src/design/`** (рядом с `base.css`), не в папке компонента
- Одна тема — один файл: `input.css`, `textarea.css`, `input-dropdown.css` и т.д.
- Компонент импортирует свой CSS через алиас: `import "@/design/component.css"`
- **Никаких Tailwind-классов** в собственных компонентах — только именованные CSS-классы

---

## Именование CSS-классов

- Полные слова, BEM-стиль: `.block`, `.block--modifier`, `.block-element`, `.block-element--modifier`
- Примеры: `.input`, `.input--sm`, `.input-field`, `.input-field--fluid`, `.input-dropdown-list`, `.input-dropdown-item:hover`
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
  fluid?: boolean       // ширина: false = фиксированная (default), true = 100%
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

## JobRunCard

Карточка выбранного прогона на странице «Операции» (`blocks/job-run-card/`).

- Текущий прогресс — **`ProgressBar`** (label этапа, helper с % при `determined`, трек + иконка статуса); история `progress.states` не показывается

---

## ProgressBar

`ProgressBar` / `InlineProgressBar` — индикаторы прогресса в духе Carbon с
дополнительной логикой Aramid: известная часть (`fill`) может сочетаться с
анимированным неизвестным остатком.

- `ProgressBar`: `label`, `helperText?`, `status`, `fill?`, `determinate?`, `compact?`
- `InlineProgressBar`: `ariaLabel?`, `status`, `fill?`, `determinate?`, `compact?`, `variant?`; label не рендерит, helper text не используется
- `status`: `running`, `partial`, `succeed`, `failed`
- `InlineProgressBar.variant`: `short` = `var(--aramid-spacing-11)` (80px), `medium` = `var(--aramid-spacing-13)` (160px, default), `long` = `var(--input-fixed-width)` (320px)
- `fill` — число от `0` до `1`; `null` / `undefined` считаются `0`
- `determinate=true` — обычный статичный прогресс с `aria-valuenow`
- `determinate=false` — остаток от конца `fill` до `100%` анимируется только для `status="running"`
- `status="failed"` всегда визуально заполняет трек красным, даже если фактический `fill` равен `0`; доступное значение процента остаётся фактическим
- `compact=true` — высота трека `var(--aramid-spacing-2)` (4px); обычный режим — `var(--aramid-spacing-3)` (8px)
- Иконка статуса справа от трека берётся через Aramid `IconIndicator`: `running → in-progress`, `partial → caution-minor`, `succeed → succeeded`, `failed → failed`
- `ProgressBar`: `width: 100%`, `max-width: var(--input-fixed-width)`, `min-width: 0`; компонент имеет максимум как у input, но сжимается в узких контейнерах
- `InlineProgressBar`: фиксированная длина по `variant`, без сжатия; внешний label нужно рендерить отдельно рядом с компонентом

---

## Ширина компонентов

- `fluid` — boolean prop, **default `false`** (фиксированная ширина)
- Фиксированная ширина задаётся на контейнере `.input-field` / `.textarea-field` через `--input-fixed-width` (в `design/base.css`); элемент `.input` / `.textarea` тянется на `width: 100%`
- Составные компоненты (dropdown, suggest): `.input-wrap` — `width: 100%` внутри `.input-field`; модификатор `--fluid` только на `.input-field`

---

## Слои (Layer)

Поверхности и поля ввода завязаны на [Carbon Layer](https://react.carbondesignsystem.com/?path=/docs/components-layer--overview) (тема g10).

- **`Layer`** из `@miracle/aramid` — фон панели (`--layer-background`) и уровень в React Context (0…3). Вложенный `Layer` без `level` увеличивает уровень на 1.
- **Поля ввода** (`Input`, `Textarea`, dropdown, suggest) сами вызывают `useLayerTokens()` и задают фон/границу через inline `style` (хелпер `useFieldLayerStyle` в `front/src/lib/use-field-layer-style.ts`). Каскад `--field-background` с предка **не используется**.
- **Диалог** (`ds/modal-dialog`) рендерится через `DialogProvider` / `useDialog` вне дерева страницы; тело — `<Layer level={1}>`.
- Карточки с формами оборачиваются в `<Layer>` (белая поверхность, поля `gray-10`).

Подробнее: [`aramid/docs/LAYER.md`](../../aramid/docs/LAYER.md).

---

## Label

- Все input-компоненты поддерживают `label?: string` через `BaseInputProps`
- Input/Textarea всегда рендерят единый корень `.input-field` / `.textarea-field` (flex-column + gap: label, control, helper)
- Текст лейбла — `<Text.Helper as="span">` из Aramid
