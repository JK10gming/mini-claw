// Simple rate limiter: one message per cooldown period per chat

interface RateLimitEntry {
	lastRequest: number;
}

const rateLimits = new Map<number, RateLimitEntry>();

export interface RateLimitResult {
	allowed: boolean;
	retryAfterMs?: number;
}

export function checkRateLimit(
	chatId: number,
	cooldownMs: number,
): RateLimitResult {
	const now = Date.now();
	const entry = rateLimits.get(chatId);

	if (!entry) {
		rateLimits.set(chatId, { lastRequest: now });
		return { allowed: true };
	}

	const elapsed = now - entry.lastRequest;

	if (elapsed >= cooldownMs) {
		entry.lastRequest = now;
		return { allowed: true };
	}

	return {
		allowed: false,
		retryAfterMs: cooldownMs - elapsed,
	};
}

export function resetRateLimitForTesting(): void {
	rateLimits.clear();
}
