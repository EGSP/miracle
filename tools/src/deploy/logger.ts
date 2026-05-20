const c = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    dim:    '\x1b[2m',
    green:  '\x1b[32m',
    yellow: '\x1b[33m',
    red:    '\x1b[31m',
    cyan:   '\x1b[36m',
    gray:   '\x1b[90m',
};

const TOTAL_STEPS = 6;
let currentStep = 0;

export function step(label: string): void {
    currentStep++;
    console.log(`\n${c.bold}${c.cyan}[${currentStep}/${TOTAL_STEPS}] ${label}${c.reset}`);
}

export function info(msg: string): void {
    console.log(`  ${c.gray}●${c.reset} ${msg}`);
}

export function success(msg: string): void {
    console.log(`  ${c.green}✓${c.reset} ${c.bold}${msg}${c.reset}`);
}

export function warn(msg: string): void {
    console.log(`  ${c.yellow}⚠${c.reset}  ${msg}`);
}

export function hint(msg: string): void {
    console.log(`${c.gray}    → ${msg}${c.reset}`);
}

export function fatal(msg: string): never {
    console.log(`\n  ${c.red}✗${c.reset} ${c.bold}${msg}${c.reset}\n`);
    process.exit(1);
}

export function banner(title: string): void {
    const line = '═'.repeat(50);
    console.log(`\n${c.bold}${c.cyan}${line}${c.reset}`);
    console.log(`${c.bold}  ${title}${c.reset}`);
    console.log(`${c.bold}${c.cyan}${line}${c.reset}`);
}

export function summary(rows: Array<[string, string]>): void {
    const pad = Math.max(...rows.map(([k]) => k.length));
    for (const [key, value] of rows) {
        console.log(`  ${c.gray}${key.padEnd(pad)}${c.reset}  ${c.bold}${value}${c.reset}`);
    }
}
