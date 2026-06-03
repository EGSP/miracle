import { Text } from "@miracle/aramid"
import type { ApplicationData, OrderApplication, Stored } from "@miracle/types"
import { File, MessageSquareText, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRemoveApplication } from "@/lib/queries/order-application.query"

export function ApplicationItem({ application }: { application: Stored<OrderApplication> }) {
  const removeMutation = useRemoveApplication(application.orderId)
  const data = application.data as ApplicationData

  return (
    <div className="order-application-item">
      <span className="order-application-item__icon" aria-hidden="true">
        {data.type === "file" ? <File size={16} /> : <MessageSquareText size={16} />}
      </span>
      <Text as="span" compact className="order-application-item__content">
        {data.type === "file" ? data.fileId : data.text}
      </Text>
      <Button
        variant="icon-button"
        size="sm"
        icon={<Trash2 />}
        label="Удалить приложение"
        disabled={removeMutation.isPending}
        onClick={() => removeMutation.mutate(application.id)}
      />
    </div>
  )
}
