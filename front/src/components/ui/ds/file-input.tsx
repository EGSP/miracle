import { IconIndicator, Text } from "@miracle/aramid"
import { CircleCheck, X } from "lucide-react"
import { createContext, useContext, useRef, useState } from "react"
import type { ReactNode } from "react"

import { Button } from "./button"
import type { ButtonSize, ButtonVariant } from "./button-variants"
import { cn } from "@/lib/utils"

import "@/design/file-input.css"

// ─── Types ────────────────────────────────────────────────────────────────────

export type FileUploadStatus = "applied" | "uploading" | "success" | "error"

export interface FileInputError {
  label: string
  description?: string
}

export interface FileState {
  /** Стабильный ключ — не полагаемся на file.name (могут быть дубли). */
  id: string
  file: File
  status: FileUploadStatus
  /** 0–100. Актуально при status === "uploading". */
  progress?: number
  /** Ошибка загрузки или валидации. Актуально при status === "error". */
  error?: FileInputError
  /** id файла на сервере после успешной загрузки. */
  uploadedId?: string
}

interface AppliedFile {
  file: File
  /** Заполняется компонентом при нарушении ограничений size / extension. */
  validationError?: FileInputError & { type: "size" | "extension" }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface FileInputContextValue {
  variant: "button" | "drop-zone"
  multiple: boolean
  disabled: boolean
  /** Строка для атрибута accept: ".pdf,.docx" */
  accept: string
  maxSize?: number
  fileStates: FileState[]
  /** @see FileInputProps.onFilesApplied */
  onFilesApplied: (files: AppliedFile[]) => void
  onRemove: (id: string) => void
  buttonSize: ButtonSize
  buttonKind: Exclude<ButtonVariant, "icon-button">
  buttonLabel: string
  title?: string
  description?: string
}

const FileInputContext = createContext<FileInputContextValue | null>(null)

function useFileInputContext(): FileInputContextValue {
  const ctx = useContext(FileInputContext)
  if (!ctx) {
    throw new Error("FileInput.Zone and FileInput.List must be used inside <FileInput>")
  }
  return ctx
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isExtensionAllowed(file: File, accept: string): boolean {
  const allowed = accept.split(",").map((s) => s.trim().toLowerCase())
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase()
  return allowed.includes(ext)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

// ─── Root ─────────────────────────────────────────────────────────────────────

interface FileInputProps {
  variant: "button" | "drop-zone"
  multiple?: boolean
  disabled?: boolean
  /** Разрешённые расширения без точки: ["pdf", "docx"]. */
  extensions?: string[]
  /** Максимальный размер файла в байтах. */
  maxSize?: number

  /** Текст кнопки (только для variant="button"). */
  buttonLabel?: string
  buttonSize?: ButtonSize
  buttonKind?: Exclude<ButtonVariant, "icon-button">

  /** Заголовок зоны (button и drop-zone). */
  title?: string
  /** Вспомогательный текст под заголовком. */
  description?: string

  fileStates: FileState[]
  /**
   * Вызывается только с файлами из текущего выбора (через диалог или drop).
   * Содержит именно новые файлы — не весь список. Родитель сам решает,
   * как добавить их в `fileStates` (например, через `setState(prev => [...prev, ...newStates])`).
   */
  onFilesApplied: (files: AppliedFile[]) => void
  onRemove: (id: string) => void

  /** Растянуть на всю ширину родителя. По умолчанию фиксированная ширина как у инпутов. */
  fluid?: boolean
  children: ReactNode
  className?: string
}

function FileInputRoot({
  variant,
  multiple = false,
  disabled = false,
  extensions,
  maxSize,
  buttonLabel = "Выбрать файл",
  buttonSize = "md",
  buttonKind = "primary",
  title,
  description,
  fileStates,
  onFilesApplied,
  onRemove,
  fluid = false,
  children,
  className,
}: FileInputProps) {
  const accept = extensions?.map((ext) => `.${ext}`).join(",") ?? ""

  return (
    <FileInputContext.Provider
      value={{
        variant,
        multiple,
        disabled,
        accept,
        maxSize,
        fileStates,
        onFilesApplied,
        onRemove,
        buttonSize,
        buttonKind,
        buttonLabel,
        title,
        description,
      }}
    >
      <div className={cn("file-input", fluid && "file-input--fluid", className)}>{children}</div>
    </FileInputContext.Provider>
  )
}

// ─── Zone ─────────────────────────────────────────────────────────────────────

interface FileInputZoneProps {
  className?: string
}

function FileInputZone({ className }: FileInputZoneProps) {
  const {
    variant,
    multiple,
    disabled,
    accept,
    maxSize,
    onFilesApplied,
    buttonLabel,
    buttonSize,
    buttonKind,
    title,
    description,
  } = useFileInputContext()

  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  function validateAndEmit(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    const selected: AppliedFile[] = files.map((file) => {
      if (accept && !isExtensionAllowed(file, accept)) {
        return {
          file,
          validationError: {
            type: "extension" as const,
            label: "Недопустимый формат файла",
            description: `Разрешены: ${accept}`,
          },
        }
      }
      if (maxSize !== undefined && file.size > maxSize) {
        return {
          file,
          validationError: {
            type: "size" as const,
            label: "Файл слишком большой",
            description: `Максимальный размер: ${formatBytes(maxSize)}`,
          },
        }
      }
      return { file }
    })
    onFilesApplied(selected)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) validateAndEmit(e.target.files)
    // сброс value позволяет выбрать тот же файл повторно
    e.target.value = ""
  }

  function openPicker() {
    if (!disabled) inputRef.current?.click()
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    if (!disabled) setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    if (disabled || !e.dataTransfer.files.length) return
    validateAndEmit(e.dataTransfer.files)
  }

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept={accept || undefined}
      multiple={multiple}
      disabled={disabled}
      onChange={handleInputChange}
      className="file-input-zone__hidden-input"
      aria-hidden
      tabIndex={-1}
    />
  )

  return (
    <div className={cn("file-input-zone", className)}>
      {(title || description) && (
        <div className="file-input-zone__header">
          {title && (
            <Text.Helper as="span" className="file-input-zone__title">
              {title}
            </Text.Helper>
          )}
          {description && (
            <Text.Helper as="span" className="file-input-zone__description">
              {description}
            </Text.Helper>
          )}
        </div>
      )}

      {variant === "button" ? (
        <>
          {hiddenInput}
          <Button
            variant={buttonKind}
            size={buttonSize}
            label={buttonLabel}
            disabled={disabled}
            onClick={openPicker}
            type="button"
          />
        </>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          className={cn(
            "file-input-zone__drop-area",
            isDragOver && "file-input-zone__drop-area--drag-over",
            disabled && "file-input-zone__drop-area--disabled",
          )}
          onClick={openPicker}
          onKeyDown={(e) => e.key === "Enter" && openPicker()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {hiddenInput}
          <Text.Helper as="span" className="file-input-zone__drop-label">
            {isDragOver ? "Отпустите файлы" : "Перетащите или выберите файлы"}
          </Text.Helper>
        </div>
      )}
    </div>
  )
}

// ─── List ─────────────────────────────────────────────────────────────────────

interface FileInputListProps {
  className?: string
}

function FileInputList({ className }: FileInputListProps) {
  const { fileStates, onRemove } = useFileInputContext()

  if (fileStates.length === 0) return null

  return (
    <ul className={cn("file-input-list", className)}>
      {fileStates.map((state) => (
        <FileInputItem key={state.id} state={state} onRemove={onRemove} />
      ))}
    </ul>
  )
}

// ─── Item (внутренний) ────────────────────────────────────────────────────────

interface FileInputItemProps {
  state: FileState
  onRemove: (id: string) => void
}

function FileInputItem({ state, onRemove }: FileInputItemProps) {
  const { id, file, status, error } = state
  const hasError = status === "error"
  const canRemove = status === "applied" || status === "error"

  return (
    <li className={cn("file-input-item", hasError && "file-input-item--error")}>
      <div className="file-input-item__content">
        <span className="file-input-item__name" title={file.name}>
          {file.name}
        </span>

        <div className="file-input-item__actions">
          {status === "uploading" && <IconIndicator kind="in-progress" size={16} />}
          {hasError && <IconIndicator kind="failed" size={16} />}

          {status === "success" && (
            <Button
              variant="icon-button"
              size="sm"
              label={`Убрать ${file.name}`}
              icon={<CircleCheck />}
              type="button"
              className="file-input-item__action-btn file-input-item__action-btn--success"
              onClick={() => onRemove(id)}
            />
          )}
          {canRemove && (
            <Button
              variant="icon-button"
              size="sm"
              label={`Убрать ${file.name}`}
              icon={<X />}
              type="button"
              className="file-input-item__action-btn"
              onClick={() => onRemove(id)}
            />
          )}
        </div>
      </div>

      {hasError && error && (
        <div className="file-input-item__error-panel">
          <Text.Helper as="p" className="file-input-item__error-label">
            {error.label}
          </Text.Helper>
          {error.description && (
            <Text.Helper as="p" className="file-input-item__error-description">
              {error.description}
            </Text.Helper>
          )}
        </div>
      )}
    </li>
  )
}

// ─── Compound export ──────────────────────────────────────────────────────────

const FileInput = Object.assign(FileInputRoot, {
  Zone: FileInputZone,
  List: FileInputList,
})

export { FileInput }
export type { FileInputProps, FileInputZoneProps, FileInputListProps, AppliedFile }
