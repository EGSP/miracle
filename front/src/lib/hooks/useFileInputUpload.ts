/**
 * useFileInputUpload
 *
 * Управляет состоянием файлов и их последовательной загрузкой на сервер.
 * Возвращает пропсы, готовые к передаче в <FileInput>, и функцию upload()
 * для запуска загрузки извне (например, по кнопке).
 *
 * Файлы не загружаются автоматически — только после явного вызова upload().
 *
 * Интегрируется с ближайшим <DirtyGuardProvider> если он есть:
 * регистрируется как участник и сообщает о isDirty — аналогично useField.
 * Без Guard работает автономно.
 *
 * @example
 * const { fileStates, onFilesApplied, onRemove, upload } = useFileInputUpload({ id: 'docs' })
 *
 * <FileInput fileStates={fileStates} onFilesApplied={onFilesApplied} onRemove={onRemove} ...>
 *   <FileInput.Zone />
 *   <FileInput.List />
 * </FileInput>
 * <Button label="Загрузить" onClick={upload} />
 */

import { useEffect, useRef, useState } from "react"

import type { AppliedFile, FileState } from "@/components/ui/file-input"
import { useDirtyGuardContext } from "@/contexts/dirty-state/DirtyGuardContext"
import { getApiErrorMessage } from "@/lib/api"
import { useUploadFileWithProgress } from "@/lib/queries/file.query"

// ─── Опции ───────────────────────────────────────────────────────────────────

interface UseFileInputUploadOptions {
  /**
   * Идентификатор участника в DirtyGuardProvider.
   * Уникален в пределах одного Guard.
   */
  id: string
}

// ─── Хук ─────────────────────────────────────────────────────────────────────

export function useFileInputUpload({ id }: UseFileInputUploadOptions) {
  const guard = useDirtyGuardContext()
  const [fileStates, setFileStates] = useState<FileState[]>([])
  const uploadMutation = useUploadFileWithProgress()

  // Ref — читаем актуальный список в upload() без стейл-замыкания
  const fileStatesRef = useRef(fileStates)
  useEffect(() => {
    fileStatesRef.current = fileStates
  }, [fileStates])

  const isDirty = fileStates.length > 0 && fileStates.some((s) => s.status !== "success")

  // ── Регистрация в DirtyGuard ────────────────────────────────────────────
  useEffect(() => {
    if (!guard) return
    return guard.register(id, {
      commit: () => setFileStates([]),
      reset: () => setFileStates([]),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, guard])

  // ── Синхронизация isDirty с Guard ───────────────────────────────────────
  useEffect(() => {
    if (!guard) return
    if (isDirty) guard.markDirty(id)
    else guard.markClean(id)
  }, [isDirty, id, guard])

  // ── Утилита точечного обновления элемента ───────────────────────────────
  function patchState(stateId: string, patch: Partial<FileState>) {
    setFileStates((prev) => prev.map((s) => (s.id === stateId ? { ...s, ...patch } : s)))
  }

  // ── Загрузка одного файла ───────────────────────────────────────────────
  async function uploadOne(state: FileState) {
    patchState(state.id, { status: "uploading" })
    try {
      const uploaded = await uploadMutation.mutateAsync({
        file: state.file,
        onProgress: (progress) => patchState(state.id, { progress }),
      })
      patchState(state.id, { status: "success", uploadedId: uploaded.id, progress: 100 })
    } catch (e) {
      patchState(state.id, {
        status: "error",
        error: { label: getApiErrorMessage(e) },
      })
    }
  }

  // ── Применить файлы — только добавить в список, без загрузки ───────────
  function handleFilesApplied(applied: AppliedFile[]) {
    const newStates: FileState[] = applied.map(({ file, validationError }) => ({
      id: crypto.randomUUID(),
      file,
      status: validationError ? "error" : "applied",
      error: validationError,
    }))
    setFileStates((prev) => [...prev, ...newStates])
  }

  // ── Запустить загрузку всех applied-файлов ──────────────────────────────
  async function upload() {
    const toUpload = fileStatesRef.current.filter((s) => s.status === "applied")
    for (const state of toUpload) {
      await uploadOne(state)
    }
  }

  function handleRemove(removeId: string) {
    setFileStates((prev) => prev.filter((s) => s.id !== removeId))
  }

  return {
    fileStates,
    onFilesApplied: handleFilesApplied,
    onRemove: handleRemove,
    upload,
    isDirty,
  }
}
