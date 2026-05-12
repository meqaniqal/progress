// Initialize the mobile drag-and-drop polyfill
MobileDragDrop.polyfill({ dragImageTranslateOverride: MobileDragDrop.scrollBehaviourDragImageTranslateOverride });

// --- Chrome Mobile Scroll Performance Fix ---
// A global non-passive touchmove listener causes sluggish scrolling in empty areas of the UI.
// We isolate the performance penalty by dynamically attaching it ONLY when interacting with draggable elements.
const dummyTouchMove = function(e) {};

window.addEventListener('touchstart', (e) => {
    if (e.target.closest('.chord-btn, .progression-item, .bracket-element')) {
        window.addEventListener('touchmove', dummyTouchMove, { passive: false });
    }
}, { passive: true });

const cleanupTouchMove = () => {
    window.removeEventListener('touchmove', dummyTouchMove);
};

window.addEventListener('touchend', cleanupTouchMove, { passive: true });
window.addEventListener('touchcancel', cleanupTouchMove, { passive: true });

// Auto-generate cache-busting version number for mobile devices
const version = new Date().getTime();

// Generate an Import Map to apply cache-busting to all internal ES Module imports automatically
const jsFiles = [
    'arp', 'chordDictionary', 'config', 'dragdrop', 'midi', 'patternUtils',
    'progressmain', 'promptGenerator', 'rhythmEditor', 'sequencer', 'stateUtils', 
    'storage', 'store', 'synth', 'theory', 'ui', 'wavEncoder', 'wavExport'
];

const imports = {};
jsFiles.forEach(file => {
    imports[`./${file}.js`] = `./${file}.js?v=${version}`;
});

const mapScript = document.createElement('script');
mapScript.type = 'importmap';
mapScript.textContent = JSON.stringify({ imports });
document.head.appendChild(mapScript);

const script = document.createElement('script');
script.type = 'module';
script.src = `./progressmain.js`; // The import map will append the version automatically
document.head.appendChild(script);