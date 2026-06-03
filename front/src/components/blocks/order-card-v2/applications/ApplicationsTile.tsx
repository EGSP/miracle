import { Stack, Text } from "@miracle/aramid"
import { Plus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/ds/button"
import { ButtonGroup } from "@/components/ui/ds/button-group"
import { Tile } from "@/components/ui/ds/tile"
import { useGetOrderApplications } from "@/lib/queries/order-application.query"
import { AddFileApplicationDialog } from "./AddFileApplicationDialog.tsx"
import { AddTextApplicationDialog } from "./AddTextApplicationDialog.tsx"
import { ApplicationItem } from "./ApplicationItem"
import "./applications-tile.css"

export function ApplicationsTile({ orderId }: { orderId: string }) {
  const { data: applications, isLoading } = useGetOrderApplications(orderId)
  const [fileDialogOpen, setFileDialogOpen] = useState(false)
  const [textDialogOpen, setTextDialogOpen] = useState(false)

  const hasApplications = Boolean(applications && applications.length > 0)

  return (
    <>
      <Tile>
        <Stack gap={4}>
          <Stack gap={3}>
            <Text.Heading as="h3" variant="compact-01">
              Приложения
            </Text.Heading>
            <ButtonGroup condensed>
              <Button
                variant="tertiary"
                size="sm"
                icon={<Plus />}
                label="Текст"
                onClick={() => setTextDialogOpen(true)}
              />
              <Button
                variant="tertiary"
                size="sm"
                icon={<Plus />}
                label="Файл"
                onClick={() => setFileDialogOpen(true)}
              />
            </ButtonGroup>
          </Stack>

          {isLoading && <Text.Helper as="p">Загрузка…</Text.Helper>}
          {!isLoading && !hasApplications && <Text.Helper as="p">Нет приложений</Text.Helper>}
          {hasApplications && (
            <Stack orientation="horizontal" gap={3} className="order-applications__chips">
              {applications?.map((application) => (
                <ApplicationItem key={application.id} application={application} fluid compact />
              ))}
            </Stack>
          )}
        </Stack>
      </Tile>

      {textDialogOpen && (
        <AddTextApplicationDialog orderId={orderId} onClose={() => setTextDialogOpen(false)} />
      )}
      {fileDialogOpen && (
        <AddFileApplicationDialog orderId={orderId} onClose={() => setFileDialogOpen(false)} />
      )}
    </>
  )
}
