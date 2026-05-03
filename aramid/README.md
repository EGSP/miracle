# Aramid Design System

Внутренняя дизайн-система проекта Miracle. Создана под вдохновением [Carbon Design System](https://carbondesignsystem.com/) от IBM.  
Пакет: `@miracle/aramid` · Часть npm workspace монорепозитория.

---

## Содержание

- [Стек](#стек)
- [Структура пакета](#структура-пакета)
- [Быстрый старт](#быстрый-старт)
- [Токены дизайна](#токены-дизайна)
- [Компоненты](#компоненты)
- [Подключение к frontend](#подключение-к-frontend)
- [Гайдлайн разработки](#гайдлайн-разработки)

---

## Стек

| Инструмент | Роль |
|---|---|
| **Style Dictionary v4** | Парсинг JSON-токенов → генерация CSS custom properties и JS-констант |
| **tsup** | Сборка TypeScript → ESM + CJS с декларациями типов |
| **React** | UI-компоненты (peer dependency) |
| **lucide-react** | Иконки (peer dependency) |
| **zustand** | Управление состоянием в компонентах-контейнерах (peer dependency) |
| **clsx** | Утилита для объединения CSS-классов |
| **CSS Modules** | Изоляция стилей компонентов |

> Tailwind и shadcn/ui в этом пакете не используются.

---

## Структура пакета

```
aramid/
│
├── tokens/                        # Исходные токены (Style Dictionary input)
│   ├── color/
│   │   └── base.json              #   цвета: palette + semantic aliases
│   ├── spacing/
│   │   └── base.json              #   отступы (шаг 2px → 160px)
│   ├── typography/
│   │   └── base.json              #   шрифты, размеры, веса, высота строки
│   ├── breakpoints/
│   │   └── base.json              #   контрольные точки (sm/md/lg/xlg/max)
│   └── grid/
│       └── base.json              #   колонки, отступы, максимальная ширина
│
├── src/
│   ├── index.ts                   # Главный экспорт пакета
│   ├── components/
│   │   ├── index.ts               # Реэкспорт всех компонентов
│   │   └── Grid/                  # Пример компонента
│   │       ├── Grid.tsx
│   │       ├── Column.tsx
│   │       ├── aramid-grid.css
│   │       └── index.ts
│   └── styles/
│       └── base.css               # Базовые стили (reset + глобальные переменные)
│
├── dist/                          # ⚠ Генерируется автоматически, не редактировать
│   ├── index.js                   #   ESM-сборка
│   ├── index.cjs                  #   CJS-сборка
│   ├── index.d.ts                 #   типы TypeScript
│   ├── index.css                  #   стили компонентов (plain CSS, собирается tsup)
│   ├── css/
│   │   └── tokens.css             #   CSS custom properties из токенов
│   └── js/
│       └── tokens.mjs             #   JS-константы из токенов
│
├── package.json
├── tsconfig.json
├── tsup.config.ts                 # Конфиг сборщика JS
├── style-dictionary.config.mjs   # Конфиг Style Dictionary
└── README.md
```

### Куда что класть

| Что добавляешь | Куда |
|---|---|
| Новый цвет, отступ, типографику | `tokens/<категория>/base.json` |
| Новую категорию токенов | `tokens/<новая-категория>/base.json` |
| Новый компонент | `src/components/<ComponentName>/` |
| Глобальные базовые стили (reset, html/body) | `src/styles/base.css` |
| Утилиту или хук | `src/utils/` или `src/hooks/` (создать по аналогии) |

---

## Быстрый старт

```bash
# Из корня монорепозитория
npm install

# Внутри aramid/ — разовая сборка
npm run build --workspace=aramid

# Режим наблюдения (для разработки)
npm run dev --workspace=aramid
```

> `dist/` gitignored. Перед первым запуском фронтенда нужно выполнить `npm run build --workspace=aramid`.

---

## Токены дизайна

Токены хранятся в папке `tokens/` в формате **W3C Design Tokens** (поля `$value`, `$type`, `$description`).  
Style Dictionary читает все `*.json` файлы и генерирует:

- `dist/css/tokens.css` — CSS custom properties с префиксом `--aramid-`
- `dist/js/tokens.mjs` — JS-константы

### Пример токена

```json
{
  "color": {
    "blue": {
      "60": {
        "$value": "#0f62fe",
        "$type": "color",
        "$description": "Primary interactive color"
      }
    }
  }
}
```

→ Генерирует: `--aramid-color-blue-60: #0f62fe`

### Алиасы (ссылки между токенами)

```json
{
  "color": {
    "semantic": {
      "interactive": { "$value": "{color.blue.60}", "$type": "color" }
    }
  }
}
```

→ Генерирует: `--aramid-color-semantic-interactive: var(--aramid-color-blue-60)`

### Пересборка токенов

```bash
npm run build:tokens --workspace=aramid
```

---

## Компоненты

### Структура компонента

```
src/components/ComponentName/
├── ComponentName.tsx      # Реализация
├── aramid-component.css   # префикс `aramid-*`, только var(--aramid-…)
└── index.ts               # Реэкспорт: export { ComponentName } from './ComponentName'
```

После создания добавить реэкспорт в `src/components/index.ts`:

```ts
export * from './ComponentName'
```

### Grid / Column — пример использования

```tsx
import { Grid, Column } from '@miracle/aramid'

<Grid>
  <Column sm={4} md={4} lg={8}>Левая колонка</Column>
  <Column sm={4} md={4} lg={8}>Правая колонка</Column>
</Grid>
```

---

## Подключение к frontend

1. Ссылка на пакет уже настроена через npm workspaces — дополнительных `npm link` не нужно.

2. В `front/package.json` добавить зависимость:

```json
{
  "dependencies": {
    "@miracle/aramid": "*"
  }
}
```

3. Импортировать стили в `front/src/main.tsx` (один раз):

```ts
import '@miracle/aramid/css/tokens'   // CSS custom properties
import '@miracle/aramid/styles'        // стили компонентов
```

4. Импортировать и использовать компоненты:

```ts
import { Grid, Column } from '@miracle/aramid'
```

---

## Гайдлайн разработки

### Токены

#### Делать

- **Называй токены по семантике**, а не по внешнему виду.  
  Хорошо: `color.semantic.interactive` · Плохо: `color.blue-button`
- **Используй алиасы** — semantic-токены должны ссылаться на primitive-токены, а не дублировать их значения.
- **Документируй каждый токен** через поле `$description`.
- **Добавляй новую категорию** в отдельный файл (`tokens/<category>/base.json`).
- **Соблюдай шкалу** — отступы должны браться из `spacing.*`, размеры шрифта из `font.size.*` и т.д.
- **Пересобирай после изменений**: `npm run build:tokens --workspace=aramid`.

#### Не делать

- Не задавай значения напрямую в CSS компонентов — всегда используй CSS custom properties (`var(--aramid-...)`).
- Не создавай токены ради одного компонента. Если значение не переиспользуется — это не токен.
- Не обходи Style Dictionary, добавляя переменные вручную в `dist/css/tokens.css` — файл перезаписывается при сборке.
- Не смешивай primitive и semantic значения в одной группе.

---

### Компоненты

#### Делать

- **Один компонент — одна директория** со всеми связанными файлами.
- **Всегда задавай `displayName`** для облегчения отладки в React DevTools:  
  `Button.displayName = 'Button'`
- **Экспортируй типы пропсов** отдельно (`export type ButtonProps`).
- **Стили компонента** — отдельный `.css` с классами с префиксом `aramid-`, `import './…css'` в `.tsx` и строковые имена классов в `clsx` (или общий `layoutClassNames.ts`). **CSS Modules не используются**: при сборке tsup маппинг `.module.css` в JS не подставляется, стили не попадали бы на DOM.
- **Используй CSS custom properties** из токенов внутри стилей компонента:  
  `color: var(--aramid-color-semantic-interactive);`
- **Помечай peer-зависимости** (React, lucide-react, zustand) как `external` — не бандли их в пакет.
- **Пиши компоненты без состояния** там, где это возможно. Zustand — только для компонентов-контейнеров.
- **Поддерживай HTML-атрибуты** через spread (`...rest`), расширяя стандартные интерфейсы (`extends React.HTMLAttributes<HTMLDivElement>`).
- **Следуй принципу единственной ответственности** — компонент делает одно дело.

#### Не делать

- Не импортируй Tailwind-классы, shadcn или любые другие UI-библиотеки в компоненты дизайн-системы.
- Не хардкоди цвета, отступы и размеры — только через CSS custom properties из токенов.
- Не создавай сложную бизнес-логику внутри компонентов. Дизайн-система — это UI-примитивы и паттерны, не бизнес-компоненты.
- Не именуй публичные CSS-классы без префикса (`grid`, `stack`) — только `aramid-*`, чтобы не пересечься с утилитами приложения.
- Не забывай добавлять реэкспорт в `index.ts` после создания нового компонента.

---

### Процесс добавления нового компонента (чеклист)

```
1. [ ] Определить нужные токены — если отсутствуют, добавить в tokens/
2. [ ] Пересобрать токены: npm run build:tokens --workspace=aramid
3. [ ] Создать директорию src/components/<ComponentName>/
4. [ ] Написать ComponentName.tsx (props, displayName, разметка)
5. [ ] Написать `aramid-*.css` (только `var(--aramid-…)`)
6. [ ] Создать index.ts с реэкспортом
7. [ ] Добавить реэкспорт в src/components/index.ts
8. [ ] Собрать пакет: npm run build --workspace=aramid
9. [ ] Проверить импорт из @miracle/aramid во фронтенде
```
