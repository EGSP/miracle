# LibreOffice DOC→DOCX converter

Конвертация legacy `.doc` (Word 97-2003) → `.docx` через готовый образ
[`libreofficedocker/libreoffice-unoserver`](https://github.com/libreofficedocker/libreoffice-unoserver):
unoserver держит LibreOffice запущенным и отдаёт REST API, поэтому собственный код/Dockerfile не нужны.

## Зачем

Kreuzberg извлекает legacy `.doc` некорректно: кириллица декодируется в CJK-символы, текст обрывается,
табличная структура теряется (legacy-экстрактор отдаёт только плоский текст). LibreOffice читает `.doc`
корректно, поэтому back-nest конвертирует `.doc → .docx` перед отправкой в Kreuzberg — дальше работает
полноценный OOXML-парсер (правильный Unicode + структурные таблицы + дедуп ячеек).

## API ([unoserver-rest-api](https://github.com/libreofficedocker/unoserver-rest-api))

`POST :2004/request` — multipart/form-data:

- `file` — исходный документ (`.doc`);
- `convert-to` — целевой формат (`docx`);
- `opts` — необязательные доп. аргументы.

Ответ: бинарь сконвертированного документа.

```bash
curl -s -F "file=@sample.doc" -F "convert-to=docx" \
  http://localhost:2004/request -o sample.docx
```

## Запуск

Поднимается из корневого `docker-compose.yml` (сервис `libreoffice-convert`):

```bash
docker compose up -d libreoffice-convert
```

## Ограничения

- Обрабатывает **один документ за раз**, без балансировки (нам ок — back-nest и так сериализует через
  `DPS_MAX_CONCURRENCY`).
- REST-слой **без аутентификации** — контейнер держим только во внутренней docker-сети, наружу не публикуем.
