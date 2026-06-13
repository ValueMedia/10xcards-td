/// <reference types="@cloudflare/workers-types" />

const HOURLY_LIMIT = 10;

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
    return { allowed: true, limit: HOURLY_LIMIT, remaining: HOURLY_LIMIT };
  }

  const key = rateLimitKey(userId, now);
  const current = await kv.get(key);
  const count = current ? parseInt(current, 10) : 0;

  if (count >= HOURLY_LIMIT) {
    return { allowed: false, limit: HOURLY_LIMIT, remaining: 0 };
  }

  await kv.put(key, String(count + 1), { expirationTtl: 3600 });
  return { allowed: true, limit: HOURLY_LIMIT, remaining: HOURLY_LIMIT - count - 1 };
}
