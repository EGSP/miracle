-- Новый терминальный статус прогона `partial` (частичный успех веера дочерних джоб).
-- Позицию в enum держим после `succeeded`, чтобы порядок совпадал со схемой.
ALTER TYPE "public"."JobStatus" ADD VALUE 'partial' AFTER 'succeeded';
