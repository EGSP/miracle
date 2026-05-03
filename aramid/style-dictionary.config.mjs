import StyleDictionary from 'style-dictionary'
import path from 'node:path'

/**
 * Источники палитры без моста Shadcn.
 * Явный список: negated globs в Style Dictionary не исключали shadcn/light и давали 133 коллизии;
 * Shadcn — отдельные инстансы с `tokens/shadcn/light|dark/**`.
 * При добавлении новой категории в tokens/ (новая папка верхнего уровня) добавьте сюда шаблон.
 */
const TOKEN_CORE_SOURCES = [
  'tokens/breakpoints/**/*.json',
  'tokens/column/**/*.json',
  'tokens/color/**/*.json',
  'tokens/grid/**/*.json',
  'tokens/spacing/**/*.json',
  'tokens/typography/**/*.json',
]

/** Только записи из semantic.json в подпапке light/dark */
function isShadcnLightToken(token) {
  return (
    path.basename(token.filePath) === 'semantic.json' &&
    path.basename(path.dirname(token.filePath)) === 'light'
  )
}

function isShadcnDarkToken(token) {
  return (
    path.basename(token.filePath) === 'semantic.json' &&
    path.basename(path.dirname(token.filePath)) === 'dark'
  )
}

const sdMain = new StyleDictionary({
  source: TOKEN_CORE_SOURCES,
  platforms: {
    css: {
      transformGroup: 'css',
      prefix: 'aramid',
      buildPath: 'dist/css/',
      files: [
        {
          destination: 'tokens.css',
          format: 'css/variables',
          options: {
            selector: ':root',
            outputReferences: true,
          },
        },
      ],
    },
    js: {
      transformGroup: 'js',
      buildPath: 'dist/js/',
      files: [
        {
          destination: 'tokens.mjs',
          format: 'javascript/es6',
        },
      ],
    },
  },
})

/** Переменные Shadcn без префикса; значения — var(--aramid-…) из semantic.json */
const sdShadcnLight = new StyleDictionary({
  source: [...TOKEN_CORE_SOURCES, 'tokens/shadcn/light/**/*.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      prefix: '',
      buildPath: 'dist/css/',
      files: [
        {
          destination: 'shadcn-tokens.css',
          format: 'css/variables',
          filter: isShadcnLightToken,
          options: {
            selector: ':root',
            outputReferences: false,
          },
        },
      ],
    },
  },
})

const sdShadcnDark = new StyleDictionary({
  source: [...TOKEN_CORE_SOURCES, 'tokens/shadcn/dark/**/*.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      prefix: '',
      buildPath: 'dist/css/',
      files: [
        {
          destination: 'shadcn-tokens-dark.css',
          format: 'css/variables',
          filter: isShadcnDarkToken,
          options: {
            selector: '.dark',
            outputReferences: false,
          },
        },
      ],
    },
  },
})

await sdMain.buildAllPlatforms()
await sdShadcnLight.buildAllPlatforms()
await sdShadcnDark.buildAllPlatforms()
