-- percentNormalized: null → inherit 0; add determined: false where percent was null, true otherwise.

UPDATE "job_runs" AS jr
SET "progress" = jsonb_set(
    jr."progress",
    '{states}',
    (
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'percentNormalized',
                    CASE
                        WHEN elem->>'percentNormalized' IS NULL OR elem->>'percentNormalized' = 'null' THEN 0
                        ELSE (elem->>'percentNormalized')::numeric
                    END,
                    'determined',
                    CASE
                        WHEN elem ? 'determined' THEN (elem->>'determined')::boolean
                        WHEN elem->>'percentNormalized' IS NULL OR elem->>'percentNormalized' = 'null' THEN false
                        ELSE true
                    END,
                    'label', elem->>'label',
                    'createdAt', (elem->>'createdAt')::bigint
                )
                ORDER BY ord
            ),
            '[]'::jsonb
        )
        FROM jsonb_array_elements(jr."progress"->'states') WITH ORDINALITY AS t(elem, ord)
    )
)
WHERE jr."progress" IS NOT NULL
  AND jr."progress" ? 'states'
  AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(jr."progress"->'states') AS s(elem)
      WHERE elem->>'percentNormalized' IS NULL
         OR elem->>'percentNormalized' = 'null'
         OR NOT (elem ? 'determined')
  );
