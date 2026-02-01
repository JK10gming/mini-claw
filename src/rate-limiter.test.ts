import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, resetRateLimitForTesting } from "./rate-limiter.js";

describe("rate-limiter", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetRateLimitForTesting();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("allows first request", () => {
		const result = checkRateLimit(123, 5000);
		expect(result.allowed).toBe(true);
		expect(result.retryAfterMs).toBeUndefined();
	});

	it("blocks request within cooldown period", () => {
		checkRateLimit(123, 5000);

		vi.advanceTimersByTime(2000); // 2 seconds later

		const result = checkRateLimit(123, 5000);
		expect(result.allowed).toBe(false);
		expect(result.retryAfterMs).toBe(3000); // 5000 - 2000 = 3000ms remaining
	});

	it("allows request after cooldown expires", () => {
		checkRateLimit(123, 5000);

		vi.advanceTimersByTime(5000); // exactly 5 seconds later

		const result = checkRateLimit(123, 5000);
		expect(result.allowed).toBe(true);
	});

	it("allows request after cooldown fully passes", () => {
		checkRateLimit(123, 5000);

		vi.advanceTimersByTime(6000); // 6 seconds later

		const result = checkRateLimit(123, 5000);
		expect(result.allowed).toBe(true);
	});

	it("tracks different chats independently", () => {
		checkRateLimit(123, 5000);

		// Different chat should be allowed immediately
		const result = checkRateLimit(456, 5000);
		expect(result.allowed).toBe(true);
	});

	it("respects custom cooldown values", () => {
		checkRateLimit(123, 10000); // 10 second cooldown

		vi.advanceTimersByTime(5000);

		const result = checkRateLimit(123, 10000);
		expect(result.allowed).toBe(false);
		expect(result.retryAfterMs).toBe(5000);

		vi.advanceTimersByTime(5000);

		const result2 = checkRateLimit(123, 10000);
		expect(result2.allowed).toBe(true);
	});

	it("updates timestamp on allowed request", () => {
		checkRateLimit(123, 5000);
		vi.advanceTimersByTime(5000);

		// This should be allowed and reset the timer
		const result1 = checkRateLimit(123, 5000);
		expect(result1.allowed).toBe(true);

		// Immediately after, should be blocked again
		const result2 = checkRateLimit(123, 5000);
		expect(result2.allowed).toBe(false);
		expect(result2.retryAfterMs).toBe(5000);
	});
});
