import { Column, Grid, Stack, Text } from "@miracle/aramid"
import { Link } from "@tanstack/react-router"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { useAuthContext } from "@/contexts/AuthContext"
import { useCheckHealth, useRefetchHealth } from "@/lib/queries/health.query"

export default function HomePage() {
  const { data, isLoading, error } = useCheckHealth()
  const refetchHealth = useRefetchHealth()
  const { isAuthenticated } = useAuthContext()

  const localizedTimestamp = useMemo(() => {
    return new Date(data?.timestamp ?? "").toLocaleString()
  }, [data?.timestamp])

  return (
    <Grid as="main" fullWidth>
      <Column span={16}>
        <Stack gap={6}>
          <Stack gap={1}>
            <Text.Heading as="h1" variant="04">
              Miracle
            </Text.Heading>
            <Text as="p" compact>
              Обработка опросных листов ИИ агентом
            </Text>
          </Stack>

          {isAuthenticated && (
            <Stack as="section" gap={3} className="items-start">
              <Text.Heading as="h2" variant="compact-01">
                Проверка состояния сервера
              </Text.Heading>
              <Stack gap={2}>
                {isLoading && <Text.Label as="p">Загрузка...</Text.Label>}
                {error && <Text.Label as="p">Ошибка: {error.message}</Text.Label>}
                {data && (
                  <Text as="p" compact>
                    Состояние сервера: {data.status} от {localizedTimestamp}
                  </Text>
                )}
              </Stack>
              <Button type="button" size="xs" label="Проверить" onClick={refetchHealth} />
            </Stack>
          )}

          {!isAuthenticated && (
            <Stack as="section" gap={2}>
              <Text.Heading as="h2" variant="compact-01">
                Быстрый старт
              </Text.Heading>
              <Text as="p" compact>
                Перейдите к странице входа и регистрации.
              </Text>
              <Link to="/auth">
                <Text as="span" compact expressive>
                  Авторизация
                </Text>
              </Link>
            </Stack>
          )}
        </Stack>
      </Column>
    </Grid>
  )
}
