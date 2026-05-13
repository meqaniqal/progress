import { editorState, app, getCurrentPattern, setCurrentPattern, renderRhythmTimeline } from './rhythmEditor.js';
import { applyArpSettings } from './patternUtils.js';

export function initArpControls() {
    const applyArpBtn = document.getElementById('btn-apply-arp');
    if (!applyArpBtn) return;
    
    let styleSelect = document.getElementById('arp-style-select');
    if (!styleSelect) {
        styleSelect = document.createElement('select');
        styleSelect.id = 'arp-style-select';
        styleSelect.className = 'rhythm-select';
        styleSelect.title = 'Arpeggiator Style';
        styleSelect.innerHTML = `
            <option value="up">Up</option>
            <option value="down">Down</option>
            <option value="upDown">Up/Down</option>
            <option value="downUp">Down/Up</option>
            <option value="random">Random</option>
        `;
        applyArpBtn.parentNode.insertBefore(styleSelect, applyArpBtn.nextSibling);
    }

    let rateSelect = document.getElementById('arp-rate-select');
    if (!rateSelect) {
        rateSelect = document.createElement('select');
        rateSelect.id = 'arp-rate-select';
        rateSelect.className = 'rhythm-select';
        rateSelect.title = 'Arpeggiator Rate';
        rateSelect.innerHTML = `
            <option value="segment">Segment</option>
            <option value="1/4">1/4</option>
            <option value="1/8">1/8</option>
            <option value="1/8t">1/8t (Triplet)</option>
            <option value="1/16">1/16</option>
            <option value="1/16t">1/16t (Triplet)</option>
            <option value="1/32">1/32</option>
        `;
        styleSelect.parentNode.insertBefore(rateSelect, styleSelect.nextSibling);
    }

    function handleArpDropdownChange() {
        if (editorState.activeTab !== 'chordPattern') return;
        const pattern = getCurrentPattern();
        if (!pattern) return;

        const selectedInsts = pattern.instances.filter(i => i.isSelected);
        // Update settings in real-time if an arp is already active on the selection
        if (selectedInsts.length > 0 && selectedInsts[0].arpSettings !== null) {
            const newSettings = {
                style: styleSelect.value,
                rate: rateSelect.value,
                gate: 0.9 
            };
            app.saveHistoryState();
            setCurrentPattern(applyArpSettings(pattern, selectedInsts.map(i => i.id), newSettings));
            app.persistAppState();
            renderRhythmTimeline();
        }
    }

    styleSelect.addEventListener('change', handleArpDropdownChange);
    rateSelect.addEventListener('change', handleArpDropdownChange);

    // --- Apply / Toggle Arp Button ---
    applyArpBtn.addEventListener('click', () => {
        if (editorState.activeTab !== 'chordPattern') return;
        const pattern = getCurrentPattern();
        if (!pattern) return;

        const selectedInsts = pattern.instances.filter(i => i.isSelected);
        if (selectedInsts.length === 0) {
            alert("Please select at least one instance using the Select tool.");
            return;
        }

        // Toggle logic: If the first selected block has an arp, remove it. Otherwise, add a default arp.
        const hasArp = selectedInsts[0].arpSettings !== null;
        const newSettings = hasArp ? null : { style: styleSelect.value, rate: rateSelect.value, gate: 0.9 };

        app.saveHistoryState();
        setCurrentPattern(applyArpSettings(pattern, selectedInsts.map(i => i.id), newSettings));
        app.persistAppState();
        renderRhythmTimeline();
    });
}