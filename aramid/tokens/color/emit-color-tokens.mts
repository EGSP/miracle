/**
 * Генератор JSON-токенов палитры для Style Dictionary.
 *
 * Зачем нужен: исходник правды по hex — `colors.ts` (копия значений IBM Carbon).
 * JSON в `basic/*.json` держим рядом как вход Style Dictionary; этот скрипт
 * пересобирает их из `colors` / `hoverColors`, чтобы не править десятки hex
 * в двух местах вручную. После изменения `colors.ts` выполни:
 *   npm run emit:color-tokens --workspace=aramid
 * затем при необходимости `npm run build:tokens --workspace=aramid`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { colors, hoverColors } from './colors.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const basicDir = path.join(__dirname, 'basic')

const STEPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const

type Scale = Record<number, string>

function token(hex: string, description?: string) {
  const o: Record<string, unknown> = { $value: hex, $type: 'color' }
  if (description) o.$description = description
  return o
}

function buildScale(base: Scale, hover: Scale, jsonColorKey: string) {
  const scale: Record<string, unknown> = {}
  for (const s of STEPS) {
    const desc =
      jsonColorKey === 'blue' && s === 60
        ? 'Основной интерактивный цвет (Carbon blue 60).'
        : undefined
    scale[String(s)] = token(base[s]!, desc)
  }
  const hoverObj: Record<string, unknown> = {}
  for (const s of STEPS) {
    hoverObj[String(s)] = token(hover[s]!)
  }
  scale.hover = hoverObj
  return scale
}

const PALETTES: ReadonlyArray<{
  baseKey: keyof typeof colors
  hoverKey: keyof typeof hoverColors
  fileName: string
  jsonColorKey: string
}> = [
  { baseKey: 'yellow', hoverKey: 'yellowHover', fileName: 'yellow', jsonColorKey: 'yellow' },
  { baseKey: 'orange', hoverKey: 'orangeHover', fileName: 'orange', jsonColorKey: 'orange' },
  { baseKey: 'red', hoverKey: 'redHover', fileName: 'red', jsonColorKey: 'red' },
  { baseKey: 'sand', hoverKey: 'sandHover', fileName: 'sand', jsonColorKey: 'sand' },
  { baseKey: 'magenta', hoverKey: 'magentaHover', fileName: 'magenta', jsonColorKey: 'magenta' },
  { baseKey: 'purple', hoverKey: 'purpleHover', fileName: 'purple', jsonColorKey: 'purple' },
  { baseKey: 'blue', hoverKey: 'blueHover', fileName: 'blue', jsonColorKey: 'blue' },
  { baseKey: 'cyan', hoverKey: 'cyanHover', fileName: 'cyan', jsonColorKey: 'cyan' },
  { baseKey: 'teal', hoverKey: 'tealHover', fileName: 'teal', jsonColorKey: 'teal' },
  { baseKey: 'green', hoverKey: 'greenHover', fileName: 'green', jsonColorKey: 'green' },
  { baseKey: 'coolGray', hoverKey: 'coolGrayHover', fileName: 'cool-gray', jsonColorKey: 'cool-gray' },
  { baseKey: 'gray', hoverKey: 'grayHover', fileName: 'gray', jsonColorKey: 'gray' },
  { baseKey: 'warmGray', hoverKey: 'warmGrayHover', fileName: 'warm-gray', jsonColorKey: 'warm-gray' },
]

if (!fs.existsSync(basicDir)) {
  fs.mkdirSync(basicDir, { recursive: true })
}

for (const p of PALETTES) {
  const base = colors[p.baseKey] as Scale
  const hover = hoverColors[p.hoverKey] as Scale
  const scale = buildScale(base, hover, p.jsonColorKey)
  const payload = { color: { [p.jsonColorKey]: scale } }
  const filePath = path.join(basicDir, `${p.fileName}.json`)
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  console.log('wrote', path.relative(process.cwd(), filePath))
}

const blackWhite = {
  color: {
    black: {
      100: token((colors.black as { 100: string })[100]),
      hover: token(hoverColors.blackHover as string),
    },
    white: {
      0: token((colors.white as { 0: string })[0]),
      hover: token(hoverColors.whiteHover as string),
    },
  },
}

const bwPath = path.join(basicDir, 'black-white.json')
fs.writeFileSync(bwPath, JSON.stringify(blackWhite, null, 2) + '\n', 'utf8')
console.log('wrote', path.relative(process.cwd(), bwPath))
