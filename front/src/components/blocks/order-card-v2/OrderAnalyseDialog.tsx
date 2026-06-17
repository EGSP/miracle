import { Stack, Text } from "@miracle/aramid"
import type { AnalysisBlocker, AnalysisParamDef, AnalysisVariantInfo } from "@miracle/types"
import { ScanText } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { isJobStatusActive } from "@/components/blocks/job-tree/job-tree.utils"
import { Accordion } from "@/components/ui/ds/accordion"
import { Button } from "@/components/ui/ds/button"
import { Checkbox } from "@/components/ui/ds/checkbox"
import { Input } from "@/components/ui/ds/input"
import { Dialog, type DialogButtonConfig } from "@/components/ui/ds/modal-dialog"
import { InlineMutationNotification } from "@/components/ui/external/inline-mutation-notification"
import { getApiErrorMessage } from "@/lib/api"
import { usePrepareDocument } from "@/lib/queries/document-prepare.query"
import {
  useAnalyseOrder,
  useGetAnalysisParams,
  useGetAnalysisReadiness,
  useGetAnalysisVariants,
  usePollOrderJob,
} from "@/lib/queries/order.query"
import { OrderAnalyseProgress } from "./OrderAnalyseProgress"

type Props = {
  orderId: string
  onClose: () => void
}

const EMPTY_VARIANTS: AnalysisVariantInfo[] = []
const EMPTY_PARAMS: AnalysisParamDef[] = []

function buildDefaults(params: AnalysisParamDef[]): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const param of params) {
    out[param.key] = param.default
  }
  return out
}

/** Блокер запуска: текст для активного прогона; для VISUAL — текст + кнопка ручной подготовки. */
function AnalysisBlockerRow({ blocker }: { blocker: AnalysisBlocker }) {
  if (blocker.kind === "unprepared-visual") {
    return <PrepareVisualBlocker blocker={blocker} />
  }
  return <Text.Helper as="p">{blocker.message}</Text.Helper>
}

function PrepareVisualBlocker({
  blocker,
}: {
  blocker: Extract<AnalysisBlocker, { kind: "unprepared-visual" }>
}) {
  const prepareMutation = usePrepareDocument(blocker.fileId)

  return (
    <Stack gap={1}>
      <Stack orientation="horizontal" gap={3}>
        <Text.Helper as="span">{blocker.message}</Text.Helper>
        <Button
          label={prepareMutation.isPending ? "Подготовка…" : "Подготовить"}
          icon={<ScanText size={16} />}
          variant="secondary"
          size="sm"
          onClick={() => prepareMutation.mutate()}
          disabled={prepareMutation.isPending}
        />
      </Stack>
      <InlineMutationNotification mutation={prepareMutation} />
    </Stack>
  )
}

export function OrderAnalyseDialog({ orderId, onClose }: Props) {
  const { data: run } = usePollOrderJob(orderId)
  const hasActiveRun = run ? isJobStatusActive(run.status) : false

  const variantsQuery = useGetAnalysisVariants(orderId)
  const variants = variantsQuery.data ?? EMPTY_VARIANTS
  const [selectedVariant, setSelectedVariant] = useState<AnalysisVariantInfo | null>(null)

  useEffect(() => {
    setSelectedVariant((current) => {
      if (variants.length === 0) return null
      if (current && variants.some((variant) => variant.id === current.id)) return current
      // По умолчанию выбираем вторую версию алгоритма, если она есть.
      return variants[1] ?? variants[0]
    })
  }, [variants])

  const variantId = selectedVariant?.id
  const paramsQuery = useGetAnalysisParams(orderId, variantId)
  const params = paramsQuery.data ?? EMPTY_PARAMS
  const [paramValues, setParamValues] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setParamValues(buildDefaults(params))
  }, [params])

  const readinessQuery = useGetAnalysisReadiness(orderId, variantId)
  // Активный прогон показываем прогрессом (ниже), а не как блокер-«ошибку» — оставляем только VISUAL.
  const visualBlockers = (readinessQuery.data?.blockers ?? []).filter(
    (blocker): blocker is Extract<AnalysisBlocker, { kind: "unprepared-visual" }> =>
      blocker.kind === "unprepared-visual",
  )
  const canRun = readinessQuery.data?.canRun ?? false

  const analyseMutation = useAnalyseOrder(orderId)

  const handleStart = () => {
    if (!variantId) return
    analyseMutation.mutate({ variantId, params: paramValues })
  }

  const isBusy =
    analyseMutation.isPending ||
    variantsQuery.isPending ||
    paramsQuery.isPending ||
    readinessQuery.isPending

  const helperText = useMemo(() => {
    if (variantsQuery.isPending) return "Загружаем варианты анализа…"
    if (variantsQuery.isError) return getApiErrorMessage(variantsQuery.error)
    if (variants.length === 0) return "Нет доступных вариантов анализа."
    return selectedVariant?.description ?? "Выберите вариант анализа."
  }, [
    variants.length,
    variantsQuery.error,
    variantsQuery.isError,
    variantsQuery.isPending,
    selectedVariant,
  ])

  // Кнопки действий всегда видны; «Запустить» недоступна при активном прогоне или неготовности.
  const actions: DialogButtonConfig[] = [
    { label: "Отмена", onClick: onClose, variant: "secondary" },
    {
      label: analyseMutation.isPending ? "Запуск…" : "Запустить анализ",
      onClick: handleStart,
      disabled: hasActiveRun || !variantId || isBusy || !canRun,
    },
  ]

  return (
    <Dialog
      title={hasActiveRun ? "Анализ заказа" : "Запуск анализа заказа"}
      description={
        hasActiveRun
          ? "Анализ выполняется. Дождитесь завершения — окно можно закрыть, прогресс не прервётся."
          : "Выберите вариант анализа и параметры запуска."
      }
      size="md"
      onClose={onClose}
      actions={actions}
    >
      {hasActiveRun ? (
        <OrderAnalyseProgress orderId={orderId} />
      ) : (
        <Stack gap={4}>
          <Input.Dropdown<AnalysisVariantInfo>
            label="Вариант анализа"
            items={variants}
            value={selectedVariant}
            onChange={setSelectedVariant}
            getItemKey={(variant) => variant.id}
            renderSelectedItem={(variant) => variant?.name ?? "Выберите вариант"}
            renderListItem={(variant) => (
              <Text as="span" compact>
                {variant?.name ?? "Не выбрано"}
              </Text>
            )}
            helperText={helperText}
            disabled={variantsQuery.isPending || variants.length === 0 || analyseMutation.isPending}
            fluid
          >
            <Input.Dropdown.Selected />
            <Input.Dropdown.List emptyText="Нет вариантов анализа" />
          </Input.Dropdown>

          {variantId && params.length > 0 && (
            <Accordion compact>
              <Accordion.Item title="Дополнительные опции анализа">
                <Stack gap={3}>
                  {params.map((param) => (
                    <Stack gap={1} key={param.key}>
                      <Checkbox.Item
                        label={param.label}
                        checked={paramValues[param.key] ?? param.default}
                        onChange={(checked) =>
                          setParamValues((prev) => ({ ...prev, [param.key]: checked }))
                        }
                        disabled={analyseMutation.isPending}
                      />
                      <Text.Helper as="p">{param.description}</Text.Helper>
                    </Stack>
                  ))}
                </Stack>
              </Accordion.Item>
            </Accordion>
          )}

          {visualBlockers.length > 0 && (
            <Stack gap={2}>
              <Text.Label as="span">Перед запуском нужно подготовить файлы:</Text.Label>
              {visualBlockers.map((blocker) => (
                <AnalysisBlockerRow key={blocker.fileId} blocker={blocker} />
              ))}
            </Stack>
          )}

          <InlineMutationNotification mutation={analyseMutation} successMessage="Анализ запущен" />
        </Stack>
      )}
    </Dialog>
  )
}
