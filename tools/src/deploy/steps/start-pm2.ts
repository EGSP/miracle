import { execSync } from 'child_process';
import { info, success, fatal } from '../logger.js';

function pm2IsInstalled(): boolean {
    try {
        execSync('pm2 -v', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

function miracleAppsRunning(): boolean {
    try {
        const output = execSync('pm2 jlist', { stdio: 'pipe' }).toString();
        const apps = JSON.parse(output) as Array<{ name: string }>;
        return apps.some(a => a.name === 'miracle-back' || a.name === 'miracle-front');
    } catch {
        return false;
    }
}

export function startPm2(rootDir: string): void {
    if (!pm2IsInstalled()) {
        fatal('PM2 не установлен. Установи: npm install -g pm2');
    }

    const ecosystemPath = 'ecosystem.config.cjs';

    // pm2 startOrRestart применяет весь конфиг (включая cwd) — в отличие от reload
    info('Запускаем / перезапускаем процессы...');
    execSync(`pm2 startOrRestart ${ecosystemPath}`, { cwd: rootDir, stdio: 'inherit' });

    execSync('pm2 save', { cwd: rootDir, stdio: 'pipe' });
    success('PM2 сохранил список процессов');
}
