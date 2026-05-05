import { IconIndicator, Stack, Text } from "@miracle/aramid";
import type { ExtractionStatus, FileContent, FileWithMeta, Stored } from "@miracle/types";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/api";
import { useExtractFileContent, useGetFileContent } from "@/lib/queries/file-content.query";

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

export function FileCard({ file }: FileCardProps) {
    const { data: contentList, isLoading } = useGetFileContent(file.id, true);
    const extractMutation = useExtractFileContent(file.id);
    const latestContent = contentList?.[0];
    const status = latestContent?.meta?.extractionStatus as ExtractionStatus | undefined;
    const indicator = getExtractionIndicator(latestContent);

    const canRead = !extractMutation.isPending && !isLoading && !status;
    const canReread = !extractMutation.isPending && !isLoading && (status === "completed" || status === "failed");

    const handleRead = () => {
        if (!canRead) return;
        extractMutation.mutate();
    };

    const handleReread = () => {
        if (!canReread) return;
        extractMutation.mutate();
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
            </Stack>

            <Stack orientation="horizontal" gap={2}>
                <Button variant="outline" size="sm" disabled={!canRead} onClick={handleRead}>
                    Прочитать
                </Button>
                <Button variant="outline" size="sm" disabled={!canReread} onClick={handleReread}>
                    Перечитать
                </Button>
            </Stack>

            {extractMutation.isError ? (
                <Text as="span" compact className="text-destructive">
                    {getApiErrorMessage(extractMutation.error)}
                </Text>
            ) : null}
        </Stack>
    );
}
