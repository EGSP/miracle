-- Ручной запрос разрешает LLM Vision для конкретного файла в обход глобального LLM_VISION_ENABLED.
ALTER TABLE "prepared_documents" ADD COLUMN "allowVision" BOOLEAN NOT NULL DEFAULT false;
