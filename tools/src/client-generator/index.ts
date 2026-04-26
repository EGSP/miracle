import { fileURLToPath } from 'url';
import { loadConfig } from './config.js';
import { extractAppModel } from './extract.js';
import { writeClient } from './writers.js';

export type { ClientGeneratorConfig } from './types.js';

export async function generateClient(configPath?: string): Promise<void> {
    const config = await loadConfig(configPath);
    const appModel = extractAppModel(config);

    await writeClient(appModel, config);

    const routesCount = appModel.routers.reduce((count, router) => count + router.routes.length, 0);
    console.log(`[client-generator] Generated ${routesCount} route(s) into ${config.outputDir}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    generateClient(process.argv[2]).catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
}
