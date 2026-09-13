type BrowserCrypto = {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array) => Uint8Array;
};

let fallbackSequence = 0;

function uuidFromRandomValues(cryptoSource: BrowserCrypto) {
  if (!cryptoSource.getRandomValues) return null;
  const bytes = cryptoSource.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function makeClientUuid(
  cryptoSource: BrowserCrypto | undefined = globalThis.crypto,
) {
  if (cryptoSource?.randomUUID) {
    try {
      return cryptoSource.randomUUID();
    } catch {
      // Some insecure browser contexts expose the method but reject the call.
    }
  }

  if (cryptoSource) {
    try {
      const uuid = uuidFromRandomValues(cryptoSource);
      if (uuid) return uuid;
    } catch {
      // Continue to the last-resort identifier below.
    }
  }

  fallbackSequence += 1;
  const seed = Date.now() + fallbackSequence;
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor((Math.random() * 256 + seed + index) % 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function makeClientId(
  prefix: string,
  cryptoSource: BrowserCrypto | undefined = globalThis.crypto,
) {
  return `${prefix}-${makeClientUuid(cryptoSource)}`;
}

/** A raw UUID is required by the session-start idempotency contract. */
export function makeClientStartId(
  cryptoSource: BrowserCrypto | undefined = globalThis.crypto,
) {
  return makeClientUuid(cryptoSource);
}
