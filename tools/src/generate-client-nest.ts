export { generateClientNest } from './client-generator-nest/index.js';

import { fileURLToPath } from 'url';
import { generateClientNest } from './client-generator-nest/index.js';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    generateClientNest(process.argv[2]).catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
}
