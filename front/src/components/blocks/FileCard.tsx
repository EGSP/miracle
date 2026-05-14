import { createContext, PropsWithChildren, useContext, useState } from "react";
import { IconIndicator, Stack, Text } from "@miracle/aramid";
import type { ExtractionStatus, FileContent, FileModel, FileWithMeta, Stored } from "@miracle/types";
import { Eye, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileDropZone } from "@/components/ui/file-dropzone";
import { getApiErrorMessage } from "@/lib/api";
import { useExtractFileContent, useGetFileContent, useGetFileContentTokens, useSoftDeleteFileContent } from "@/lib/queries/file-content.query";
import { usePatchFile, useRestoreFile } from "@/lib/queries/file.query";
import { Checkbox } from "@/components/ui/checkbox";
import { getFileDomain, FileDomain } from "@miracle/types";
import { DraftAPI, useContribute, useDraft } from "@/contexts/draft-api/DraftContext";
import { useField } from "@/contexts/dirty-state/useField";

type FileCardProps = {
    file: FileWithMeta;
};

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtractionIndicator(
    latestContent: Stored<FileContent> | undefined
): { kind: "succeeded" | "failed" | "unknown"; label: string } {
    const status = latestContent?.meta?.extractionStatus as ExtractionStatus | undefined;

    if (status === "completed") {
        return { kind: "succeeded", label: "Контент прочитан" };
    }
    if (status === "failed") {
        return { kind: "failed", label: "Чтение завершилось ошибкой" };
    }
    if (status === "started") {
        return { kind: "unknown", label: "Чтение в процессе" };
    }
    return { kind: "unknown", label: "Контент еще не извлекался" };
}

type FileCardContextType = {
    file: FileWithMeta;

    isMutating: boolean;
    error?: string;
    setMutation: (isMutating: boolean, error?: string) => void;

} & DraftAPI<FileWithMeta>;
const FileCardContext = createContext<FileCardContextType | null>(null);

function FileCardProvider({ file, children }: PropsWithChildren<FileCardContextType>) {
    const draft = useDraft<FileWithMeta>();
    const [isMutating, setIsMutating] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const setMutation = (isMutating: boolean, error?: string) => {
        setIsMutating(isMutating);
        setError(error);
    };
    return (
        <FileCardContext.Provider value={{ file, isMutating, error, setMutation, ...draft }}>
            {children}
        </FileCardContext.Provider>
    );
}
function useFileCardContext() {
    const context = useContext(FileCardContext);
    if (!context) {
        throw new Error("useFileCardContext must be used within a FileCardProvider");
    }
    return context;
}

function FileCardSettings() {
    const { file, contribute, isMutating, error } = useFileCardContext();

    const complexLayout = useField<boolean>("complexLayout", file.settings?.complexLayout ?? false);

    useContribute(contribute, "settings", (draft) => {
        let settings = draft.settings ?? {};
        settings.complexLayout = complexLayout.value;
        return { ...draft, settings };
    });

    return (
        <label className="inline-flex items-center gap-2">
            <Checkbox
                checked={complexLayout.value}
                disabled={isMutating}
                onCheckedChange={complexLayout.onChange}
            />
            <Text.Label as="span">Сложная структура (LLM вместо OCR)</Text.Label>
        </label>
    );
}

export function FileCard({ file }: FileCardProps) {
    const { data: contentList, isLoading, isError: isGetContentError, error: getContentError } = useGetFileContent(file.id, true);
    const { data: tokensData, isLoading: isTokensLoading, isError: isTokensError, error: tokensError } = useGetFileContentTokens(
        file.id,
        contentList?.[0]?.id,
    );
    const extractMutation = useExtractFileContent(file.id);
    const softDeleteMutation = useSoftDeleteFileContent(file.id);
    const restoreMutation = useRestoreFile(file.id);
    const patchMutation = usePatchFile(file.id);
    const [restoreFile, setRestoreFile] = useState<File | null>(null);
    const isVisual = getFileDomain(file.extension) === FileDomain.VISUAL;

    const latestContent = contentList?.[0];
    const status = latestContent?.meta?.extractionStatus as ExtractionStatus | undefined;
    const indicator = getExtractionIndicator(latestContent);
    const isFileAvailable = file.meta?.available !== false;

    const handleRestore = () => {
        if (!restoreFile) return;
        restoreMutation.mutate(restoreFile, {
            onSuccess: () => setRestoreFile(null),
        });
    };

    const canRead =
        isFileAvailable
        && !extractMutation.isPending
        && !softDeleteMutation.isPending
        && !isLoading
        && !status;
    const canReread =
        isFileAvailable
        && !extractMutation.isPending
        && !softDeleteMutation.isPending
        && !isLoading
        && (status === "completed" || status === "failed");
    const hasContent = status === "completed" && Boolean(latestContent?.content?.some((item) => Boolean(item.text)));
    /** Пометка доступна для любой записи контента, кроме ещё идущего извлечения (`started`). */
    const canMarkContentDeleted =
        Boolean(latestContent?.id)
        && status !== "started"
        && !softDeleteMutation.isPending
        && !extractMutation.isPending;

    const handleRead = () => {
        if (!canRead) return;
        extractMutation.mutate();
    };

    const handleReread = () => {
        if (!canReread) return;
        extractMutation.mutate();
    };

    const handleMarkContentDeleted = () => {
        if (!latestContent?.id || !canMarkContentDeleted) return;
        softDeleteMutation.mutate({ contentId: latestContent.id, mark: true });
    };

    return (
        <Stack gap={3} className="border border-border p-3">
            <Stack orientation="horizontal" gap={2} className="items-center justify-between">
                <Text.Heading as="h3" variant="compact-01" className="truncate">
                    {file.name}
                </Text.Heading>
                <Text.Label as="span">{file.extension.toUpperCase()}</Text.Label>
            </Stack>

            <Stack gap={1}>
                <Text.Label as="span">Размер: {formatBytes(file.bytes)}</Text.Label>
                <Text.Label as="span">Доступность: {file.meta?.available === false ? "Недоступен" : "Доступен"}</Text.Label>
            </Stack>

            {isVisual && (
                <FileCardSettings />
            )}

            {!isFileAvailable && (
                <Stack gap={2} className="border border-border bg-muted/20 p-2">
                    <Text.Label as="span">Физический файл отсутствует — загрузите его</Text.Label>
                    <FileDropZone
                        value={restoreFile}
                        onChange={setRestoreFile}
                        accept={`.${file.extension}`}
                        disabled={restoreMutation.isPending}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!restoreFile || restoreMutation.isPending}
                        onClick={handleRestore}
                    >
                        <Upload />
                        {restoreMutation.isPending ? 'Загрузка...' : 'Восстановить файл'}
                    </Button>
                    {restoreMutation.isError && (
                        <Text as="span" compact className="text-destructive">
                            {getApiErrorMessage(restoreMutation.error)}
                        </Text>
                    )}
                    {restoreMutation.isSuccess && (
                        <Text as="span" compact className="text-green-600">
                            Файл успешно восстановлен
                        </Text>
                    )}
                </Stack>
            )}

            <Stack gap={1} className="border border-border bg-muted/20 p-2">
                <Text.Label as="span">Контент</Text.Label>
                <Stack orientation="horizontal" gap={2} className="items-center">
                    <IconIndicator kind={indicator.kind} label={indicator.label} size={16} />
                    <Text as="span" compact>{indicator.label}</Text>
                </Stack>
                {latestContent?.meta?.extractionFailedMessage ? (
                    <Text as="span" compact className="text-destructive">
                        {latestContent.meta.extractionFailedMessage}
                    </Text>
                ) : null}
                {contentList?.[0]?.id ? (
                    <Text.Helper as="span">
                        {isTokensLoading
                            ? "Подсчёт токенов…"
                            : isTokensError
                                ? `Токены: ошибка (${getApiErrorMessage(tokensError)})`
                                : `Токенов (оценка): ${tokensData?.tokens ?? "—"}`}
                    </Text.Helper>
                ) : null}
            </Stack>

            <Stack orientation="horizontal" gap={2}>
                <Button variant="outline" size="sm" disabled={!canRead} onClick={handleRead}>
                    Прочитать
                </Button>
                <Button variant="outline" size="sm" disabled={!canReread} onClick={handleReread}>
                    Перечитать
                </Button>
                <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={!canMarkContentDeleted}
                    onClick={handleMarkContentDeleted}
                >
                    <Trash2 />
                    {softDeleteMutation.isPending ? "Пометка..." : "Скрыть контент"}
                </Button>
                <Dialog>
                    <DialogTrigger
                        render={
                            <Button variant="outline" size="sm" disabled={!hasContent}>
                                <Eye />
                                Увидеть
                            </Button>
                        }
                    />
                    <DialogContent size="large" className="overflow-hidden p-0" showCloseButton={false}>
                        <section className="flex h-[calc(100vh-4rem)] max-h-208 w-full overflow-hidden">
                            <aside className="w-28 shrink-0 border-r border-border p-3">
                                <Stack gap={2}>
                                    <DialogClose
                                        render={
                                            <Button variant="outline" size="sm">
                                                Закрыть
                                            </Button>
                                        }
                                    />
                                </Stack>
                            </aside>
                            <div className="min-h-0 min-w-0 flex-1 p-3">
                                <Stack gap={2} className="h-full min-h-0">
                                    <DialogTitle>{file.name}</DialogTitle>
                                    <div className="min-h-0 flex-1 overflow-auto border border-border bg-muted/20 p-3">
                                        <Stack gap={3}>
                                            {latestContent?.content?.map((chunk, index) => (
                                                <Stack key={`${index}-${chunk.page ?? "no-page"}`} gap={1}>
                                                    {chunk.page ? (
                                                        <Text.Label as="span">Часть {chunk.page}</Text.Label>
                                                    ) : (
                                                        <Text.Label as="span">Контент</Text.Label>
                                                    )}
                                                    <pre className="w-full overflow-x-auto whitespace-pre-wrap wrap-break-word text-xs">{chunk.text ?? ""}</pre>
                                                </Stack>
                                            ))}
                                        </Stack>
                                    </div>
                                </Stack>
                            </div>
                        </section>
                    </DialogContent>
                </Dialog>
            </Stack>

            {extractMutation.isError ? (
                <Text as="span" compact className="text-destructive">
                    {getApiErrorMessage(extractMutation.error)}
                </Text>
            ) : null}
            {softDeleteMutation.isError ? (
                <Text as="span" compact className="text-destructive">
                    {getApiErrorMessage(softDeleteMutation.error)}
                </Text>
            ) : null}
            {isGetContentError ? (
                <Text as="span" compact className="text-destructive">
                    Ошибка загрузки контента: {getApiErrorMessage(getContentError)}
                </Text>
            ) : null}
        </Stack>
    );
}
