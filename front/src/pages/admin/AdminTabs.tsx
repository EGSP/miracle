import { Text } from "@miracle/aramid"

export type AdminTabId = "users"

type AdminTab = {
  id: AdminTabId
  label: string
}

const TABS: AdminTab[] = [{ id: "users", label: "Пользователи" }]

const tabClass = "flex items-center gap-1.5 px-2 py-1 transition-colors hover:bg-foreground/5"

type AdminTabsProps = {
  activeTab: AdminTabId
  onTabChange: (tab: AdminTabId) => void
}

export function AdminTabs({ activeTab, onTabChange }: AdminTabsProps) {
  return (
    <nav className="flex items-center gap-1 border-b border-border">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id

        return (
          <button
            key={tab.id}
            type="button"
            className={`${tabClass}${isActive ? " bg-foreground/5 font-medium" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            <Text.Label as="span">{tab.label}</Text.Label>
          </button>
        )
      })}
    </nav>
  )
}
