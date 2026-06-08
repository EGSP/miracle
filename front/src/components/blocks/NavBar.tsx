import { Text } from "@miracle/aramid"
import { Link } from "@tanstack/react-router"
import { FileIcon, FileText, House, ListOrdered, Settings, Tags } from "lucide-react"
import { WorkerIcon } from "@/components/blocks/WorkerIcon"
import { AccessGuard } from "@/contexts/access"
import { useAuthContext } from "@/contexts/AuthContext"
import { USER_ROLES } from "@miracle/types"

const navLinkClass =
  "flex items-center gap-1.5 px-2 py-1 transition-colors hover:bg-foreground/5 [&.active]:bg-foreground/5 [&.active]:font-medium"

export function NavBar() {
  const { isAuthenticated } = useAuthContext()
  if (!isAuthenticated) return null

  return (
    <nav className="flex items-center gap-1 border-b border-border px-4 py-1">
      <Link to="/" className={navLinkClass}>
        <House className="size-3.5 shrink-0" />
        <Text.Label as="span">Главная</Text.Label>
      </Link>
      <AccessGuard roles={[USER_ROLES.ADMIN]}>
        <Link to="/files" search={{ fileId: undefined }} className={navLinkClass}>
          <FileIcon className="size-3.5 shrink-0" />
          <Text.Label as="span">Файлы</Text.Label>
        </Link>
      </AccessGuard>
      <Link
        to="/orders"
        search={{ orderId: undefined, positionId: undefined }}
        className={navLinkClass}
      >
        <ListOrdered className="size-3.5 shrink-0" />
        <Text.Label as="span">Заказы</Text.Label>
      </Link>
      <AccessGuard roles={[USER_ROLES.ADMIN]}>
        <Link
          to="/operations"
          search={{ rootId: undefined, runId: undefined }}
          className={navLinkClass}
        >
          <WorkerIcon className="size-3.5 shrink-0" />
          <Text.Label as="span">Операции</Text.Label>
        </Link>
      </AccessGuard>
      <AccessGuard roles={[USER_ROLES.ADMIN]}>
        <Link to="/product-types" className={navLinkClass}>
          <Tags className="size-3.5 shrink-0" />
          <Text.Label as="span">Типы продукции</Text.Label>
        </Link>
      </AccessGuard>
      <AccessGuard roles={[USER_ROLES.ADMIN]}>
        <Link to="/technical-conditions" search={{ tcId: undefined }} className={navLinkClass}>
          <FileText className="size-3.5 shrink-0" />
          <Text.Label as="span">Технические условия</Text.Label>
        </Link>
      </AccessGuard>
      <AccessGuard roles={[USER_ROLES.ADMIN]}>
        <Link to="/admin" className={navLinkClass}>
          <Settings className="size-3.5 shrink-0" />
          <Text.Label as="span">Администрирование</Text.Label>
        </Link>
      </AccessGuard>
    </nav>
  )
}
