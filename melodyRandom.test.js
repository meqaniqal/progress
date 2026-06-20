import { createRNG } from './melodyRandom.js';

describe('melodyRandom PRNG', () => {
    test('creates a generator that produces deterministic values', () => {
        const seed = 42;
        const rng1 = createRNG(seed);
        const rng2 = createRNG(seed);

        const seq1 = [rng1.next(), rng1.next(), rng1.next()];
        const seq2 = [rng2.next(), rng2.next(), rng2.next()];

        expect(seq1).toEqual(seq2);
    });

    test('produces values in range [0, 1)', () => {
        const rng = createRNG(12345);
        for (let i = 0; i < 1000; i++) {
            const val = rng.next();
            expect(val).toBeGreaterThanOrEqual(0);
            expect(val).toBeLessThan(1);
        }
    });

    test('different seeds produce different sequences', () => {
        const rng1 = createRNG(1);
        const rng2 = createRNG(2);

        const seq1 = [rng1.next(), rng1.next(), rng1.next()];
        const seq2 = [rng2.next(), rng2.next(), rng2.next()];

        expect(seq1).not.toEqual(seq2);
    });
});
