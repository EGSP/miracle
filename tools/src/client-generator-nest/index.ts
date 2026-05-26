import { fileURLToPath } from 'url';
import { loadConfig } from './config.js';
import { extractAppModel } from './extract.js';
import { writeAll } from './writers.js';

export type { ClientGeneratorNestConfig } from './types.js';

export async function generateClientNest(configPath?: string): Promise<void> {
    const config = await loadConfig(configPath);
    const appModel = extractAppModel(config);

    await writeAll(appModel, config);

    const routes = appModel.controllers.reduce((acc, controller) => acc + controller.routes.length, 0);
    console.log(
        `[client-generator-nest] Generated ${routes} route(s) across ${appModel.controllers.length} controller(s) into ${config.outputDir}`,
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    generateClientNest(process.argv[2]).catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
}
