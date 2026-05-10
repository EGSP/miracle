# Text

Типографика в духе [Carbon — Type sets](https://carbondesignsystem.com/elements/typography/type-sets/) (utility, body, фиксированные заголовки; fluid в Aramid не реализованы). Метрики заданы в `aramid-text.css`; **семейства шрифтов** — единственный центр правды в токенах `--aramid-font-family-sans` и `--aramid-font-family-mono` в собранном `tokens.css`.

Документация к публичному API и комментарии в коде — **на русском** ([CARBON_DESIGN_ADOPTION.md](../../../CARBON_DESIGN_ADOPTION.md), [AGENTS.md](../../../AGENTS.md)).

## Два набора (productive / expressive)

Как в Carbon: суффикс **-01** — продуктивный набор (плотный UI, в Carbon базовая кегль 14px для body), **-02** — экспрессивный (в Carbon база 16px, воздушнее). В компонентах Aramid это флаг **`expressive`**: `false` → -01, `true` → -02.

Общая стратегия смешения наборов: [Carbon — Style strategies](https://carbondesignsystem.com/elements/typography/style-strategies/).

## Назначение каждого компонента (по смыслу Carbon)

### `Text` — тело (`body-compact-*`, `body-*`)

- **Компактный продуктивный (`body-compact-01`).** В Carbon: *«This is for short paragraphs with no more than four lines and is commonly used in components.»* — короткие абзацы **не более четырёх строк**, обычно внутри компонентов.
- **Компактный экспрессивный (`body-compact-02`).** В Carbon: *«This is for short paragraphs with no more than four lines. Use in expressive components, such as button and link.»*
- **Длинный продуктивный (`body-01`).** В Carbon: стиль с более высоким межстрочным интервалом, чем у `body-compact-01`; для **длинных** абзацев в продуктивных макетах, длинного текста в аккордеоне, structured list и т.п.
- **Длинный экспрессивный (`body-02`).** В Carbon: для **длинных** абзацев в экспрессивных макетах (четыре строки и более).

Проп **`compact`**: включите для коротких блоков; выключите для длинного чтения.

### `Text.Heading` — фиксированные заголовки

В Carbon: *«The fixed heading styles are used for product pages where multiple containers are used and space efficiency is key. Fixed means they are not responsive.»* — размер **не** меняется по breakpoint. Уровень задаётся **`variant`** (`compact-01` … `07`); в Carbon для мелких ступеней указаны пары к телу (`heading-compact-01` с `body-compact-01` и т.д.). Семантику страницы задавайте пропом **`as`** (`h1`–`h6`).

### `Text.Label` — подпись (`label-*`)

В Carbon: *«This is a multipurpose type style that can be used for field labels in components, error messages, and captions. It should not be used for body copy.»* — подписи полей, ошибки, подписи-снимки; **не** заменять основной абзацный текст.

### `Text.Helper` — пояснение (`helper-text-*`)

В Carbon: *«This is for explanatory helper text that appears below a field title within a component.»* — пояснение **под заголовком поля** внутри компонента.

### `Text.Legal` — юридический текст (`legal-*`)

В Carbon:

- *«This is for legal copy appearing in product pages.»* — продуктивный вариант (`legal-01`).
- *«This is for legal copy appearing on web pages.»* — экспрессивный вариант (`legal-02`).

### `Text.Code` — код (`code-*`)

В Carbon:

- *«This is for inline code snippets and smaller code elements.»* — продуктивный (`code-01`).
- *«This is for large code snippets and larger code elements.»* — экспрессивный (`code-02`).

Проп **`language`** включает подсветку синтаксиса (highlight.js, тема `ascetic`). Поддерживаемые значения: `json`, `typescript`, `javascript`, `bash`, `xml`, `html`. При использовании `language` `children` должен быть строкой; для блочного кода передавайте `as="pre"`.

```tsx
<Text.Code language="json" as="pre" expressive>{'{ "key": "value" }'}</Text.Code>
```

### `Text.Area` — текстовая область

Прокручиваемый read-only контейнер для отображения текстового содержимого: лог-вьюверы, блоки документа, многострочный вывод. Принимает только строку. **Не является полем ввода.**

- **`variant="md"`** — фиксированная высота 160px (`--aramid-spacing-13`).
- **`variant="lg"`** — фиксированная высота 320px (`--aramid-spacing-13 * 2`).
- **`resizable`** — добавляет ручку resize; заданный `variant` становится минимальной высотой. Пользователь может увеличить область, но не уменьшить ниже начального размера.
- **`expressive`** — переключает типографику: `body-01` (продуктивный, по умолчанию) / `body-02` (экспрессивный).

```tsx
// Фиксированная высота со скроллом
<Text.Area variant="md">{longText}</Text.Area>

// Растягиваемая от lg-высоты
<Text.Area variant="lg" resizable>{documentText}</Text.Area>
```

## Подключение стилей

Импорт пакета `Text` подтягивает `aramid-text.css`. Чтобы сработали `var(--aramid-font-family-*)`, подключите собранные токены (например `@miracle/aramid/css/tokens`) **до** или вместе с приложением, как описано в документации пакета.

## Сводная таблица

| Компонент | Когда использовать (кратко) |
|-----------|----------------------------|
| `Text` | Основной текст; `compact` / `expressive` по длине блока и набору. |
| `Text.Heading` | Иерархия заголовков без fluid; только `variant` + `as`. |
| `Text.Label` | Лейблы, ошибки, captions — не body copy. |
| `Text.Helper` | Текст под заголовком поля. |
| `Text.Legal` | Юридический мелкий текст (продукт vs веб — через `expressive`). |
| `Text.Code` | Инлайн и блоки кода; `language` включает подсветку; крупнее — `expressive`. |
| `Text.Area` | Read-only прокручиваемый блок текста; `variant` — высота; `resizable` — растяжка вверх. |
