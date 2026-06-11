const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Melody Pitch
const melodyTarget = `<div class="mixer-row" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                            <span class="settings-label-sm" style="width: 80px; font-size: 11px;">Pitch</span>
                                            <input type="range" id="melody-pitch" min="-24" max="24" step="1" value="0" style="flex: 1;" class="mixer-slider">
                                            <span id="melody-pitch-val" style="font-size: 11px; font-family: monospace; min-width: 35px; text-align: right;">+0st</span>
                                        </div>`;

const melodyReplacement = `<div class="mixer-row" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                            <span class="settings-label-sm" style="width: 80px; font-size: 11px;">Pitch</span>
                                            <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
                                                <button class="octave-btn" data-target="melody-pitch" data-dir="down" style="background: var(--bg-body); border: 1px solid var(--border-main); color: var(--text-main); border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 10px; font-weight: bold; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;" title="Octave Down">◀</button>
                                                <input type="range" id="melody-pitch" min="-24" max="24" step="1" value="0" style="flex: 1;" class="mixer-slider">
                                                <button class="octave-btn" data-target="melody-pitch" data-dir="up" style="background: var(--bg-body); border: 1px solid var(--border-main); color: var(--text-main); border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 10px; font-weight: bold; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;" title="Octave Up">▶</button>
                                            </div>
                                            <span id="melody-pitch-val" style="font-size: 11px; font-family: monospace; min-width: 35px; text-align: right;">+0st</span>
                                        </div>`;

// 2. Countermelody Pitch
const countermelodyTarget = `<div class="mixer-row" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                        <span class="settings-label-sm" style="width: 80px; font-size: 11px;">Pitch</span>
                                        <input type="range" id="countermelody-pitch" min="-24" max="24" step="1" value="0" style="flex: 1;" class="mixer-slider">
                                        <span id="countermelody-pitch-val" style="font-size: 11px; font-family: monospace; min-width: 35px; text-align: right;">+0st</span>
                                    </div>`;

const countermelodyReplacement = `<div class="mixer-row" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                        <span class="settings-label-sm" style="width: 80px; font-size: 11px;">Pitch</span>
                                        <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
                                            <button class="octave-btn" data-target="countermelody-pitch" data-dir="down" style="background: var(--bg-body); border: 1px solid var(--border-main); color: var(--text-main); border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 10px; font-weight: bold; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;" title="Octave Down">◀</button>
                                            <input type="range" id="countermelody-pitch" min="-24" max="24" step="1" value="0" style="flex: 1;" class="mixer-slider">
                                            <button class="octave-btn" data-target="countermelody-pitch" data-dir="up" style="background: var(--bg-body); border: 1px solid var(--border-main); color: var(--text-main); border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 10px; font-weight: bold; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;" title="Octave Up">▶</button>
                                        </div>
                                        <span id="countermelody-pitch-val" style="font-size: 11px; font-family: monospace; min-width: 35px; text-align: right;">+0st</span>
                                    </div>`;

if (html.includes(melodyTarget)) {
    html = html.replace(melodyTarget, melodyReplacement);
    console.log("Replaced melody pitch section.");
} else {
    console.error("Melody pitch section target NOT found.");
}

if (html.includes(countermelodyTarget)) {
    html = html.replace(countermelodyTarget, countermelodyReplacement);
    console.log("Replaced countermelody pitch section.");
} else {
    console.error("Countermelody pitch section target NOT found.");
}

fs.writeFileSync(htmlPath, html, 'utf8');
console.log("Successfully wrote index.html.");
