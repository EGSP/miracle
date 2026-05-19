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
2. Человек создаёт TechnicalCondition — загружает PDF ТУ
3. PDF ТУ уже прошёл OCR/LLM Vision → FileContent
4. TCWorker читает FileContent, вызывает Yandex LLM async →
   разбивает текст на TechnicalConditionRule[]
5. Человек в UI проверяет правила, привязывает их к DesignationSlot[]
6. Человек настраивает DisplayTemplate (полное / краткое обозначение)

[Обработка заявки — при каждом заказе]

7. Заявка загружается, OCR/LLM Vision извлекает текст
8. OrderDetailsWorker определяет productCategory + requirements[]
9. Система матчит productCategory → ProductType (по synonyms)
10. DesignationWorker читает правила из DesignationSlot.ruleIds →
    вызывает Yandex LLM async → возвращает DesignationValue[]
11. Order.details.designation.ai заполнен
12. UI показывает обозначение через DisplayTemplate
13. Конструктор проверяет, правит через designation.human при необходимости
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
