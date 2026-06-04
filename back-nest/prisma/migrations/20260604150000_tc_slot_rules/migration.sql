-- DropTable
ALTER TABLE "public"."technical_conditions" DROP COLUMN "rules",
DROP COLUMN "designationSlots",
ADD COLUMN "slotRules" JSONB;
