const FIXED_SUGGESTIONS = {
    mournful: [
        'iv', 'bVI', 'ii°7', 'i7', 'bvi', 'vm9', 'v', 'iv7', 'bIII', 'bIIImaj7', 'iiø7', 'bVImaj7'
    ],
    luminous: [
        'II', 'Imaj7', 'V9', 'III', 'VI', 'Imaj9', 'Vmaj7', 'Vsus2', 'Iadd9', 'vii7b5', 'IIImaj7', 'VImaj7'
    ],
    heroic: [
        'bVII', 'V7sus4', 'bVII7', 'I7', 'IV7', 'II7', 'v7', 'bVIImaj7', 'I9', 'IV9', 'V7', 'bVIIadd9'
    ],
    nostalgic: [
        'IVmaj7', 'vi9', 'vi7', 'ii9', 'bVII9', 'IVmaj9', 'vi11', 'IVadd9', 'ii7', 'I6', 'IV6', 'viadd9'
    ],
    mysterious: [
        'IV', 'Isus2', 'Vsus4', 'ii13', 'IVsus2', 'bVIImaj9', 'bIIImaj7add9', 'i6', 'ivmaj7', 'bIII6', 'ii7b5', 'im9'
    ],
    ethereal: [
        'Imaj7#11', 'iii7b5', 'bVImaj7#11', 'vi7b5', 'Imaj9#11', 'IVmaj7#11', 'Vsus4#11', 'vii7', 'III7#5', 'bIIImaj7#11', 'bVIImaj7#11', 'Iadd9#11'
    ],
    ominous: [
        'bII', 'vii°7', 'I7b9', 'v°', 'bV', 'bIImaj7', 'vii°', 'i°7', 'bVmaj7', 'IV7b9', 'V7b9', '#I°7'
    ],
    baroque: [
        'V7/V', 'V7/vi', 'I', 'vii°/V', 'V7/ii', 'V7/iii', 'V7/IV', 'V/V', 'V/vi', 'V/ii', 'vii°/vi', 'ii°'
    ],
    cosmic: [
        'bIIImaj9', 'bVImaj9', 'bIIIadd9', 'bVIadd9', 'II9', 'IV7#11', 'V7/bIII', 'V7/bVI', 'vii°9', 'bIIImaj7#5', 'bVImaj7#5', 'Imaj7#5'
    ],
    soulful: [
        'I#°', 'ii11', 'V7alt', 'Imaj13', 'IVmaj13', 'vi13', 'ii13sus2', 'V13', 'bVII13', 'I9sus4', 'IV9sus4', 'vi9sus4'
    ],
    exotic: [
        'bII6', 'vii7#5', 'bV6', '#IV7b9', 'vii°6', 'bIImaj7b5', 'vii7b5#9', 'v7b5b9', '#i7b5', '#iv7b5', 'bV7b9', 'bII7b9'
    ],
    tension: [
        'I7#9', 'V7b13', 'I7b13', 'V7#9#5', 'vii°7/V', 'vii°7/vi', 'V7#5', 'bII7#9', 'bV7#9', '#IV°7/V', 'Vsus4b9', 'V7#9b13'
    ],
    dreamy: [
        'Imaj11', 'bVImaj9#11', 'IVmaj11', 'Imaj7b5', 'IVmaj7b5', 'bIIImaj9#11', 'bVIImaj9#11', 'ii9sus4', 'bIII13', 'bVI13', 'Imaj9#5', 'bIIImaj9#5'
    ],
    hopeful: [
        'Iadd11', 'IVadd11', 'Vadd11', 'viadd11', 'iiadd9', 'iiiadd9', 'iii7', 'V7sus2', 'vi7b5#9', 'ii7b5#11', 'IVadd9#11', 'Vadd9#11'
    ],
    cyberpunk: [
        'i', 'vii9', 'iv9', 'v9', 'im11', '#i', '#iv', 'bvi9', 'viiø9', 'im13', 'ivm13', 'v6'
    ],
    alien: [
        'bVmaj9', 'I7b5', 'iii7b5#9', 'bIImaj7#11', 'bVImaj11#11', '#I°9', 'bIIImaj11#11', 'bVIImaj11#11', 'Imaj9#5#11', 'ii7b5#9', 'vii7b5#11', '#IV7'
    ],
    neutral: [
        'ii', 'iii', 'vi', 'I5', 'IV5', 'V5', 'vi5', 'ii5', 'iii5', 'I6/9', 'IV6/9', 'V6/9'
    ],
    spectral: [
        'Imaj13#11', 'II13', 'V7b5', 'Imaj9#11b5', 'IVmaj13#11', 'Vsus4#11b5', 'Imaj13#5', 'bIIImaj13#11', 'bVImaj13#11', 'II7#5', 'bVIImaj13#11', 'Imaj7b5#11'
    ]
};

// Check for duplicates
const allSymbols = {};
const duplicates = [];

for (const cat in FIXED_SUGGESTIONS) {
    for (const sym of FIXED_SUGGESTIONS[cat]) {
        if (allSymbols[sym]) {
            duplicates.push({ symbol: sym, categories: [allSymbols[sym], cat] });
        } else {
            allSymbols[sym] = cat;
        }
    }
}

if (duplicates.length > 0) {
    console.log("DUPLICATES FOUND:");
    console.log(duplicates);
} else {
    console.log("CONGRATULATIONS: Zero duplicates found across all categories!");
}
