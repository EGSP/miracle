import { Column, Grid, Text } from "@miracle/aramid"

export default function WorkersPage() {
  return (
    <Grid as="main" withRowGap fullWidth>
      <Column span={16}>
        <Text.Heading as="h1" variant="02">
          Прогоны задач
        </Text.Heading>
        <Text as="p" compact className="text-muted-foreground">
          Страница в разработке.
        </Text>
      </Column>
    </Grid>
  )
}
