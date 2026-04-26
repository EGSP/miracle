export { generateClient } from './client-generator/index.js';

import { fileURLToPath } from 'url';
import { generateClient } from './client-generator/index.js';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateClient(process.argv[2]).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
