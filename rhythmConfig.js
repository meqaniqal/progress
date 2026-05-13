export const GRID_STEPS = [
    { label: '1/4', value: 0.25 },
    { label: '1/4T', value: 0.25 * (2/3) },
    { label: '1/8', value: 0.125 },
    { label: '1/8T', value: 0.125 * (2/3) },
    { label: '1/16', value: 0.0625 }
];

export const DRUM_ROWS = ['ohh', 'chh', 'snare', 'kick'];

export const DRUM_ROW_BG_COLORS = {
    'ohh': 'rgba(252, 211, 77, 0.05)',
    'chh': 'rgba(245, 158, 11, 0.05)',
    'snare': 'rgba(59, 130, 246, 0.05)',
    'kick': 'rgba(239, 68, 68, 0.05)'
};

export const DRUM_LABELS = {
    'ohh': 'OH',
    'chh': 'CH',
    'snare': 'SN',
    'kick': 'BD'
};

export const DRUM_PRESETS = {
    'blank': [],
    'house': [
        { time: 0.0, row: 'kick' }, { time: 0.25, row: 'kick' }, { time: 0.5, row: 'kick' }, { time: 0.75, row: 'kick' },
        { time: 0.25, row: 'snare' }, { time: 0.75, row: 'snare' },
        { time: 0.125, row: 'ohh' }, { time: 0.375, row: 'ohh' }, { time: 0.625, row: 'ohh' }, { time: 0.875, row: 'ohh' }
    ],
    'hiphop': [
        { time: 0.0, row: 'kick' }, { time: 0.625, row: 'kick' }, 
        { time: 0.25, row: 'snare' }, { time: 0.75, row: 'snare' },
        { time: 0.0, row: 'chh' }, { time: 0.125, row: 'chh' }, { time: 0.25, row: 'chh' }, { time: 0.375, row: 'chh' }, { time: 0.5, row: 'chh' }, { time: 0.625, row: 'chh' }, { time: 0.75, row: 'chh' }, { time: 0.875, row: 'chh' }
    ],
    'breakbeat': [
        { time: 0.0, row: 'kick' }, { time: 0.375, row: 'kick' }, { time: 0.5, row: 'kick' },
        { time: 0.25, row: 'snare' }, { time: 0.75, row: 'snare' }, { time: 0.875, row: 'snare', velocity: 0.5 },
        { time: 0.0, row: 'chh' }, { time: 0.25, row: 'chh' }, { time: 0.5, row: 'chh' }, { time: 0.75, row: 'chh' }
    ],
    'dnb': [
        { time: 0.0, row: 'kick' }, { time: 0.625, row: 'kick' },
        { time: 0.25, row: 'snare' }, { time: 0.4375, row: 'snare', velocity: 0.4 }, { time: 0.75, row: 'snare' }, { time: 0.875, row: 'snare', velocity: 0.3 },
        { time: 0.0, row: 'chh' }, { time: 0.125, row: 'chh' }, { time: 0.25, row: 'chh' }, { time: 0.375, row: 'chh' }, { time: 0.5, row: 'chh' }, { time: 0.625, row: 'chh' }, { time: 0.75, row: 'chh' }, { time: 0.875, row: 'chh' }
    ],
    'bossanova': [
        { time: 0.0, row: 'kick' }, { time: 0.375, row: 'kick', velocity: 0.6 }, { time: 0.5, row: 'kick' }, { time: 0.875, row: 'kick', velocity: 0.6 },
        { time: 0.0, row: 'snare' }, { time: 0.1875, row: 'snare' }, { time: 0.375, row: 'snare' }, { time: 0.625, row: 'snare' }, { time: 0.8125, row: 'snare' },
        { time: 0.0, row: 'chh', velocity: 0.8 }, { time: 0.125, row: 'chh', velocity: 0.5 }, { time: 0.25, row: 'chh', velocity: 0.8 }, { time: 0.375, row: 'chh', velocity: 0.5 }, { time: 0.5, row: 'chh', velocity: 0.8 }, { time: 0.625, row: 'chh', velocity: 0.5 }, { time: 0.75, row: 'chh', velocity: 0.8 }, { time: 0.875, row: 'chh', velocity: 0.5 }
    ],
    'lofi': [
        { time: 0.0, row: 'kick', velocity: 0.8 }, { time: 0.4375, row: 'kick', velocity: 0.5 }, { time: 0.625, row: 'kick', velocity: 0.7 },
        { time: 0.25, row: 'snare', velocity: 0.9 }, { time: 0.75, row: 'snare', velocity: 0.9 },
        { time: 0.0, row: 'chh', velocity: 0.8 }, { time: 0.125, row: 'chh', velocity: 0.4 }, { time: 0.25, row: 'chh', velocity: 0.8 }, { time: 0.375, row: 'chh', velocity: 0.4 }, { time: 0.5, row: 'chh', velocity: 0.8 }, { time: 0.625, row: 'chh', velocity: 0.4 }, { time: 0.75, row: 'chh', velocity: 0.8 }, { time: 0.875, row: 'chh', velocity: 0.4 },
        { time: 0.1875, row: 'ohh', velocity: 0.6, probability: 0.5 }, { time: 0.6875, row: 'ohh', velocity: 0.6, probability: 0.5 }
    ]
};