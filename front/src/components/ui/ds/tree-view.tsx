/**
 * TreeView — композиционное дерево (WAI-ARIA Tree, адаптация Carbon TreeView v11 под Aramid).
 * Раскрытие и выбор контролируются снаружи; label — произвольный ReactNode.
 *
 * Интерактив (hover / выбор / клик) — на СТРОКЕ узла (`.tree-node__row`), а не на всём `treeitem`:
 * вложенные дети живут в соседнем `role="group"` и не попадают под подсветку родителя.
 */

import {
  createContext,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import { cn } from "@/lib/utils"
import "@/design/tree-view.css"

// ─── Registry types ───────────────────────────────────────────────────────────

type RegisteredNode = {
  nodeId: string
  parentId: string | null
  hasChildren: boolean
  isExpanded: boolean
  disabled: boolean
  onToggle: () => void
  onSelect: () => void
  focus: () => void
}

type TreeViewContextValue = {
  treeId: string
  activeNodeId: string | null
  setActiveNodeId: (id: string | null) => void
  register: (node: RegisteredNode) => void
  unregister: (nodeId: string) => void
  getVisibleOrder: () => string[]
  handleTreeKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

const TreeViewContext = createContext<TreeViewContextValue | null>(null)

function useTreeViewContext() {
  const ctx = useContext(TreeViewContext)
  if (!ctx) throw new Error("TreeNode must be used within TreeView")
  return ctx
}

// ─── TreeView ─────────────────────────────────────────────────────────────────

export type TreeViewProps = {
  children: ReactNode
  /** Узел с roving tabindex (клавиатурный фокус). */
  activeNodeId?: string | null
  onActiveNodeChange?: (nodeId: string | null) => void
  className?: string
  /** Доступное имя дерева для screen reader. */
  "aria-label"?: string
}

function TreeView({
  children,
  activeNodeId: activeNodeIdProp,
  onActiveNodeChange,
  className,
  "aria-label": ariaLabel,
}: TreeViewProps) {
  const treeId = useId()
  const registryRef = useRef(new Map<string, RegisteredNode>())
  const [activeNodeIdInternal, setActiveNodeIdInternal] = useState<string | null>(null)

  const isControlled = activeNodeIdProp !== undefined
  const activeNodeId = isControlled ? (activeNodeIdProp ?? null) : activeNodeIdInternal

  const setActiveNodeId = useCallback(
    (id: string | null) => {
      if (!isControlled) setActiveNodeIdInternal(id)
      onActiveNodeChange?.(id)
    },
    [isControlled, onActiveNodeChange],
  )

  const register = useCallback((node: RegisteredNode) => {
    registryRef.current.set(node.nodeId, node)
  }, [])

  const unregister = useCallback((nodeId: string) => {
    registryRef.current.delete(nodeId)
  }, [])

  const getVisibleOrder = useCallback((): string[] => {
    const registry = registryRef.current
    const roots: string[] = []
    for (const node of registry.values()) {
      if (node.parentId === null || !registry.has(node.parentId)) {
        roots.push(node.nodeId)
      }
    }
    roots.sort()

    const result: string[] = []
    const visit = (id: string) => {
      const node = registry.get(id)
      if (!node) return
      result.push(id)
      if (!node.hasChildren || !node.isExpanded) return
      const children = [...registry.values()]
        .filter((n) => n.parentId === id)
        .map((n) => n.nodeId)
        .sort()
      for (const childId of children) visit(childId)
    }
    for (const rootId of roots) visit(rootId)
    return result
  }, [])

  const focusNode = useCallback(
    (nodeId: string) => {
      const node = registryRef.current.get(nodeId)
      if (node) {
        setActiveNodeId(nodeId)
        node.focus()
      }
    },
    [setActiveNodeId],
  )

  const handleTreeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const order = getVisibleOrder()
      if (!order.length) return

      const currentIndex = activeNodeId ? order.indexOf(activeNodeId) : -1
      const current = activeNodeId ? registryRef.current.get(activeNodeId) : undefined

      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault()
          const next = currentIndex < order.length - 1 ? order[currentIndex + 1] : order[0]
          if (next) focusNode(next)
          break
        }
        case "ArrowUp": {
          event.preventDefault()
          const prev = currentIndex > 0 ? order[currentIndex - 1] : order[order.length - 1]
          if (prev) focusNode(prev)
          break
        }
        case "ArrowRight": {
          event.preventDefault()
          if (!current) {
            focusNode(order[0])
            return
          }
          if (current.hasChildren && !current.isExpanded) {
            current.onToggle()
          } else if (current.hasChildren && current.isExpanded) {
            const child = order.find(
              (id, i) => i > currentIndex && registryRef.current.get(id)?.parentId === activeNodeId,
            )
            if (child) focusNode(child)
          }
          break
        }
        case "ArrowLeft": {
          event.preventDefault()
          if (!current || !activeNodeId) return
          if (current.hasChildren && current.isExpanded) {
            current.onToggle()
          } else if (current.parentId) {
            focusNode(current.parentId)
          }
          break
        }
        case "Enter":
        case " ": {
          event.preventDefault()
          if (current && !current.disabled) current.onSelect()
          break
        }
        case "Home": {
          event.preventDefault()
          focusNode(order[0])
          break
        }
        case "End": {
          event.preventDefault()
          focusNode(order[order.length - 1])
          break
        }
        default:
          break
      }
    },
    [activeNodeId, focusNode, getVisibleOrder],
  )

  const contextValue = useMemo<TreeViewContextValue>(
    () => ({
      treeId,
      activeNodeId,
      setActiveNodeId,
      register,
      unregister,
      getVisibleOrder,
      handleTreeKeyDown,
    }),
    [treeId, activeNodeId, setActiveNodeId, register, unregister, getVisibleOrder, handleTreeKeyDown],
  )

  return (
    <TreeViewContext.Provider value={contextValue}>
      <ul
        data-slot="tree-view"
        id={treeId}
        role="tree"
        aria-label={ariaLabel}
        className={cn("tree-view", className)}
      >
        {children}
      </ul>
    </TreeViewContext.Provider>
  )
}

// ─── TreeNode ─────────────────────────────────────────────────────────────────

export type TreeNodeProps = {
  nodeId: string
  label: ReactNode
  parentId?: string | null
  hasChildren?: boolean
  isExpanded?: boolean
  onToggle?: () => void
  isSelected?: boolean
  onSelect?: () => void
  level?: number
  disabled?: boolean
  children?: ReactNode
  className?: string
}

function TreeNode({
  nodeId,
  label,
  parentId = null,
  hasChildren = false,
  isExpanded = false,
  onToggle,
  isSelected = false,
  onSelect,
  level = 1,
  disabled = false,
  children,
  className,
}: TreeNodeProps) {
  const ctx = useTreeViewContext()
  const itemRef = useRef<HTMLLIElement>(null)
  const isActive = ctx.activeNodeId === nodeId

  const focus = useCallback(() => {
    itemRef.current?.focus()
  }, [])

  useEffect(() => {
    ctx.register({
      nodeId,
      parentId,
      hasChildren,
      isExpanded,
      disabled,
      onToggle: () => onToggle?.(),
      onSelect: () => onSelect?.(),
      focus,
    })
    return () => ctx.unregister(nodeId)
  }, [ctx, nodeId, parentId, hasChildren, isExpanded, disabled, onToggle, onSelect, focus])

  const handleRowClick = () => {
    if (disabled) return
    ctx.setActiveNodeId(nodeId)
    onSelect?.()
  }

  const handleTwistieClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (disabled) return
    onToggle?.()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (disabled) return
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(
        event.key,
      )
    ) {
      ctx.setActiveNodeId(nodeId)
      ctx.handleTreeKeyDown(event)
    }
  }

  // Отступ по глубине задаём на строке (не на группе) — тогда подсветка строки тянется на всю
  // ширину контейнера, а взаимодействие остаётся пер-узловым.
  const rowStyle: CSSProperties = {
    paddingInlineStart: `calc(var(--aramid-spacing-3) + var(--aramid-spacing-5) * ${level - 1})`,
  }

  return (
    <li
      ref={itemRef}
      data-slot="tree-node"
      role="treeitem"
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-selected={isSelected}
      aria-level={level}
      className={cn("tree-node", className)}
      tabIndex={isActive ? 0 : -1}
      onFocus={() => ctx.setActiveNodeId(nodeId)}
      onKeyDown={handleKeyDown}
    >
      <div
        className={cn(
          "tree-node__row",
          isSelected && "tree-node__row--selected",
          disabled && "tree-node__row--disabled",
        )}
        style={rowStyle}
        onClick={handleRowClick}
      >
        {hasChildren ? (
          <button
            type="button"
            className="tree-node__twistie"
            tabIndex={-1}
            disabled={disabled}
            onClick={handleTwistieClick}
            aria-label={isExpanded ? "Свернуть" : "Развернуть"}
          >
            <span
              className={cn(
                "tree-node__twistie-icon",
                isExpanded && "tree-node__twistie-icon--expanded",
              )}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="tree-node__twistie-placeholder" aria-hidden="true" />
        )}
        <span className="tree-node__label">{label}</span>
      </div>

      {hasChildren && isExpanded && children ? (
        <ul role="group" className="tree-node__group">
          {children}
        </ul>
      ) : null}
    </li>
  )
}

export { TreeNode, TreeView }
