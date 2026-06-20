/**
 * Seeded PRNG utility for deterministic melody generation.
 */
export function createRNG(seed) {
    let state = seed;
    return {
        next() {
            // mulberry32 generator
            let t = state += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
    };
}
