/**
 * Shows which ElevenLabs voices the curated policy would use for this account
 * (Plan15). Read-only; never prints the key.
 *
 *   npx tsx scripts/voice-doctor.ts           # config + ranked voices
 *   npx tsx scripts/voice-doctor.ts --probe   # also synthesise one short line
 */

import { buildCuratedCatalogue, type ElevenVoiceCandidate } from "../src/core/voice/elevenlabs-voice-policy";

const PROBE = process.argv.includes("--probe");
const ORIGIN = "https://api.elevenlabs.io";

function fail(message: string): never {
  console.error(`FAIL  ${message}`);
  process.exit(1);
}

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) fail("ELEVENLABS_API_KEY is not set (load .env or export it)");
  const modelEn = process.env.ELEVENLABS_MODEL_EN?.trim() || "eleven_multilingual_v2";
  const modelVi = process.env.ELEVENLABS_MODEL_VI?.trim() || "eleven_flash_v2_5";
  console.log(`ELEVENLABS_MODEL_EN  ${modelEn}`);
  console.log(`ELEVENLABS_MODEL_VI  ${modelVi}`);

  const voices: ElevenVoiceCandidate[] = [];
  let next: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({ page_size: "100", category: "premade" });
    if (next) params.set("next_page_token", next);
    const response = await fetch(`${ORIGIN}/v2/voices?${params}`, { headers: { "xi-api-key": apiKey } });
    if (!response.ok) fail(`GET /v2/voices -> HTTP ${response.status}`);
    const payload = (await response.json()) as { voices?: ElevenVoiceCandidate[]; has_more?: boolean; next_page_token?: string };
    voices.push(...(payload.voices ?? []));
    if (!payload.has_more || !payload.next_page_token) break;
    next = payload.next_page_token;
  }
  console.log(`premade voices on account: ${voices.length}`);
  const catalogue = buildCuratedCatalogue(voices);
  for (const key of ["en-US", "en-GB", "vi"] as const) {
    console.log(`\n[${key}]`);
    if (!catalogue[key].length) console.log("  (no acceptable voice)");
    for (const voice of catalogue[key]) {
      console.log(`  ${voice.tier.padEnd(4)} ${String(voice.score).padStart(4)}  ${voice.id}  ${voice.name} — ${voice.subtitle}`);
    }
  }
  const legacy = voices.filter((voice) => /^(rachel|sarah|george|brian|daniel|alice|matilda|lily|laura|liam|chris|bill|roger|eric|will|jessica|callum|charlie|harry|river)\b/i.test(voice.name));
  if (legacy.length) console.log(`\nnote: ${legacy.length} legacy Default voices present; they expire 2026-12-31 (ElevenLabs).`);

  if (PROBE) {
    const pick = catalogue["en-US"][0] ?? catalogue["en-GB"][0];
    if (!pick) fail("no English voice to probe");
    const response = await fetch(`${ORIGIN}/v1/text-to-speech/${pick.id}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hello! Welcome to ListenAI.", model_id: modelEn, language_code: "en" }),
    });
    if (!response.ok) fail(`text-to-speech -> HTTP ${response.status}`);
    const bytes = (await response.arrayBuffer()).byteLength;
    console.log(`\nprobe OK: ${pick.name} (${modelEn}) -> ${bytes} bytes of audio`);
  }
  console.log("\nOK");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
