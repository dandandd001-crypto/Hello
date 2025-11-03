import { storage } from '../storage';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const rateLimitConfigs: Record<string, RateLimitConfig> = {
  room_creation: { windowMs: 60 * 60 * 1000, maxRequests: 5 }, // 5 per hour
  chat_message: { windowMs: 60 * 1000, maxRequests: 10 }, // 10 per minute
  file_upload: { windowMs: 60 * 1000, maxRequests: 3 }, // 3 per minute
  vote: { windowMs: 5 * 60 * 1000, maxRequests: 3 }, // 3 per 5 minutes
  rejoin: { windowMs: 3 * 60 * 1000, maxRequests: 1 }, // 1 per 3 minutes
};

export async function checkRateLimit(
  ipAddress: string,
  actionType: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const config = rateLimitConfigs[actionType];
  if (!config) {
    return { allowed: true };
  }

  const existing = await storage.getRateLimit(ipAddress, actionType);
  const now = Date.now();

  if (!existing) {
    await storage.createRateLimit(ipAddress, actionType);
    return { allowed: true };
  }

  const windowStart = existing.windowStart.getTime();
  const windowEnd = windowStart + config.windowMs;

  if (now > windowEnd) {
    await storage.createRateLimit(ipAddress, actionType);
    return { allowed: true };
  }

  if (existing.count >= config.maxRequests) {
    const retryAfter = Math.ceil((windowEnd - now) / 1000);
    return { allowed: false, retryAfter };
  }

  await storage.incrementRateLimit(existing.id);
  return { allowed: true };
}

export async function cleanupOldRateLimits(): Promise<void> {
  await storage.cleanupRateLimits(60); // Clean up rate limits older than 60 minutes
}
