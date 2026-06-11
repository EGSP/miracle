import { Controller, Get } from '@nestjs/common';
import type { KreuzbergHealthStatus } from '../document-prepare/adapters/kreuzberg-http.extractor.js';
import { KreuzbergHttpExtractor } from '../document-prepare/adapters/kreuzberg-http.extractor.js';

type HealthResponse = {
    status: 'ok';
    timestamp: string;
    kreuzberg: KreuzbergHealthStatus;
};

@Controller()
export class HealthController {
    constructor(private readonly kreuzberg: KreuzbergHttpExtractor) {}

    @Get('health')
    async check(): Promise<HealthResponse> {
        const kreuzberg = await this.kreuzberg.checkHealth();

        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            kreuzberg,
        };
    }
}
