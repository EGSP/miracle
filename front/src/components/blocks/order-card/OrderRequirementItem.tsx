import { Text } from '@miracle/aramid';
import type { OrderRequirement } from '@miracle/types';

import '@/design/order-requirements-table.css';

/** Строка таблицы требований (слой AI). */
export function OrderRequirementItem({ requirement }: { requirement: OrderRequirement }) {
    return (
        <div className="order-requirements-table-row" role="row">
            <div className="order-requirements-table-cell" role="cell">
                <Text.Label as="span" expressive>
                    {requirement.parameterName}
                </Text.Label>
            </div>
            <div className="order-requirements-table-cell order-requirements-table-cell--value" role="cell">
                <Text.Code as="span">{requirement.requiredValue}</Text.Code>
            </div>
        </div>
    );
}
