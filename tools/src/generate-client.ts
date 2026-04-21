/**
 * API client generator.
 * Generates a typed fetch client from the back OpenAPI/route definitions.
 * TODO: implement generation logic when API routes are stabilized.
 */

export async function generateClient(outputPath: string): Promise<void> {
  console.log(`[generate-client] Output path: ${outputPath}`);
  console.log('[generate-client] Not implemented yet.');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const output = process.argv[2] ?? '../front/src/api/client.ts';
  generateClient(output).catch(console.error);
}
