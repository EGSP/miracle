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
- Примеры: `.input`, `.input--sm`, `.input--full`, `.input-field`, `.input-dropdown-list`, `.input-dropdown-item--active`
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

## Label

- Все input-компоненты поддерживают `label?: string` через `BaseInputProps`
- При наличии label компонент оборачивается в `.input-field` / `.textarea-field` (flex-column + gap)
- Текст лейбла — `<Text.Helper as="span">` из Aramid
