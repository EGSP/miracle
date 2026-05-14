/**
 * useField
 *
 * Хук для отслеживания одного поля. Хранит собственный original и value,
 * сравнивает через fast-deep-equal (работает с примитивами, объектами, массивами).
 *
 * Если компонент находится внутри <DirtyGuardProvider> — поле автоматически
 * регистрируется в нём и сообщает о своём isDirty. Без Guard работает автономно.
 *
 * commit() / reset() можно вызывать напрямую или через Guard.commitAll() / resetAll().
 *
 * @example
 * // Примитив
 * const title = useField('title', '')
 * <input value={title.value} onChange={title.onInputChange} />
 *
 * // Boolean
 * const active = useField('active', false)
 * <Switch checked={active.value} onCheckedChange={active.onChange} />
 *
 * // Объект — fast-deep-equal сравнивает глубоко
 * const address = useField('address', { city: '', zip: '' })
 */

import equal from "fast-deep-equal";
import { useState, useEffect } from "react";
import { useDirtyGuardContext } from "./DirtyGuardContext";

// ─────────────────────────────────────────────────────────────────────────────
// Тип возвращаемого значения
// ─────────────────────────────────────────────────────────────────────────────

export type FieldReturn<T> = {
    /** Текущее значение (рабочая копия) */
    value: T;
    /** true если value отличается от original */
    isDirty: boolean;
    /** Для кастомных компонентов — принимает значение напрямую */
    onChange: (value: T) => void;
    /**
     * Для нативных <input> / <textarea> — принимает SyntheticEvent.
     * Всегда читает e.target.value как string.
     * Для не-строковых полей используй onChange.
     */
    onInputChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => void;
    /** Зафиксировать: value становится новым original, isDirty → false */
    commit: () => void;
    /** Сбросить: value возвращается к original, isDirty → false */
    reset: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Хук
// ─────────────────────────────────────────────────────────────────────────────

export function useField<T>(id: string, defaultValue: T): FieldReturn<T> {
    const guard = useDirtyGuardContext();

    // Единый стейт: original — эталон, value — рабочая копия
    const [state, setState] = useState<{ original: T; value: T }>({
        original: defaultValue,
        value: defaultValue,
    });

    const isDirty = !equal(state.value, state.original);

    // ── Регистрация в Guard ──────────────────────────────────────────────────
    // Функциональные setState-апдейтеры не замыкают стейт —
    // безопасно передавать в Guard один раз при монтировании.
    useEffect(() => {
        if (!guard) return;
        return guard.register(id, {
            commit: () => setState((s) => ({ ...s, original: s.value })),
            reset: () => setState((s) => ({ ...s, value: s.original })),
        });
        // guard стабилен (apiRef), id — намеренно единственная зависимость
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, guard]);

    // ── Синхронизация isDirty с Guard ────────────────────────────────────────
    useEffect(() => {
        if (!guard) return;
        if (isDirty) guard.markDirty(id);
        else guard.markClean(id);
    }, [isDirty, id, guard]);

    return {
        value: state.value,
        isDirty,
        onChange: (v) => setState((s) => ({ ...s, value: v })),
        onInputChange: (e) =>
            setState((s) => ({ ...s, value: e.target.value as T })),
        commit: () => setState((s) => ({ ...s, original: s.value })),
        reset: () => setState((s) => ({ ...s, value: s.original })),
    };
}
