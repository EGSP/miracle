import type { DeployEnv } from '../env.js';
import { warn, hint } from '../logger.js';

const WEAK_SECRETS = ['access_token_secret', 'refresh_token_secret', 'secret', 'changeme'];

export function validateEnv(_env: DeployEnv): void {
    // Warn about default weak token secrets
    const accessSecret = process.env['ACCESS_TOKEN_SECRET'] ?? '';
    const refreshSecret = process.env['REFRESH_TOKEN_SECRET'] ?? '';
    if (WEAK_SECRETS.includes(accessSecret) || WEAK_SECRETS.includes(refreshSecret)) {
        warn('ACCESS_TOKEN_SECRET / REFRESH_TOKEN_SECRET — используются слабые дефолтные значения');
        hint('Замени на случайные строки длиной 32+ символа');
    }
}
