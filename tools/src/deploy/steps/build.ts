import { execSync } from 'child_process';
import { info, fatal } from '../logger.js';

function run(label: string, cmd: string, cwd: string): void {
    info(label);
    try {
        execSync(cmd, { cwd, stdio: 'inherit' });
    } catch {
        fatal(`Сборка завершилась с ошибкой: ${label}`);
    }
}

export function buildBack(rootDir: string): void {
    run('Компилируем @miracle/types...', 'npm run build --workspace=types', rootDir);
    run('Компилируем бекенд...', 'npm run build --workspace=back', rootDir);
}

export function buildFront(rootDir: string): void {
    run('Собираем Vite bundle...', 'npm run build --workspace=front', rootDir);
}
