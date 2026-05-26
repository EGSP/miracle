import { Controller, Get } from '@nestjs/common';

type HealthResponse = {
    status: 'ok';
    timestamp: string;
};

@Controller()
export class HealthController {
    @Get('health')
    check(): HealthResponse {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
        };
    }
}
