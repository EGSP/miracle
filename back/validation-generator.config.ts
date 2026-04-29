import type { BackendValidationGeneratorConfig } from '../tools/src/backend-validation-generator/types.js';

export default {
    input: './src/index.ts',
    output: './src/app/generated',
    tsConfig: './tsconfig.json',
} satisfies BackendValidationGeneratorConfig;
