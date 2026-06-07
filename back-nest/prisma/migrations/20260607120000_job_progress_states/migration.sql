-- Legacy progress: { "pct": 0..100, "label"?: string }
-- New progress: { "states": [{ "percentNormalized": 0..1, "label"?, "createdAt": epoch_ms }] }

UPDATE "job_runs"
SET "progress" = jsonb_build_object(
    'states',
    jsonb_build_array(
        jsonb_strip_nulls(
            jsonb_build_object(
                'percentNormalized',
                CASE
                    WHEN COALESCE(("progress"->>'pct')::numeric, 0) > 1
                        THEN ("progress"->>'pct')::numeric / 100.0
                    ELSE COALESCE(("progress"->>'pct')::numeric, 0)
                END,
                'label', "progress"->'label',
                'createdAt', (extract(epoch from "updatedAt") * 1000)::bigint
            )
        )
    )
)
WHERE "progress" IS NOT NULL
  AND "progress" ? 'pct'
  AND NOT ("progress" ? 'states');
