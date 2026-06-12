-- PrepareStatus: succeeded → succeed (выравнивание с JobStatus)
ALTER TYPE "public"."PrepareStatus" RENAME VALUE 'succeeded' TO 'succeed';
