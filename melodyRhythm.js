export function generatePhraseSubdivisions(genre, rng = null) {
    if (genre === 'none') {
        return Array(16).fill(4);
    }
    const randVal = () => (rng ? rng.next() : Math.random());
    const profiles = ['acceleration', 'deceleration', 'syncopatedAlternation', 'tripletSwing'];
    const profile = profiles[Math.floor(randVal() * profiles.length)];
    const subs = [];
    
    // Fill 16 beats (4 chords * 4 beats)
    for (let i = 0; i < 16; i++) {
        if (profile === 'acceleration') {
            if (i < 4) {
                subs.push(randVal() < 0.7 ? 2 : 1);
            } else if (i < 9) {
                subs.push(randVal() < 0.6 ? 4 : 3);
            } else if (i < 13) {
                const roll = randVal();
                subs.push(roll < 0.3 ? 6 : (roll < 0.6 ? 8 : (roll < 0.8 ? 12 : 16)));
            } else {
                subs.push(randVal() < 0.7 ? 2 : 1);
            }
        } else if (profile === 'deceleration') {
            if (i < 6) {
                const roll = randVal();
                subs.push(roll < 0.3 ? 4 : (roll < 0.6 ? 6 : (roll < 0.8 ? 8 : 12)));
            } else if (i < 12) {
                subs.push(randVal() < 0.6 ? 3 : 2);
            } else {
                subs.push(1);
            }
        } else if (profile === 'syncopatedAlternation') {
            subs.push(i % 2 === 0 ? 2 : (randVal() < 0.35 ? 8 : 4));
        } else {
            const roll = randVal();
            subs.push(roll < 0.5 ? 3 : (roll < 0.85 ? 6 : 12));
        }
    }
    return subs;
}

export function generateRhythmTemplate(aestheticMode, density, genre, rng = null) {
    if (genre === 'none') {
        return Array(16).fill(1);
    }
    const randVal = () => (rng ? rng.next() : Math.random());
    const TEMPLATES = {
        cantabile: [
            [1,0,0,0, 1,0,1,0, 1,0,0,0, 1,0,1,0],   // quarter-quarter feel
            [1,0,1,0, 0,0,1,0, 1,0,1,0, 0,0,1,0],   // offbeat lean
            [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],   // straight quarter notes
            [1,0,0,1, 1,0,0,1, 1,0,0,1, 1,0,0,1]    // gentle syncopation
        ],
        declamatory: [
            [1,0,0,1, 0,1,0,0, 1,0,0,1, 0,1,0,0],   // syncopated
            [1,1,0,1, 0,0,1,0, 1,1,0,1, 0,0,1,0],   // tight cell
            [1,0,1,0, 1,0,1,0, 1,1,0,1, 0,0,1,0]
        ],
        sighs: [
            [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],   // slow, sparse
            [1,0,0,0, 1,0,0,0, 0,0,1,0, 0,0,0,0]
        ],
        virtuoso: [
            [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],   // full runs
            [1,1,1,0, 1,1,1,0, 1,1,1,0, 1,1,0,0],   // cascading run
            [1,1,0,0, 1,1,0,0, 1,1,0,0, 1,1,0,0]
        ],
    };
    const pool = TEMPLATES[aestheticMode] || TEMPLATES.cantabile;
    return pool[Math.floor(randVal() * pool.length)];
}
