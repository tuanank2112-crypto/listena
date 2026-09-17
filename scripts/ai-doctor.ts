/**
 * Checks the configured AI provider against the live catalogue.
 *
 * Exists because a `KIRAAI_MODEL` naming a model the provider does not have
 * silently disabled every tutor feature for a long time: the request failed
 * with 404 `model_not_found`, the app reported its generic "try again later"
 * state, and no test caught it because every test uses a deterministic
 * provider that never touches the real catalogue.
 *
 * Read-only. It lists models and optionally sends one tiny completion; it
 * never prints the API key and never writes anything.
 *
 *   npx tsx scripts/ai-doctor.ts           # config + catalogue check
 *   npx tsx scripts/ai-doctor.ts --probe   # also send one minimal completion
 */

type CatalogueModel = {
  id?: unknown;
  status?: unknown;
  is_free?: unknown;
  type?: unknown;
};

const PROBE = process.argv.includes("--probe");

function fail(message: string): never {
  console.error(`FAIL  ${message}`);
  process.exit(1);
}

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

async function main() {
  const provider = readEnv("AI_PROVIDER") ?? "(unset)";
  console.log(`AI_PROVIDER      ${provider}`);

  if (provider !== "kira") {
    console.log("Only the kira provider is checked by this script; nothing to do.");
    return;
  }

  const apiKey = readEnv("KIRAAI_API_KEY");
  const baseUrl = readEnv("KIRAAI_BASE_URL") ?? "https://kiraai.vn/api/v1";
  const model = readEnv("KIRAAI_MODEL");

  console.log(`KIRAAI_BASE_URL  ${baseUrl}`);
  console.log(`KIRAAI_MODEL     ${model ?? "(unset -> provider default)"}`);
  console.log(`KIRAAI_API_KEY   ${apiKey ? `present (${apiKey.length} chars)` : "MISSING"}`);
  console.log();

  if (!apiKey) fail("KIRAAI_API_KEY is not set, so no tutor call can succeed.");

  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (response.status === 401 || response.status === 403) {
    fail(`credentials rejected by ${baseUrl}/models (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    fail(`could not read the catalogue: HTTP ${response.status} from ${baseUrl}/models.`);
  }

  const body = (await response.json()) as { data?: CatalogueModel[] };
  const catalogue = Array.isArray(body.data) ? body.data : [];
  if (catalogue.length === 0) fail("the catalogue came back empty.");

  const ids = new Set(
    catalogue.map((m) => (typeof m.id === "string" ? m.id : "")).filter(Boolean),
  );
  console.log(`catalogue        ${ids.size} models, credentials accepted`);

  const freeActive = catalogue
    .filter((m) => m.is_free === true && m.status === "active")
    .map((m) => String(m.id));
  console.log(
    `free + active    ${freeActive.length ? freeActive.join(", ") : "none right now"}`,
  );
  console.log();

  if (!model) {
    console.log("WARN  KIRAAI_MODEL is unset; the in-code default is used.");
    console.log("      Set it explicitly so the deployment does not drift.");
    return;
  }

  if (!ids.has(model)) {
    const chat = catalogue
      .filter((m) => m.type === "chat" && m.status === "active")
      .map((m) => String(m.id));
    console.error(`FAIL  KIRAAI_MODEL "${model}" is NOT in the catalogue.`);
    console.error("      Every tutor call will fail with 404 model_not_found.");
    console.error(`      Active chat models: ${chat.join(", ")}`);
    process.exit(1);
  }

  const entry = catalogue.find((m) => m.id === model);
  const status = typeof entry?.status === "string" ? entry.status : undefined;
  console.log(
    `model "${model}" found; status=${status ?? "(not reported)"} free=${String(entry?.is_free ?? "(not reported)")}`,
  );
  // Not every provider reports a status field. Only an explicit non-active
  // value is a failure; a missing one is simply unknown.
  if (status && status !== "active") {
    console.error(`FAIL  model "${model}" is not active (status=${status}).`);
    process.exit(1);
  }

  if (!PROBE) {
    console.log("\nOK    configuration is consistent with the catalogue.");
    console.log("      Re-run with --probe to also send one minimal completion.");
    return;
  }

  const probe = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with OK." }],
      max_tokens: 8,
    }),
  });

  if (probe.status === 429) {
    console.log("\nWARN  probe was rate limited (429). The model exists but the");
    console.log("      current tier throttles hard; expect intermittent failures.");
    return;
  }
  if (!probe.ok) {
    fail(`probe completion failed with HTTP ${probe.status}.`);
  }

  console.log("\nOK    probe completion succeeded; the tutor path is reachable.");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
