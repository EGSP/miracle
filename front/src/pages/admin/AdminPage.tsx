import { Column, Grid, Stack, Text } from "@miracle/aramid"
import { useState } from "react"
import { type AdminTabId, AdminTabs } from "./AdminTabs"
import { UsersTab } from "./users/UsersTab"

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTabId>("users")

  return (
    <Grid as="main" withRowGap fullWidth>
      <Column span={16}>
        <Stack gap={4}>
          <Stack gap={1}>
            <Text.Heading as="h1" variant="03">
              Администрирование
            </Text.Heading>
            <Text as="p" compact>
              Настройки и управление пользователями
            </Text>
          </Stack>

          <AdminTabs activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === "users" && <UsersTab />}
        </Stack>
      </Column>
    </Grid>
  )
}
