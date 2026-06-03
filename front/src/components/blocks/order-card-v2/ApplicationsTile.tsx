import { Stack, Text } from "@miracle/aramid"
import { Plus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/ds/button"
import { ButtonGroup } from "@/components/ui/ds/button-group"
import { Tile } from "@/components/ui/ds/tile"
import { useGetOrderApplications } from "@/lib/queries/order-application.query"
import { AddFileApplicationDialog } from "./AddFileApplicationDialog"
import { AddTextApplicationDialog } from "./AddTextApplicationDialog"
import { ApplicationItem } from "./ApplicationItem"
import "./order-card-v2.css"

export function ApplicationsTile({ orderId }: { orderId: string }) {
  const { data: applications, isLoading } = useGetOrderApplications(orderId)
  const [fileDialogOpen, setFileDialogOpen] = useState(false)
  const [textDialogOpen, setTextDialogOpen] = useState(false)

  const hasApplications = Boolean(applications && applications.length > 0)

  return (
    <>
      <Tile>
        <Stack gap={4}>
          <div className="order-applications__header">
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
          </div>

          {isLoading && <Text.Helper as="p">Загрузка…</Text.Helper>}
          {!isLoading && !hasApplications && <Text.Helper as="p">Нет приложений</Text.Helper>}
          {hasApplications && (
            <ul className="order-applications__list">
              {applications?.map((application) => (
                <li key={application.id}>
                  <ApplicationItem application={application} />
                </li>
              ))}
            </ul>
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
