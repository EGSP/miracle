import { Text } from '@miracle/aramid';
import type { Designation } from '@miracle/types';
import { Fragment, useMemo } from 'react';
import { buildDesignationDisplayParts } from '@/lib/designation-display';
import { useFieldLayerStyle } from '@/lib/use-field-layer-style';
import '@/design/designation-display.css';

export type DesignationDisplayProps = {
    designation: Designation;
};

/**
 * Компактное условное обозначение: значения слотов по `slotIndex`,
 * пропуски и `null` — «?», между частями разделитель «-».
 * Подсветка: warn — пусто или confidence < 0.7; critical — значение есть и confidence < 0.5.
 */
export function DesignationDisplay({ designation }: DesignationDisplayProps) {
    const fieldStyle = useFieldLayerStyle();

    const parts = useMemo(
        () => buildDesignationDisplayParts(designation),
        [designation],
    );

    const ariaLabel = useMemo(
        () => parts.map((part) => part.text).join('-'),
        [parts],
    );

    if (parts.length === 0) {
        return null;
    }

    return (
        <div
            className="designation-display"
            role="group"
            aria-label={ariaLabel ? `Условное обозначение: ${ariaLabel}` : undefined}
            style={fieldStyle}
        >
            {parts.map((part, index) => (
                <Fragment key={part.slotIndex}>
                    {index > 0 ? (
                        <span className="designation-display-separator">
                            <Text.Code as="span">-</Text.Code>
                        </span>
                    ) : null}
                    <span
                        className={
                            part.tone === 'none'
                                ? 'designation-display-part'
                                : `designation-display-part designation-display-part--${part.tone}`
                        }
                    >
                        <Text.Code as="span">{part.text}</Text.Code>
                    </span>
                </Fragment>
            ))}
        </div>
    );
}
