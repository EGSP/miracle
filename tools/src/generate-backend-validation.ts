export { generateBackendValidation } from './backend-validation-generator/index.js';

import { fileURLToPath } from 'url';
import { generateBackendValidation } from './backend-validation-generator/index.js';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    generateBackendValidation(process.argv[2]).catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
}
