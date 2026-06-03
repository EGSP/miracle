import { IconIndicator, Stack, Text } from "@miracle/aramid"
import type { ExtractionStatus, FileContent, FileWithMeta, Stored } from "@miracle/types"
import { FileDomain, getFileDomain, validatePageRanges } from "@miracle/types"
import { AlertCircle, Eye, ScanText, Trash2, Upload } from "lucide-react"
import { createContext, type PropsWithChildren, useContext, useState } from "react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Checkbox } from "@/components/ui/checkbox"
import { FileInput, type AppliedFile, type FileState } from "@/components/ui/file-input"
import { InlineMutationNotification } from "@/components/ui/inline-mutation-notification"
import { Input } from "@/components/ui/input"
import { Dialog } from "@/components/ui/modal-dialog"
import { Tile } from "@/components/ui/tile"
import {
  DirtyGuardProvider,
  useGuardActions,
  useGuardState,
} from "@/contexts/dirty-state/DirtyGuardContext"
import { useField } from "@/contexts/dirty-state/useField"
import { type DraftAPI, useContribute, useDraft } from "@/contexts/draft-api/DraftContext"
import { getApiErrorMessage } from "@/lib/api"
import { useDialog } from "@/lib/hooks/use-dialog"
import { usePatchFile, useRestoreFile } from "@/lib/queries/file.query"
import {
  useExtractFileContent,
  useGetFileContent,
  useGetFileContentTokens,
  useSoftDeleteFileContent,
} from "@/lib/queries/file-content.query"

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getExtractionIndicator(latestContent: Stored<FileContent> | undefined): {
  kind: "succeeded" | "failed" | "unknown"
  label: string
} {
  const status = latestContent?.meta?.extractionStatus as ExtractionStatus | undefined
  if (status === "completed") return { kind: "succeeded", label: "Контент прочитан" }
  if (status === "failed") return { kind: "failed", label: "Чтение завершилось ошибкой" }
  if (status === "started") return { kind: "unknown", label: "Чтение в процессе" }
  return { kind: "unknown", label: "Контент еще не извлекался" }
}

// ─── Контекст ────────────────────────────────────────────────────────────────

type FileCardContextType = {
  file: FileWithMeta
  isSaving: boolean
  saveError: Error | null
  save: () => void
  // Пробрасывается из DraftAPI — удобно читать напрямую в дочерних компонентах
  // без дополнительного деструктурирования draft
} & DraftAPI<FileWithMeta>

const FileCardContext = createContext<FileCardContextType | null>(null)

function useFileCardContext(): FileCardContextType {
  const ctx = useContext(FileCardContext)
  if (!ctx) throw new Error("useFileCardContext must be used within FileCardProvider")
  return ctx
}

// ─── Provider ────────────────────────────────────────────────────────────────

function FileCardProvider({
  file,
  readonly = false,
  children,
}: PropsWithChildren<{ file: FileWithMeta; readonly?: boolean }>) {
  const draft = useDraft<FileWithMeta>({ readonly })
  const { commitAll } = useGuardActions()
  const patchMutation = usePatchFile(file.id)

  const save = () => {
    const result = draft.collect({ ...file })
    if (!result) return
    patchMutation.mutate({ settings: result.settings }, { onSuccess: () => commitAll() })
  }

  return (
    <FileCardContext.Provider
      value={{
        file,
        isSaving: patchMutation.isPending,
        saveError: patchMutation.error ?? null,
        save,
        ...draft,
      }}
    >
      {children}
    </FileCardContext.Provider>
  )
}

// ─── FileCardSettings ─────────────────────────────────────────────────────────

function FileCardSettings() {
  const { file, contribute, isSaving, readonly } = useFileCardContext()
  const complexLayout = useField<boolean>("complexLayout", file.settings?.complexLayout ?? false)
  const isTechnicalCondition = useField<boolean>(
    "isTechnicalCondition",
    file.settings?.isTechnicalCondition ?? false,
  )
  const usedPages = useField<string>("usedPages", file.settings?.usedPages ?? "")

  const isPdf = file.extension.toLowerCase() === "pdf"
  const usedPagesSpec = usedPages.value.trim()
  const usedPagesValidation = usedPagesSpec ? validatePageRanges(usedPagesSpec) : null
  const usedPagesError =
    usedPagesValidation && !usedPagesValidation.ok ? usedPagesValidation.message : null

  useContribute(contribute, "settings", (draft) => ({
    ...draft,
    settings: {
      ...draft.settings,
      complexLayout: complexLayout.value,
      isTechnicalCondition: isTechnicalCondition.value,
      ...(isPdf &&
        !usedPagesError && {
          usedPages: usedPagesSpec || undefined,
        }),
    },
  }))

  return (
    <>
      <Checkbox.Group label="Настройки" direction="vertical">
        <Checkbox.Item
          label="Сложная структура (LLM вместо OCR)"
          checked={complexLayout.value}
          disabled={isSaving || readonly}
          onChange={complexLayout.onChange}
        />
        <Checkbox.Item
          label="Технические условия"
          checked={isTechnicalCondition.value}
          disabled={isSaving || readonly}
          onChange={isTechnicalCondition.onChange}
        />
      </Checkbox.Group>
      {isPdf && (
        <div className="checkbox-field">
          <Input
            label="Страницы для распознавания"
            placeholder="например: 1-3, 5, 6-9"
            value={usedPages.value}
            disabled={isSaving || readonly}
            onChange={usedPages.onInputChange}
          />
          {usedPagesError && (
            <p className="checkbox-message checkbox-message--error">
              <span aria-hidden="true">
                <AlertCircle />
              </span>
              {usedPagesError}
            </p>
          )}
        </div>
      )}
    </>
  )
}

// ─── FileCardBody ─────────────────────────────────────────────────────────────

function FileCardBody() {
  const { file, isSaving, save, saveError, readonly } = useFileCardContext()
  const { isDirtyAnywhere } = useGuardState()

  const {
    data: contentList,
    isLoading,
    isError: isGetContentError,
    error: getContentError,
  } = useGetFileContent(file.id, true)
  const {
    data: tokensData,
    isLoading: isTokensLoading,
    isError: isTokensError,
    error: tokensError,
  } = useGetFileContentTokens(file.id, contentList?.[0]?.id)

  const extractMutation = useExtractFileContent(file.id)
  const softDeleteMutation = useSoftDeleteFileContent(file.id)
  const restoreMutation = useRestoreFile(file.id)
  const [restoreFileStates, setRestoreFileStates] = useState<FileState[]>([])
  const restoreFile = restoreFileStates.find((s) => s.status === "applied")?.file ?? null
  const { open } = useDialog()

  const isVisual = getFileDomain(file.extension) === FileDomain.VISUAL
  const latestContent = contentList?.[0]
  const status = latestContent?.meta?.extractionStatus as ExtractionStatus | undefined
  const indicator = getExtractionIndicator(latestContent)
  const isFileAvailable = file.meta?.available !== false

  const canScan =
    isFileAvailable &&
    !extractMutation.isPending &&
    !softDeleteMutation.isPending &&
    !isLoading &&
    (!status || status === "completed" || status === "failed")
  const willOverwrite = status === "completed" || status === "failed"
  const hasContent =
    status === "completed" && Boolean(latestContent?.content?.some((item) => Boolean(item.text)))
  const canMarkContentDeleted =
    Boolean(latestContent?.id) &&
    status !== "started" &&
    !softDeleteMutation.isPending &&
    !extractMutation.isPending

  const handleRestoreFilesApplied = (applied: AppliedFile[]) => {
    const first = applied[0]
    if (!first) return
    setRestoreFileStates([{
      id: crypto.randomUUID(),
      file: first.file,
      status: first.validationError ? "error" : "applied",
      error: first.validationError,
    }])
  }

  const handleRestore = () => {
    if (!restoreFile) return
    restoreMutation.mutate(restoreFile, { onSuccess: () => setRestoreFileStates([]) })
  }

  const handleScanClick = () => {
    if (willOverwrite) {
      open(({ close }) => (
        <Dialog
          description="Сканирование"
          title="Запустить сканирование заново?"
          size="sm"
          onClose={close}
          actions={[
            { label: "Отмена", onClick: close, variant: "secondary" },
            {
              label: "Сканировать",
              onClick: () => {
                extractMutation.mutate({ retryIfLastFailed: true })
                close()
              },
            },
          ]}
        />
      ))
    } else {
      extractMutation.mutate({ retryIfLastFailed: false })
    }
  }

  return (
    <Tile>
      <Stack gap={3}>
        <Stack orientation="horizontal" gap={2} className="items-center justify-between">
          <Text.Heading as="h3" variant="compact-01" className="truncate">
            {file.name}
          </Text.Heading>
          <Text.Label as="span">{file.extension.toUpperCase()}</Text.Label>
        </Stack>

        <Stack gap={4} orientation="horizontal">
          <IconIndicator
            kind={file.meta?.available === false ? "failed" : "succeeded"}
            label={file.meta?.available === false ? "Недоступен" : "Доступен"}
            size={16}
          />
          <IconIndicator kind={indicator.kind} label={indicator.label} size={16} />
        </Stack>

        {/* Настройки файла — только для визуальных */}
        {isVisual && (
          <Stack gap={2}>
            <Button
              variant="primary"
              size="xs"
              label={isSaving ? "Сохранение..." : "Сохранить настройки"}
              disabled={!isDirtyAnywhere || isSaving || readonly}
              onClick={save}
            />
            <FileCardSettings />
            {!readonly && (
              <InlineMutationNotification
                mutation={{ isError: !!saveError, isSuccess: false, error: saveError }}
              />
            )}
          </Stack>
        )}

        {!isFileAvailable && (
          <Stack gap={2} className="border border-border bg-muted/20 p-2">
            <Text.Label as="span">Физический файл отсутствует — загрузите его</Text.Label>
            <FileInput
              variant="drop-zone"
              multiple={false}
              extensions={[file.extension]}
              fileStates={restoreFileStates}
              onFilesApplied={handleRestoreFilesApplied}
              onRemove={() => setRestoreFileStates([])}
              disabled={restoreMutation.isPending}
              fluid
            >
              <FileInput.Zone />
              <FileInput.List />
            </FileInput>
            <Button
              variant="tertiary"
              size="sm"
              icon={<Upload />}
              label={restoreMutation.isPending ? "Загрузка..." : "Восстановить файл"}
              disabled={!restoreFile || restoreMutation.isPending}
              onClick={handleRestore}
            />
            <InlineMutationNotification
              mutation={restoreMutation}
              successMessage="Файл успешно восстановлен"
            />
          </Stack>
        )}

        {latestContent?.meta?.extractionFailedMessage && (
          <Text as="p" compact className="text-destructive wrap-anywhere">
            {latestContent.meta.extractionFailedMessage}
          </Text>
        )}

        <ButtonGroup wrap condensed>
          <Button
            variant="secondary"
            size="md"
            label={extractMutation.isPending ? "Сканирование..." : "Сканировать"}
            icon={<ScanText />}
            disabled={!canScan}
            onClick={handleScanClick}
          />
          <Button
            type="button"
            variant="danger"
            size="md"
            icon={<Trash2 />}
            label={softDeleteMutation.isPending ? "Очищение..." : "Очистить скан"}
            disabled={!canMarkContentDeleted}
            onClick={() => {
              if (latestContent?.id) {
                softDeleteMutation.mutate({ contentId: latestContent.id, mark: true })
              }
            }}
          />
          <Button
            type="button"
            variant="tertiary"
            size="md"
            icon={<Eye />}
            label="Увидеть"
            disabled={!hasContent}
            onClick={() =>
              open(({ close }) => (
                <Dialog description="Содержимое файла" title={file.name} size="xl" onClose={close}>
                  <Stack gap={3}>
                    {latestContent?.content?.map((chunk, index) => (
                      <Stack key={`${index}-${chunk.page ?? "no-page"}`} gap={1}>
                        {chunk.page ? (
                          <Text.Label as="span">Часть {chunk.page}</Text.Label>
                        ) : (
                          <Text.Label as="span">Контент</Text.Label>
                        )}
                        <pre className="w-full overflow-x-auto whitespace-pre-wrap wrap-break-word text-xs">
                          {chunk.text ?? ""}
                        </pre>
                      </Stack>
                    ))}
                  </Stack>
                </Dialog>
              ))
            }
          />
        </ButtonGroup>

        <InlineMutationNotification mutation={extractMutation} />
        <InlineMutationNotification mutation={softDeleteMutation} />
        <InlineMutationNotification
          mutation={{ isError: isGetContentError, isSuccess: false, error: getContentError }}
        />
      </Stack>
    </Tile>
  )
}

// ─── Экспорт ─────────────────────────────────────────────────────────────────

type FileCardProps = {
  file: FileWithMeta
  /**
   * Если true — настройки отображаются, но недоступны для редактирования.
   * Кнопка сохранения скрыта.
   * @default false
   */
  readonly?: boolean
}

export function FileCard({ file, readonly = false }: FileCardProps) {
  return (
    <DirtyGuardProvider id="file-settings">
      <FileCardProvider file={file} readonly={readonly}>
        <FileCardBody />
      </FileCardProvider>
    </DirtyGuardProvider>
  )
}
