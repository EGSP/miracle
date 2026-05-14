import { useState, useEffect } from "react"
import { AlertCircle, CheckCircle2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { getApiErrorMessage } from "@/lib/api"

type Mutation = {
    isError: boolean
    isSuccess: boolean
    error?: unknown
}

type InlineMutationNotificationProps = {
    mutation: Mutation
    successMessage?: string
    className?: string
}

export function InlineMutationNotification({
    mutation,
    successMessage,
    className,
}: InlineMutationNotificationProps) {
    const [dismissed, setDismissed] = useState(false)
    const [detailsOpen, setDetailsOpen] = useState(false)

    useEffect(() => {
        setDismissed(false)
    }, [mutation.isError, mutation.isSuccess])

    if (dismissed) return null

    if (mutation.isError) {
        const message = getApiErrorMessage(mutation.error as Error)
        return (
            <>
                <div className={cn(
                    "flex items-start gap-2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive",
                    className,
                )}>
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <p className="min-w-0 flex-1 text-xs line-clamp-2">{message}</p>
                    <div className="flex shrink-0 items-center gap-1">
                        <Button
                            variant="ghost"
                            size="xs"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDetailsOpen(true)}
                        >
                            Подробнее
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDismissed(true)}
                        >
                            <X />
                            <span className="sr-only">Закрыть</span>
                        </Button>
                    </div>
                </div>
                <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
                    <DialogContent size="small">
                        <DialogTitle>Ошибка</DialogTitle>
                        <p className="break-words text-sm text-muted-foreground">{message}</p>
                        <DialogFooter showCloseButton />
                    </DialogContent>
                </Dialog>
            </>
        )
    }

    if (mutation.isSuccess && successMessage) {
        return (
            <div className={cn(
                "flex items-start gap-2 border border-green-500/30 bg-green-500/10 px-3 py-2 text-green-700 dark:text-green-400",
                className,
            )}>
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                <p className="min-w-0 flex-1 text-xs line-clamp-2">{successMessage}</p>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 text-green-700 hover:bg-green-500/10 hover:text-green-700 dark:text-green-400 dark:hover:text-green-400"
                    onClick={() => setDismissed(true)}
                >
                    <X />
                    <span className="sr-only">Закрыть</span>
                </Button>
            </div>
        )
    }

    return null
}
