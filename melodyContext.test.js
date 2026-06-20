import { defaultContext } from './melodyContext.js';

describe('melodyContext State Manager', () => {
    test('defaultContext returns a fresh context object with all ~33 parameters initialized', () => {
        const ctx = defaultContext();
        expect(ctx).toBeDefined();
        expect(ctx.activeAestheticMode).toBe('cantabile');
        expect(ctx.globalMelodyHistory).toEqual([]);
        expect(ctx.narrativeState).toEqual({
            consecutiveSteps: 0,
            lowRegisterBars: 0,
            motifRepeats: 0,
            phraseSubdivisions: []
        });
    });

    test('defaultContext uses the provided rng, or defaults to Math.random', () => {
        const customRng = { next: () => 0.5 };
        const ctxWithCustom = defaultContext(customRng);
        expect(ctxWithCustom.rng).toBe(customRng);
        expect(ctxWithCustom.rng.next()).toBe(0.5);

        const ctxDefault = defaultContext();
        expect(ctxDefault.rng).toBeDefined();
        expect(ctxDefault.rng.next).toBeDefined();
        const randVal = ctxDefault.rng.next();
        expect(randVal).toBeGreaterThanOrEqual(0);
        expect(randVal).toBeLessThan(1);
    });
});
