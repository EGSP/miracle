import { Column, Grid, Stack } from "@miracle/aramid"
import { CreateUserForm } from "./CreateUserForm"
import { UsersList } from "./UsersList"

export function UsersTab() {
  return (
    <Grid withRowGap fullWidth narrow>
      <Column span={8}>
        <Stack gap={4}>
          <CreateUserForm />
        </Stack>
      </Column>
      <Column span={8}>
        <Stack gap={4}>
          <UsersList />
        </Stack>
      </Column>
    </Grid>
  )
}
