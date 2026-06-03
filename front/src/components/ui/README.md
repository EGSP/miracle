# UI components

| Папка | Назначение | Примеры |
|-------|------------|---------|
| `ds/` | Базовая дизайн-система (Carbon v11 + Aramid, `design/*.css`) | `Button`, `Input`, `Dialog`, `Tile`, `StructuredList` |
| `derivations/` | Композиции на базе `ds` | `CopyButton`, `ArrayEditor` |
| `external/` | Вне DS (Tailwind, прикладная логика) | `InlineMutationNotification`, `FileContentPreview` |

Импорты:

```ts
import { Button, Input, Dialog } from "@/components/ui/ds"
import { CopyButton } from "@/components/ui/derivations"
import { InlineMutationNotification } from "@/components/ui/external"
```

Подробные правила стилизации — в [`../COMPONENTS.md`](../COMPONENTS.md).
