/** Одна строка textarea → один элемент массива синонимов (пустые строки отбрасываются). */
export function parseSynonymsFromText(text: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const line of text.split(/\r?\n/u)) {
    const normalized = line.trim().replace(/\s+/g, " ")
    if (!normalized) {
      continue
    }
    const key = normalized.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(normalized)
  }

  return result
}

export function formatSynonymsToText(synonyms: string[]): string {
  return synonyms.join("\n")
}
