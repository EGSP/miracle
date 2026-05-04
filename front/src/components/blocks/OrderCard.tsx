import { Column, Grid, IconIndicator, Stack, Text } from '@miracle/aramid';
import type { FileWithMeta, Order, Stored } from '@miracle/types';
import { DirtyProvider } from '@/contexts/dirty-state/DirtyStateContext';

type OrderCardProps = {
    order: Stored<Order>;
    file: FileWithMeta | null;
};

function formatCreatedAt(unixMs: number): string {
    return new Date(unixMs).toLocaleString();
}

type OrderCardDirtyState = {
    orderId: string;
};

function OrderCardInfo({ order }: { order: Stored<Order> }) {
    return (
        <Stack gap={1}>
            <Text.Label as="span">ID заказа: {order.id}</Text.Label>
            <Text.Label as="span">Дата создания: {formatCreatedAt(order.createdAt)}</Text.Label>
            <Text.Label as="span">Автор: {order.authorId}</Text.Label>
        </Stack>
    );
}

function OrderCardFile({ file }: { file: FileWithMeta | null }) {
    return (
        <Stack gap={1}>
            <Text.Label as="span">Файл</Text.Label>
            {file ? (
                <Stack orientation="horizontal" gap={2} className="items-center">
                    <IconIndicator kind="succeeded" label="Файл найден" size={16} />
                    <Text as="span" compact>
                        {file.name}
                    </Text>
                </Stack>
            ) : (
                <Stack orientation="horizontal" gap={2} className="items-center">
                    <IconIndicator kind="unknown" label="Файл не прикреплен" size={16} />
                </Stack>
            )}
        </Stack>
    );
}

function OrderCardRequirements({ order }: { order: Stored<Order> }) {
    return (
        <Stack gap={1}>
            <Text.Label as="span">Требования</Text.Label>
            {order.requirements && order.requirements.length > 0 ? (
                <ul className="list-disc pl-5">
                    {order.requirements.map((requirement, index) => (
                        <li key={`${requirement.name}-${index}`}>
                            <Text as="span" compact>
                                {requirement.name}: {requirement.value}
                            </Text>
                        </li>
                    ))}
                </ul>
            ) : (
                <Text as="span" compact>
                    Требования не указаны
                </Text>
            )}
        </Stack>
    );
}

function OrderCardBody({ order, file }: OrderCardProps) {
    return (
        <Grid as="article" withRowGap className="border border-border">
            <Column span={16}>
                <Text.Heading as="h3" variant="compact-01">
                    Карточка заказа
                </Text.Heading>
            </Column>
            <Column span={16}>
                <OrderCardInfo order={order} />
            </Column>
            <Column span={16}>
                <OrderCardFile file={file} />
            </Column>
            <Column span={16}>
                <OrderCardRequirements order={order} />
            </Column>
        </Grid>
    );
}

export function OrderCard({ order, file }: OrderCardProps) {
    return (
        <DirtyProvider<OrderCardDirtyState> id="order-card" initial={{ orderId: order.id }} key={order.id}>
            <OrderCardBody order={order} file={file} />
        </DirtyProvider>
    );
}
