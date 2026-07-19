/// <reference types="@cloudflare/workers-types" />

import type { DictionaryEntry } from "@/types";
import { getSecret } from "astro:env/server";

export const PONS_CACHE_TTL_SECONDS = 2592000;

const PONS_BASE_URL = "https://api.pons.com/v1/dictionary";
const PONS_DICT = "depl";
const PONS_LANGUAGE = "pl";
const PONS_TIMEOUT_MS = 10000;
const MAX_ENTRIES = 8;

export function ponsCacheKey(word: string): string {
  return `pons:de:${normalizeWord(word)}`;
}

function normalizeWord(word: string): string {
  return word.trim().replace(/\s+/g, "-").toLowerCase();
}

function cleanDefinition(raw: string): string {
  let def = raw.trim();
  def = def.charAt(0).toUpperCase() + def.slice(1);
  if (def.endsWith(":")) def = def.slice(0, -1);
  def = def.replace(/\s+/g, " ").trim() + ".";
  return def;
}

function stripInlineHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

// Pons `depl` JSON shape (verified against live API, 2026-07-19):
//   [{ lang, hits: [{ type, opendict, roms: [{ headword, headword_full,
//     wordclass, arabs: [{ header, translations: [{ source, target }] }] }] }] }]
// `wordclass` is the Polish part-of-speech (e.g. "rzeczownik", "czasownik
// przechodni"). The optional German sense gloss lives inside `source` wrapped
// in `<span class="sense">...</span>`; extracting it gives a usable `info`
// label that disambiguates polysemous entries. Pons `depl` has no example
// sentences or per-sense `subject` field, so `examples` is always [].
interface PonsTranslation {
  source: string;
  target: string;
}

interface PonsArab {
  header?: string;
  translations?: PonsTranslation[];
}

interface PonsRom {
  wordclass?: string;
  arabs?: PonsArab[];
}

interface PonsHit {
  roms?: PonsRom[];
}

interface PonsTopLevel {
  hits?: PonsHit[];
}

interface LookupOpts {
  kv?: KVNamespace | null;
  skipCache?: boolean;
}

export async function lookupWordDe(word: string, opts: LookupOpts = {}): Promise<DictionaryEntry[]> {
  const secret = getSecret("PONS_API_SECRET");
  if (!secret) {
    throw new Error("PONS_API_SECRET not configured");
  }

  const kv = opts.kv ?? null;
  const skipCache = opts.skipCache ?? false;
  const normalized = normalizeWord(word);

  if (kv && !skipCache) {
    const cached = await kv.get(ponsCacheKey(word), "json");
    if (cached) {
      return cached as DictionaryEntry[];
    }
  }

  const url = `${PONS_BASE_URL}?q=${encodeURIComponent(normalized)}&l=${PONS_DICT}&language=${PONS_LANGUAGE}&fm=1&ref=true`;
  const response = await fetch(url, {
    headers: { "X-Secret": secret },
    signal: AbortSignal.timeout(PONS_TIMEOUT_MS),
  });

  if (response.status === 204) {
    return [];
  }
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`Pons request failed with status ${response.status}`);
  }

  const top = (await response.json()) as PonsTopLevel[];
  const entries = mapPonsResponse(top);

  if (kv && !skipCache) {
    await kv.put(ponsCacheKey(word), JSON.stringify(entries), {
      expirationTtl: PONS_CACHE_TTL_SECONDS,
    });
  }

  return entries;
}

function mapPonsResponse(top: PonsTopLevel[]): DictionaryEntry[] {
  const entries: DictionaryEntry[] = [];

  for (const langBlock of top) {
    for (const hit of langBlock.hits ?? []) {
      for (const rom of hit.roms ?? []) {
        const type = rom.wordclass?.trim() || null;
        for (const arab of rom.arabs ?? []) {
          for (const translation of arab.translations ?? []) {
            if (entries.length >= MAX_ENTRIES) return entries;

            const definition = cleanDefinition(stripInlineHtml(translation.target));
            const info = extractSense(translation.source);

            entries.push({
              definition,
              type,
              dictionaryRegion: null,
              info,
              examples: [],
            });
          }
        }
      }
    }
  }

  return entries;
}

// Pull the German gloss out of `<span class="sense">...</span>` if present in
// the source field. Returns trimmed text or null when no sense span exists.
function extractSense(source: string): string | null {
  const match = source.match(/<span class="sense">([\s\S]*?)<\/span>/i);
  if (!match) return null;
  const text = stripInlineHtml(match[1]).trim();
  return text || null;
}
