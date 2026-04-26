import { defineRouter, route } from '../app/index.js';

type HealthResponse = {
    status: 'ok';
    timestamp: string;
};

const checkHealth = route.get('/health', () => {
    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
    } satisfies HealthResponse;
});

export const healthRouter = defineRouter('/', [
    checkHealth,
] as const);
