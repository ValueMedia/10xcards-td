/// <reference types="@cloudflare/workers-types" />

const HOURLY_LIMIT = process.env.AI_RATE_LIMIT_HOURLY ? parseInt(process.env.AI_RATE_LIMIT_HOURLY, 10) : 10;

export function rateLimitKey(userId: string, now = new Date()): string {
  const hour = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  return `ai:hourly:${userId}:${hour}`;
}

export async function checkRateLimit(
  kv: KVNamespace | null,
  userId: string,
  now = new Date(),
): Promise<{ allowed: boolean; limit: number; remaining: number }> {
  if (!kv) {
    return { allowed: false, limit: HOURLY_LIMIT, remaining: 0 };
  }

  const key = rateLimitKey(userId, now);
  const current = await kv.get(key);
  const parsed = current ? Number.parseInt(current, 10) : 0;
  const count = Number.isNaN(parsed) ? 0 : parsed;

  if (count >= HOURLY_LIMIT) {
    return { allowed: false, limit: HOURLY_LIMIT, remaining: 0 };
  }

  await kv.put(key, String(count + 1), { expirationTtl: 3600 });
  return { allowed: true, limit: HOURLY_LIMIT, remaining: HOURLY_LIMIT - count - 1 };
}
