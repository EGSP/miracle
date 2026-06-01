import { Column, Grid, Text } from "@miracle/aramid"

export default function WorkerPromptPage() {
  return (
    <Grid as="main" withRowGap>
      <Column span={16}>
        <Text as="p" compact className="text-muted-foreground">
          Страница в разработке.
        </Text>
      </Column>
    </Grid>
  )
}
