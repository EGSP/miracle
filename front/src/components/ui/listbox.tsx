import { createContext, Fragment, useContext, useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ListBoxProps<T> = {
  items: T[];
  value?: T | null;
  defaultValue?: T | null;
  onChange?: (val: T | null) => void;
  getKey: (item: T) => string;
  disabled?: boolean;
  readonly?: boolean;
  children: ReactNode;
  className?: string;
};

type ListBoxItemsProps<T> = {
  children: (item: T, index: number) => ReactNode;
};

type ListBoxItemProps<T> = {
  item: T;
  index: number;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
};

type ListBoxContextValue<T> = {
  items: T[];
  getKey: (item: T) => string;
  selectedKey: string | null;
  activeIndex: number | null;
  setActiveIndex: (index: number | null) => void;
  select: (item: T) => void;
  getItemId: (item: T) => string;
  disabled?: boolean;
  readonly?: boolean;
};

const ListBoxContext = createContext<ListBoxContextValue<unknown> | null>(null);

function useListBoxContext<T>() {
  const ctx = useContext(ListBoxContext);
  if (!ctx) {
    throw new Error('ListBox compound components must be used within ListBox.');
  }
  return ctx as ListBoxContextValue<T>;
}

function ListBoxRoot<T>({
  items,
  value,
  defaultValue = null,
  onChange,
  getKey,
  disabled,
  readonly,
  children,
  className,
}: ListBoxProps<T>) {
  const listBoxId = useId();
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<T | null>(defaultValue);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const currentValue = isControlled ? value ?? null : internalValue;

  const selectedKey = currentValue ? getKey(currentValue) : null;
  const activeItem = activeIndex !== null ? items[activeIndex] : null;
  const activeKey = activeItem ? getKey(activeItem) : null;

  const setValue = (next: T | null) => {
    if (!isControlled) {
      setInternalValue(next);
    }
    onChange?.(next);
  };

  const select = (item: T) => {
    if (disabled || readonly) return;
    setValue(item);
  };

  const move = (delta: number) => {
    if (!items.length) return;
    const next =
      activeIndex === null
        ? 0
        : Math.min(Math.max(activeIndex + delta, 0), items.length - 1);
    setActiveIndex(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        if (items.length) setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        if (items.length) setActiveIndex(items.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (activeIndex !== null) {
          const item = items[activeIndex];
          if (item) {
            select(item);
          }
        }
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (!currentValue) return;

    const exists = items.some((item) => getKey(item) === getKey(currentValue));
    if (!exists) {
      setValue(null);
    }
  }, [currentValue, items, getKey]);

  const contextValue = useMemo<ListBoxContextValue<T>>(
    () => ({
      items,
      getKey,
      selectedKey,
      activeIndex,
      setActiveIndex,
      select,
      getItemId: (item: T) => `${listBoxId}-option-${encodeURIComponent(getKey(item))}`,
      disabled,
      readonly,
    }),
    [items, getKey, selectedKey, activeIndex, disabled, readonly, listBoxId],
  );

  return (
    <ListBoxContext.Provider value={contextValue as ListBoxContextValue<unknown>}>
      <div
        role="listbox"
        tabIndex={disabled ? -1 : 0}
        aria-activedescendant={activeKey ? `${listBoxId}-option-${encodeURIComponent(activeKey)}` : undefined}
        aria-disabled={disabled || undefined}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (disabled) return;
          if (activeIndex !== null) return;
          if (!items.length) return;

          if (selectedKey) {
            const selectedIndex = items.findIndex((item) => getKey(item) === selectedKey);
            setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
            return;
          }
          setActiveIndex(0);
        }}
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setActiveIndex(null);
        }}
        className={className}
      >
        {children}
      </div>
    </ListBoxContext.Provider>
  );
}

function ListBoxItems<T>({ children }: ListBoxItemsProps<T>) {
  const { items, getKey } = useListBoxContext<T>();
  return (
    <>
      {items.map((item, index) => (
        <Fragment key={getKey(item)}>{children(item, index)}</Fragment>
      ))}
    </>
  );
}

function ListBoxItem<T>({ item, index, disabled: itemDisabled, children, className }: ListBoxItemProps<T>) {
  const { getKey, selectedKey, activeIndex, setActiveIndex, select, getItemId, disabled, readonly } =
    useListBoxContext<T>();
  const key = getKey(item);
  const selected = key === selectedKey;
  const active = index === activeIndex;
  const interactiveDisabled = Boolean(disabled || readonly || itemDisabled);

  return (
    <div
      id={getItemId(item)}
      role="option"
      aria-selected={selected}
      aria-disabled={interactiveDisabled || undefined}
      data-selected={selected || undefined}
      data-active={active || undefined}
      data-disabled={interactiveDisabled || undefined}
      className={cn(className)}
      onMouseEnter={() => {
        if (disabled) return;
        if (itemDisabled) return;
        setActiveIndex(index);
      }}
      onMouseDown={(event) => {
        // Keep focus on listbox root for aria-activedescendant navigation.
        event.preventDefault();
      }}
      onClick={() => {
        if (interactiveDisabled) return;
        select(item);
      }}
    >
      {children}
    </div>
  );
}

type ListBoxComponent = typeof ListBoxRoot & {
  Items: typeof ListBoxItems;
  Item: typeof ListBoxItem;
};

export const ListBox = Object.assign(ListBoxRoot, {
  Items: ListBoxItems,
  Item: ListBoxItem,
}) as ListBoxComponent;
