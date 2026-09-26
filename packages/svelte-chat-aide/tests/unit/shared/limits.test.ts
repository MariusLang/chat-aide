import { describe, it, expect } from 'vitest';
import { LIMIT_DEFAULTS, LIMIT_CEILINGS, type LimitName } from '../../../src/lib/shared/limits';
import { resolveConfig, AideConfigError } from '../../../src/lib/shared/schemas';

const provider = { name: 'anthropic', model: 'm', apiKey: 'k' };
const names = Object.keys(LIMIT_DEFAULTS) as LimitName[];

describe('limits', () => {
	it('every default sits at or below its ceiling', () => {
		for (const name of names) expect(LIMIT_DEFAULTS[name]).toBeLessThanOrEqual(LIMIT_CEILINGS[name]);
		expect(Object.keys(LIMIT_CEILINGS).sort()).toEqual([...names].sort());
	});

	// 2
	it.each(names)('accepts a developer value for %s', (name) => {
		for (const value of [LIMIT_CEILINGS[name] - 1, 1]) {
			const c = resolveConfig({ provider, limits: { [name]: value } });
			expect(c.limits[name]).toBe(value);
			for (const other of names) if (other !== name) expect(c.limits[other]).toBe(LIMIT_DEFAULTS[other]);
		}
	});

	// 3
	it.each(names)('refuses %s above its ceiling unless the ceiling is raised', (name) => {
		const value = LIMIT_CEILINGS[name] + 1;
		let err: unknown;
		try {
			resolveConfig({ provider, limits: { [name]: value } });
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(AideConfigError);
		expect((err as AideConfigError).path).toBe(`limits.${name}`);
		expect((err as Error).message.startsWith(`limits.${name}: `)).toBe(true);

		const c = resolveConfig({ provider, limits: { [name]: value }, limitCeilings: { [name]: value } });
		expect(c.limits[name]).toBe(value);
	});
});
