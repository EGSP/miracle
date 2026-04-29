import { fileURLToPath } from 'url';
import { loadConfig } from './config.js';
import { extractBackendValidationModel } from './extract.js';
import { writeBackendValidation } from './writers.js';

export type { BackendValidationGeneratorConfig } from './types.js';

export async function generateBackendValidation(configPath?: string): Promise<void> {
    const config = await loadConfig(configPath);

    console.log(`[backend-validation-generator] Reading config: ${config.configPath}`);
    console.log('[backend-validation-generator] Loading project from tsconfig...');

    const model = extractBackendValidationModel(config);

    model.warnings.forEach((warning) => {
        console.warn(`[backend-validation-generator] WARN ${warning}`);
    });

    await writeBackendValidation(model, config);

    const parsersCount = model.routes.reduce((count, route) => (
        count + (route.query ? 1 : 0) + (route.params ? 1 : 0)
    ), 0);

    console.log(
        `[backend-validation-generator] Done. ${parsersCount} parser(s) generated into ${config.outputDir}.`,
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    generateBackendValidation(process.argv[2]).catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
}
