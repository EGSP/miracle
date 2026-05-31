import { Column, Grid, Stack, Text } from "@miracle/aramid"
import { Navigate } from "@tanstack/react-router"
import { useState } from "react"
import { useAuthContext } from "@/contexts/AuthContext"
import { useUserIsAdmin } from "@/lib/hooks/useUserIsAdmin"
import { type AdminTabId, AdminTabs } from "./AdminTabs"
import { UsersTab } from "./users/UsersTab"

export default function AdminPage() {
  const { isAuthenticated } = useAuthContext()
  const isAdmin = useUserIsAdmin()
  const [activeTab, setActiveTab] = useState<AdminTabId>("users")

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" />
  }

  if (!isAdmin) {
    return <Navigate to="/" />
  }

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
