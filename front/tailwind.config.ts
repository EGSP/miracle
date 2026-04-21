// Tailwind v4: configuration is now CSS-based (see src/index.css @theme block).
// This file is kept for shadcn CLI compatibility.
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
};

export default config;
