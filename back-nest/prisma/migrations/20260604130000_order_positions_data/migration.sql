-- Новая модель OrderPosition: name + productType (плоско) + data (JSON со всем прочим).
-- Старые структурные requirements (PositionRequirement[]) и плоский designation удаляются;
-- designation переезжает внутрь data и заполняется шагом designation-analyse.

ALTER TABLE "order_positions" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "order_positions" ADD COLUMN "data" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "order_positions" DROP COLUMN "requirements";
ALTER TABLE "order_positions" DROP COLUMN "designation";

-- Снимаем дефолты — в схеме поля без @default.
ALTER TABLE "order_positions" ALTER COLUMN "name" DROP DEFAULT;
ALTER TABLE "order_positions" ALTER COLUMN "data" DROP DEFAULT;
