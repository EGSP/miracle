# TC & Designation — Обзор плана

**Цель:** реализовать пайплайн определения Условного обозначения продукции из заявки клиента по Техническому условию (TC).

---

## Файлы плана

| # | Файл | Содержание |
|---|------|-----------|
| 1 | [01-types.md](./01-types.md) | Новые типы, изменения в существующих, новые коллекции БД |
| 2 | [02-backend-logic.md](./02-backend-logic.md) | Сервисы, роутеры, воркеры, промпты LLM |
| 3 | [03-ui.md](./03-ui.md) | Интерфейс управления справочниками и просмотра результатов |

---

## Высокоуровневый поток

```
[Справочники — делается один раз]

1. Человек создаёт ProductType (name, synonyms)
2. Человек создаёт TechnicalCondition — загружает PDF ТУ (`settings.isTechnicalCondition = true`)
3. `filesContentService.extract` по настройке файла запускает LlmVisionTcWorker →
   заполняет FileContent структурированным markdown-текстом ТУ
4. Человек в UI проверяет текст, формирует TechnicalConditionRule[], привязывает их к DesignationSlot[]
5. Человек настраивает DisplayTemplate (полное / краткое обозначение)

[Обработка заявки — при каждом заказе]

6. Заявка загружается, OCR/LLM Vision извлекает текст
7. OrderDetailsWorker определяет productCategory + requirements[]
8. Система матчит productCategory → ProductType (по synonyms)
9. DesignationWorker читает правила из DesignationSlot.ruleIds →
   вызывает Yandex LLM async → возвращает DesignationValue[]
10. Order.details.designation.ai заполнен
11. UI показывает обозначение через DisplayTemplate
12. Конструктор проверяет, правит через designation.human при необходимости
```

---

## Зависимости между задачами

```
01-types     →  02-backend-logic  →  03-ui
(типы)          (сервисы/воркеры)    (компоненты)
```

Типы реализуются первыми — всё остальное зависит от них.

---

→ Следующий файл: [01-types.md](./01-types.md)
