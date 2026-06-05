import { getPlayableNotes, getAlternatives, getTurnaroundSuggestions, getEffectiveTuning, getChordNotes, getChordSignature, getModulationLabel, getDynamicProgSuggestions, getProceduralCategory, getCategoryIndex, HAND_CURATED_CATEGORIES } from './theory.js';
import { KEY_NAMES } from './ui.js';
import { persistAppState } from './store.js';

let isInspectorDelegated = false;
let currentUIState = null;
let currentUICallbacks = null;

function handleInspectorClick(e) {
    if (!currentUICallbacks || !currentUIState) return;
    const btn = e.target.closest('button');
    if (!btn || !btn.dataset.action) return;

    const action = btn.dataset.action;
    const index = parseInt(btn.dataset.index, 10);

    switch (action) {
        case 'swap':
            const orig = currentUIState.currentProgression[index];
            const isAudition = currentUIState.editorState.isAuditionEnabled;
            if (isAudition) {
                if (currentUICallbacks.onAuditionThreeChordSequence) {
                    currentUICallbacks.onAuditionThreeChordSequence(index, btn.dataset.alt, btn.dataset.key ? parseInt(btn.dataset.key, 10) : undefined);
                }
            } else {
                currentUICallbacks.onSwapChord(index, btn.dataset.alt, orig, btn.dataset.key ? parseInt(btn.dataset.key, 10) : undefined);
            }
            break;
        case 'reset-swap':
            const originalChord = currentUIState.currentProgression[index];
            currentUICallbacks.onSwapChord(index, originalChord.symbol, originalChord);
            break;
        case 'transpose':
            currentUICallbacks.onTransposeChord(index);
            break;
        case 'duration':
            currentUICallbacks.onChangeDuration(index, Number(btn.dataset.duration));
            break;
        case 'delete':
            currentUICallbacks.onRemoveChord(index);
            break;
        case 'turnaround':
            currentUICallbacks.onAddTurnaround(index, btn.dataset.alt, parseInt(btn.dataset.key, 10));
            break;
        case 'step-inversion':
            const direction = parseInt(btn.dataset.direction, 10);
            currentUICallbacks.onStepInversion(index, direction);
            break;
        case 'set-global-voicing':
            currentUICallbacks.onSetGlobalVoicing(btn.dataset.val);
            break;
        case 'change-chord-key-step':
            const currKey = parseInt(btn.dataset.currentKey, 10);
            const step = parseInt(btn.dataset.direction, 10);
            let newKey = currKey + step;
            if (newKey < 60) newKey = 71;
            if (newKey > 71) newKey = 60;
            currentUICallbacks.onChangeChordKey(index, newKey);
            break;
    }
}

function handleInspectorDblClick(e) {
    if (!currentUICallbacks || !currentUIState) return;
    const btn = e.target.closest('button');
    if (!btn || !btn.dataset.action) return;

    const action = btn.dataset.action;
    const index = parseInt(btn.dataset.index, 10);

    if (action === 'swap') {
        const isAudition = currentUIState.editorState.isAuditionEnabled;
        if (isAudition) {
            const orig = currentUIState.currentProgression[index];
            currentUICallbacks.onSwapChord(index, btn.dataset.alt, orig, btn.dataset.key ? parseInt(btn.dataset.key, 10) : undefined);
        }
    }
}

function handleInspectorChange(e) {
    if (!currentUICallbacks) return;
    const select = e.target;
    if (select.tagName === 'SELECT' && select.dataset.action === 'changeChordKey') {
        const index = parseInt(select.dataset.index, 10);
        currentUICallbacks.onChangeChordKey(index, parseInt(select.value, 10));
    } else if (select.tagName === 'INPUT' && select.dataset.action === 'duration-slider') {
        const index = parseInt(select.dataset.index, 10);
        currentUICallbacks.onChangeDuration(index, parseInt(select.value, 10));
    } else if (select.tagName === 'INPUT' && select.dataset.action === 'voicing-slider') {
        const index = parseInt(select.dataset.index, 10);
        const types = ['global', 'auto', 'close', 'quartal', 'spread'];
        const val = Math.round(parseFloat(select.value));
        currentUICallbacks.onChangeVoicingType(index, types[val]);
    }
}

function handleInspectorInput(e) {
    if (!currentUICallbacks || !currentUIState) return;
    const target = e.target;
    if (target.tagName === 'INPUT' && target.dataset.action === 'duration-slider') {
        const label = document.getElementById('dur-label-' + target.dataset.index);
        if (label) label.innerHTML = `<strong>Beats:</strong> ${target.value}`;
    } else if (target.tagName === 'INPUT' && target.dataset.action === 'voicing-slider') {
        const val = Math.round(parseFloat(target.value));
        const label = document.getElementById('voicing-label-' + target.dataset.index);
        const types = ['Global', 'Auto', 'Close', 'Quartal', 'Spread'];
        const valStrings = ['global', 'auto', 'close', 'quartal', 'spread'];
        if (label) label.innerHTML = `<strong>Voicing:</strong> ${types[val]}`;

        const setGlobalBtn = document.querySelector(`.set-global-btn[data-index="${target.dataset.index}"]`);
        if (setGlobalBtn) {
            setGlobalBtn.title = `Set '${types[val]}' as the new master default`;
            setGlobalBtn.dataset.val = valStrings[val];
            setGlobalBtn.style.display = val === 0 ? 'none' : 'inline-block';
        }
    }
}

export function renderChordInspector(state, selectedChordIndex, callbacks) {
    const panel = document.getElementById('inspector-section');
    if (!panel) return;

    if (!state) state = currentUIState;
    if (callbacks && Object.keys(callbacks).length > 0) {
        currentUICallbacks = callbacks;
    } else {
        callbacks = currentUICallbacks;
    }

    if (selectedChordIndex === undefined || selectedChordIndex === null) {
        selectedChordIndex = state ? state.selectedChordIndex : null;
    }

    if (!state || selectedChordIndex === null || !state.currentProgression[selectedChordIndex]) {
        panel.style.display = 'none';
        return;
    }

    currentUIState = state;
    currentUICallbacks = callbacks;

    panel.style.display = 'block';
    const content = document.getElementById('inspector-content');

    if (!isInspectorDelegated) {
        isInspectorDelegated = true;
        panel.addEventListener('click', handleInspectorClick);
        panel.addEventListener('dblclick', handleInspectorDblClick);
        panel.addEventListener('change', handleInspectorChange);
        panel.addEventListener('input', handleInspectorInput);
    }

    // Get active signatures (excluding the currently edited chord) for context dimming
    const activeSignatures = new Set();
    state.currentProgression.forEach((c, i) => {
        if (i === selectedChordIndex) return; // Skip the active chord
        const swap = state.temporarySwaps[i];
        const displayC = swap ? { ...c, ...swap } : c;
        const tuning = getEffectiveTuning(displayC.symbol, displayC.divisions || state.divisions || 12);
        const notes = getChordNotes(displayC.symbol, displayC.key, tuning.divisions);
        if (notes) activeSignatures.add(getChordSignature(notes, tuning.periodSize));
    });

    const index = selectedChordIndex;
    const originalChord = state.currentProgression[index];
    const isTemp = state.temporarySwaps[index] !== undefined;
    const displayChord = isTemp ? { ...originalChord, ...state.temporarySwaps[index] } : originalChord;
    const currentDuration = displayChord.duration || 2;

    const resetBtnHtml = isTemp ? `<button class="chord-btn reset-swap-btn" data-action="reset-swap" data-index="${index}" style="margin: 0 4px; padding: 2px 8px; font-size: 11px; background: var(--bg-hover); border: 1px solid var(--border-main); color: var(--text-main); border-radius: 4px; cursor: pointer;" title="Reset back to original chord">↺ Original</button>` : '';

    document.getElementById('inspector-title').innerHTML = `
        <span style="display: flex; align-items: center; gap: 4px;">Selected Chord: ${displayChord.symbol} ${resetBtnHtml}</span>
        <button class="chord-btn del-btn" data-action="delete" data-index="${index}" style="margin: 0; padding: 4px 12px; font-size: 13px;">🗑 Delete</button>
    `;

    const totalPagesCount = Math.ceil(HAND_CURATED_CATEGORIES.length / 6);

    // --- Category Settings Row
    let settingsRow = content.querySelector('.inspector-row-swap-settings');
    if (!settingsRow) {
        settingsRow = document.createElement('div');
        settingsRow.className = 'inspector-row inspector-row-swap-settings';
        settingsRow.style.display = 'flex';
        settingsRow.style.alignItems = 'center';
        settingsRow.style.justifyContent = 'space-between';
        settingsRow.style.width = '100%';
        settingsRow.style.gap = '8px';

        settingsRow.innerHTML = `
            <strong class="inspector-label inspector-swap-category-header" style="flex-shrink: 0; font-size: 14px; margin: 0;">🎭:</strong>
            <div style="display: flex; align-items: center; gap: 4px; flex-grow: 1; min-width: 0;">
                <button id="btn-inspector-emotion-prev" class="control-btn secondary btn-sm inspector-emotion-page-btn" style="padding: 2px 6px; font-size: 10px;" title="Previous page">◀</button>
                <select id="inspector-emotion-dropdown" class="rhythm-select" style="flex-grow: 1; padding: 2px 4px; font-size: 11px; border-radius: 4px; background: var(--bg-panel); border: 1px solid var(--border-main); color: var(--text-main); cursor: pointer; min-width: 0;">
                </select>
                <button id="btn-inspector-emotion-next" class="control-btn secondary btn-sm inspector-emotion-page-btn" style="padding: 2px 6px; font-size: 10px;" title="Next page">▶</button>
            </div>
            <button id="inspector-audition-toggle" class="control-btn secondary btn-sm icon-btn" title="Toggle substitute audition" style="font-size: 14px; padding: 2px 8px; cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: center; min-width: 32px; min-height: 24px; flex-shrink: 0;">
                ${state.editorState.isAuditionEnabled ? '🔊' : '🔇'}
            </button>
        `;
        content.appendChild(settingsRow);
    }

    const insAuditionToggle = settingsRow.querySelector('#inspector-audition-toggle');
    if (insAuditionToggle) {
        insAuditionToggle.onclick = (e) => {
            e.stopPropagation();
            state.editorState.isAuditionEnabled = !state.editorState.isAuditionEnabled;
            insAuditionToggle.textContent = state.editorState.isAuditionEnabled ? '🔊' : '🔇';

            // Sync with global settings checkbox
            const settingsToggle = document.getElementById('settings-audition-toggle');
            if (settingsToggle) {
                settingsToggle.checked = state.editorState.isAuditionEnabled;
            }

            persistAppState();
        };
    }

    const insEmotionDropdown = settingsRow.querySelector('#inspector-emotion-dropdown');
    const btnInsEmotionPrev = settingsRow.querySelector('#btn-inspector-emotion-prev');
    const btnInsEmotionNext = settingsRow.querySelector('#btn-inspector-emotion-next');

    let inspectorCatPage = state.editorState.inspectorCategoryPage ?? 0;
    inspectorCatPage = Math.max(0, Math.min(totalPagesCount - 1, inspectorCatPage));
    state.editorState.inspectorCategoryPage = inspectorCatPage;

    const pageCategories = [];
    for (let j = 0; j < 6; j++) {
        const catIndex = (inspectorCatPage * 6) + j;
        if (catIndex < HAND_CURATED_CATEGORIES.length) {
            pageCategories.push(getProceduralCategory(catIndex, state.mode));
        }
    }

    const hasActiveEmotionOnPage = pageCategories.some(cat => cat.id === state.editorState.inspectorActiveEmotion) || state.editorState.inspectorActiveEmotion === 'substitutes';
    if (!hasActiveEmotionOnPage && pageCategories.length > 0) {
        state.editorState.inspectorActiveEmotion = 'substitutes';
    }

    if (insEmotionDropdown) {
        insEmotionDropdown.innerHTML = '';
        
        // Add standard Alternatives option
        const subOpt = document.createElement('option');
        subOpt.value = 'substitutes';
        subOpt.textContent = 'Alternatives';
        insEmotionDropdown.appendChild(subOpt);

        pageCategories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.label;
            insEmotionDropdown.appendChild(opt);
        });

        insEmotionDropdown.value = state.editorState.inspectorActiveEmotion;

        insEmotionDropdown.onchange = (e) => {
            state.editorState.inspectorActiveEmotion = e.target.value;
            state.editorState.swapPage = 0;
            persistAppState();
            renderChordInspector(state, selectedChordIndex, callbacks);
        };
    }

    if (btnInsEmotionPrev) btnInsEmotionPrev.disabled = inspectorCatPage === 0;
    if (btnInsEmotionNext) btnInsEmotionNext.disabled = inspectorCatPage === totalPagesCount - 1;

    if (btnInsEmotionPrev) {
        btnInsEmotionPrev.onclick = (e) => {
            e.stopPropagation();
            if (state.editorState.inspectorCategoryPage > 0) {
                state.editorState.inspectorCategoryPage--;
                state.editorState.swapPage = 0;
                // Default to substitutes on page change for simplicity
                state.editorState.inspectorActiveEmotion = 'substitutes';
                persistAppState();
                renderChordInspector(state, selectedChordIndex, callbacks);
            }
        };
    }
    if (btnInsEmotionNext) {
        btnInsEmotionNext.onclick = (e) => {
            e.stopPropagation();
            if (state.editorState.inspectorCategoryPage < totalPagesCount - 1) {
                state.editorState.inspectorCategoryPage++;
                state.editorState.swapPage = 0;
                state.editorState.inspectorActiveEmotion = 'substitutes';
                persistAppState();
                renderChordInspector(state, selectedChordIndex, callbacks);
            }
        };
    }

    // --- Swap Chord (Alts) Row ---
    let altsRow = content.querySelector('.inspector-row-alts');
    let altsBtnContainer;
    let prevBtn, nextBtn;
    if (!altsRow) {
        altsRow = document.createElement('div');
        altsRow.className = 'inspector-row inspector-row-alts';
        altsRow.style.display = 'flex';
        altsRow.style.flexDirection = 'column';
        altsRow.style.gap = '6px';
        altsRow.style.width = '100%';

        altsRow.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px;">
                <button class="control-btn secondary btn-sm swap-prev-btn" style="padding: 2px 6px; font-size: 10px;">◀</button>
                <strong class="inspector-label" style="font-size: 12px; margin: 0 4px;">Swap Chord</strong>
                <button class="control-btn secondary btn-sm swap-next-btn" style="padding: 2px 6px; font-size: 10px;">▶</button>
            </div>
            <div class="inspector-btn-group alts-btn-group" style="display: flex; flex-wrap: wrap; gap: 4px; width: 100%;">
            </div>
        `;
        content.appendChild(altsRow);
        altsBtnContainer = altsRow.querySelector('.alts-btn-group');
        prevBtn = altsRow.querySelector('.swap-prev-btn');
        nextBtn = altsRow.querySelector('.swap-next-btn');
    } else {
        altsBtnContainer = altsRow.querySelector('.alts-btn-group');
        prevBtn = altsRow.querySelector('.swap-prev-btn');
        nextBtn = altsRow.querySelector('.swap-next-btn');
    }

    if (prevBtn) {
        prevBtn.onclick = (e) => {
            e.stopPropagation();
            if (state.editorState.swapPage > 0) {
                state.editorState.swapPage--;
                renderChordInspector(state, selectedChordIndex, callbacks);
            }
        };
    }
    if (nextBtn) {
        nextBtn.onclick = (e) => {
            e.stopPropagation();
            state.editorState.swapPage++;
            renderChordInspector(state, selectedChordIndex, callbacks);
        };
    }

    let alts = [];
    if (state.editorState.inspectorActiveEmotion === 'substitutes') {
        const rawAlts = getAlternatives(displayChord.symbol, displayChord.key, state.mode);
        alts = rawAlts.map(alt => ({ symbol: alt }));
    } else {
        alts = getDynamicProgSuggestions(displayChord, state.editorState.inspectorActiveEmotion, state.mode, state.baseKey);
    }

    if (isTemp) alts.unshift({ symbol: originalChord.symbol, key: originalChord.key });

    const pageSize = 4;
    const totalPages = Math.max(1, Math.ceil(alts.length / pageSize));

    let currentPage = state.editorState.swapPage || 0;
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    if (currentPage < 0) currentPage = 0;
    state.editorState.swapPage = currentPage;

    if (prevBtn) prevBtn.disabled = currentPage === 0;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages - 1;

    const pageAlts = alts.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

    if (pageAlts.length === 0) {
        altsBtnContainer.innerHTML = `<span style="opacity: 0.5; font-size: 13px;">No close matches</span>`;
    } else {
        const noMatchSpan = altsBtnContainer.querySelector('span');
        if (noMatchSpan) noMatchSpan.remove();

        const existingBtns = altsBtnContainer.querySelectorAll('button');
        pageAlts.forEach((altObj, i) => {
            let btn = existingBtns[i];
            if (!btn) {
                btn = document.createElement('button');
                btn.className = 'chord-btn inspector-alt-btn';
                altsBtnContainer.appendChild(btn);
            }
            btn.textContent = altObj.symbol;
            btn.dataset.action = 'swap';
            btn.dataset.index = index;
            btn.dataset.alt = altObj.symbol;
            if (altObj.key !== undefined) {
                btn.dataset.key = altObj.key;
            } else {
                delete btn.dataset.key;
            }
            if (altObj.description) {
                btn.title = altObj.description;
            } else {
                btn.title = "";
            }

            const isOriginal = isTemp && currentPage === 0 && i === 0;
            if (isOriginal) btn.classList.add('original-swap-option');
            else btn.classList.remove('original-swap-option');

            // Context Dimming
            const altKey = altObj.key !== undefined ? altObj.key : displayChord.key;
            const tuning = getEffectiveTuning(altObj.symbol, displayChord.divisions || state.divisions || 12);
            const notes = getChordNotes(altObj.symbol, altKey, tuning.divisions);
            if (notes && activeSignatures.has(getChordSignature(notes, tuning.periodSize)) && !isOriginal) {
                btn.classList.add('dimmed-chord');
                btn.title = (btn.title ? btn.title + " | " : "") + "Already elsewhere in progression";
            } else {
                btn.classList.remove('dimmed-chord');
            }
        });

        for (let i = pageAlts.length; i < existingBtns.length; i++) {
            existingBtns[i].remove();
        }
    }

    // --- Unified Tools Row (Transpose, Duration, Delete) ---
    let toolsRow = content.querySelector('.inspector-row-tools');
    if (!toolsRow) {
        toolsRow = document.createElement('div');
        toolsRow.className = 'inspector-row inspector-row-tools';

        // 1. Transpose
        const modBlock = document.createElement('div');
        modBlock.className = 'mod-block';
        modBlock.style.display = 'flex';
        modBlock.style.flexDirection = 'column';
        modBlock.style.alignItems = 'center';
        modBlock.style.gap = '2px';
        modBlock.innerHTML = `<strong class="inspector-label">Transpose:</strong>`;

        const modSelectWrapper = document.createElement('div');
        modSelectWrapper.style.display = 'inline-flex';
        modSelectWrapper.style.alignItems = 'center';

        const modDownBtn = document.createElement('button');
        modDownBtn.className = 'control-btn secondary icon-btn mod-key-down';
        modDownBtn.style.padding = '2px 6px';
        modDownBtn.style.borderRight = 'none';
        modDownBtn.style.borderTopRightRadius = '0';
        modDownBtn.style.borderBottomRightRadius = '0';
        modDownBtn.textContent = '<';

        const modSelect = document.createElement('select');
        modSelect.className = 'rhythm-select mod-select';
        modSelect.style.padding = '4px 8px';
        modSelect.style.borderRadius = '0';
        Object.entries(KEY_NAMES).forEach(([val, name]) => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = name;
            modSelect.appendChild(opt);
        });

        const modUpBtn = document.createElement('button');
        modUpBtn.className = 'control-btn secondary icon-btn mod-key-up';
        modUpBtn.style.padding = '2px 6px';
        modUpBtn.style.borderLeft = 'none';
        modUpBtn.style.borderTopLeftRadius = '0';
        modUpBtn.style.borderBottomLeftRadius = '0';
        modUpBtn.textContent = '>';

        modSelectWrapper.appendChild(modDownBtn);
        modSelectWrapper.appendChild(modSelect);
        modSelectWrapper.appendChild(modUpBtn);
        modBlock.appendChild(modSelectWrapper);
        toolsRow.appendChild(modBlock);

        // --- Voicing Type Slider ---
        const voicingBlock = document.createElement('div');
        voicingBlock.className = 'voicing-block';
        voicingBlock.style.display = 'flex';
        voicingBlock.style.flexDirection = 'column';
        voicingBlock.style.alignItems = 'center';
        voicingBlock.style.gap = '2px';

        const vLabel = document.createElement('span');
        vLabel.className = 'inspector-label voicing-label';
        voicingBlock.appendChild(vLabel);

        const vSlider = document.createElement('input');
        vSlider.type = 'range';
        vSlider.className = 'voicing-slider';
        vSlider.style.margin = '0';
        vSlider.min = 0;
        vSlider.max = 4;
        vSlider.step = 0.01;
        vSlider.title = "Equivalent voicings share the same color track";
        voicingBlock.appendChild(vSlider);

        // Buttons: Set as Global
        const vBtnGroup = document.createElement('div');
        vBtnGroup.className = 'v-btn-group';
        vBtnGroup.style.marginTop = '2px';

        const setGlobalBtn = document.createElement('button');
        setGlobalBtn.className = 'control-btn secondary set-global-btn';
        setGlobalBtn.textContent = 'Set as Global';
        vBtnGroup.appendChild(setGlobalBtn);

        voicingBlock.appendChild(vBtnGroup);
        toolsRow.appendChild(voicingBlock);

        // --- Inversion Stepper ---
        const invBlock = document.createElement('div');
        invBlock.className = 'inv-block';
        invBlock.style.display = 'flex';
        invBlock.style.flexDirection = 'column';
        invBlock.style.alignItems = 'center';
        invBlock.style.gap = '2px';
        invBlock.innerHTML = `<strong class="inspector-label">Inversion:</strong>`;

        const stepperContainer = document.createElement('div');
        stepperContainer.className = 'stepper-container';

        const displaySpan = document.createElement('span');
        displaySpan.className = 'inv-display';

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'inv-btn-container';

        const invUpBtn = document.createElement('button');
        invUpBtn.className = 'chord-btn inv-up-btn';
        invUpBtn.textContent = '▲';

        const invDownBtn = document.createElement('button');
        invDownBtn.className = 'chord-btn inv-down-btn';
        invDownBtn.textContent = '▼';

        buttonContainer.appendChild(invUpBtn);
        buttonContainer.appendChild(invDownBtn);

        stepperContainer.appendChild(displaySpan);
        stepperContainer.appendChild(buttonContainer);
        invBlock.appendChild(stepperContainer);

        toolsRow.appendChild(invBlock);

        // 2. Duration
        const durBlock = document.createElement('div');
        durBlock.className = 'dur-block';
        durBlock.style.display = 'flex';
        durBlock.style.flexDirection = 'column';
        durBlock.style.alignItems = 'center';
        durBlock.style.gap = '2px';

        const durLabel = document.createElement('span');
        durLabel.className = 'inspector-label dur-label';

        const durSlider = document.createElement('input');
        durSlider.type = 'range';
        durSlider.className = 'dur-slider';
        durSlider.style.margin = '0';
        durSlider.min = 1;
        durSlider.max = 8;
        durSlider.step = 1;
        durSlider.setAttribute('list', 'beat-snaps');

        durBlock.appendChild(durLabel);
        durBlock.appendChild(durSlider);
        toolsRow.appendChild(durBlock);

        content.appendChild(toolsRow);
    }

    // --- Update Tools Properties ---

    // 1. Transpose Update
    const modSelect = toolsRow.querySelector('.mod-select');
    modSelect.dataset.action = 'changeChordKey';
    modSelect.dataset.index = index;
    modSelect.value = displayChord.key;

    Array.from(modSelect.options).forEach(opt => {
        const keyVal = parseInt(opt.value, 10);
        const diff = (keyVal - state.baseKey + 12) % 12;
        let label = KEY_NAMES[keyVal];

        const modLabel = getModulationLabel(state.baseKey, keyVal);
        if (modLabel) {
            label += ` ${modLabel}`;
        }
        opt.textContent = label;

        if (diff === 0) {
            opt.style.color = '#10b981';
        } else if (diff === 7) {
            opt.style.color = '#fbbf24';
        } else if (diff === 5) {
            opt.style.color = '#3b82f6';
        } else if (diff === 4) {
            opt.style.color = '#ef4444';
        } else if (diff === 3) {
            opt.style.color = '#8b5cf6';
        } else if (diff === 1) {
            opt.style.color = '#ec4899';
        } else if (diff === 11) {
            opt.style.color = '#6366f1';
        } else if (diff === 6) {
            opt.style.color = '#06b6d4';
        } else {
            opt.style.color = 'var(--text-main)';
        }
    });

    const downBtnMod = toolsRow.querySelector('.mod-key-down');
    downBtnMod.dataset.action = 'change-chord-key-step';
    downBtnMod.dataset.index = index;
    downBtnMod.dataset.direction = '-1';
    downBtnMod.dataset.currentKey = displayChord.key;

    const upBtnMod = toolsRow.querySelector('.mod-key-up');
    upBtnMod.dataset.action = 'change-chord-key-step';
    upBtnMod.dataset.index = index;
    upBtnMod.dataset.direction = '1';
    upBtnMod.dataset.currentKey = displayChord.key;

    // 2. Voicing Type Slider Update
    const currentType = displayChord.voicingType || 'global';
    const mockProg = state.currentProgression.map((c, i) => {
        const swap = state.temporarySwaps[i];
        return swap ? { ...c, ...swap } : c;
    });

    const types = [
        { val: 'global', label: 'Global' },
        { val: 'auto', label: 'Auto' },
        { val: 'close', label: 'Close' },
        { val: 'quartal', label: 'Quartal' },
        { val: 'spread', label: 'Spread' }
    ];

    const vLabel = toolsRow.querySelector('.voicing-label');
    vLabel.id = 'voicing-label-' + index;
    const activeLabel = types.find(t => t.val === currentType).label;
    vLabel.innerHTML = `<strong>Voicing:</strong> ${activeLabel}`;

    const resultsMap = {};
    const uniqueResults = [];
    types.forEach(t => {
        mockProg[index] = { ...mockProg[index], voicingType: t.val };
        const notes = getPlayableNotes(mockProg, state)[index];
        const noteStr = notes ? notes.join(',') : 'none';
        resultsMap[t.val] = noteStr;
        if (!uniqueResults.includes(noteStr)) {
            uniqueResults.push(noteStr);
        }
    });

    const colorPalette = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    const gradientStops = types.map((t, i) => {
        const resultIndex = uniqueResults.indexOf(resultsMap[t.val]);
        const matchColor = colorPalette[resultIndex % colorPalette.length];
        return `${matchColor} ${i * 20}%, ${matchColor} ${(i + 1) * 20}%`;
    }).join(', ');

    const vSlider = toolsRow.querySelector('.voicing-slider');
    vSlider.value = types.findIndex(t => t.val === currentType);
    vSlider.dataset.action = 'voicing-slider';
    vSlider.dataset.index = index;
    vSlider.style.background = `linear-gradient(to right, ${gradientStops})`;

    const setGlobalBtn = toolsRow.querySelector('.set-global-btn');
    setGlobalBtn.title = `Set '${activeLabel}' as the new master default`;
    setGlobalBtn.dataset.action = 'set-global-voicing';
    setGlobalBtn.dataset.index = index;
    setGlobalBtn.dataset.val = currentType;
    setGlobalBtn.style.display = currentType === 'global' ? 'none' : 'inline-block';

    // 3. Inversion Update
    const invOffset = displayChord.inversionOffset ?? 0;
    const invDisplay = toolsRow.querySelector('.inv-display');
    invDisplay.textContent = invOffset > 0 ? `+${invOffset}` : invOffset;
    if (invOffset === 0) {
        invDisplay.style.opacity = '0.7';
        invDisplay.title = 'Auto';
    } else {
        invDisplay.style.opacity = '1';
        invDisplay.title = '';
    }

    const upBtn = toolsRow.querySelector('.inv-up-btn');
    upBtn.dataset.action = 'step-inversion';
    upBtn.dataset.index = index;
    upBtn.dataset.direction = '1';

    const downBtn = toolsRow.querySelector('.inv-down-btn');
    downBtn.dataset.action = 'step-inversion';
    downBtn.dataset.index = index;
    downBtn.dataset.direction = '-1';

    // 4. Duration Update
    const durLabel = toolsRow.querySelector('.dur-label');
    durLabel.id = 'dur-label-' + index;
    durLabel.innerHTML = `<strong>Beats:</strong> ${currentDuration}`;

    const durSlider = toolsRow.querySelector('.dur-slider');
    durSlider.value = currentDuration;
    durSlider.dataset.action = 'duration-slider';
    durSlider.dataset.index = index;

    // --- Conditional Rows (Out of Key & Turnaround) ---
    let transRow = content.querySelector('.inspector-row-trans');
    if (displayChord.key !== state.baseKey) {
        if (!transRow) {
            transRow = document.createElement('div');
            transRow.className = 'inspector-row inspector-row-trans';
            transRow.innerHTML = `<strong class="inspector-label" style="margin-right: 8px;">Out of Key:</strong>`;
            const transBtn = document.createElement('button');
            transBtn.className = 'chord-btn trans-btn';
            transRow.appendChild(transBtn);

            const turnRow = content.querySelector('.inspector-row-turn');
            if (turnRow) {
                content.insertBefore(transRow, turnRow);
            } else {
                content.appendChild(transRow);
            }
        }
        const transBtn = transRow.querySelector('.trans-btn');
        const modeStr = state.mode.charAt(0).toUpperCase() + state.mode.slice(1).replace(/([A-Z])/g, ' $1').trim();
        transBtn.textContent = `Transpose to ${KEY_NAMES[state.baseKey]} ${modeStr}`;
        transBtn.dataset.action = 'transpose';
        transBtn.dataset.index = index;
    } else if (transRow) {
        transRow.remove();
    }

    const firstChordIndex = state.isLooping ? state.loopStart : 0;
    const lastChordIndex = state.isLooping ? Math.max(0, state.loopEnd - 1) : Math.max(0, state.currentProgression.length - 1);

    let turnRow = content.querySelector('.inspector-row-turn');
    if (index === lastChordIndex && state.currentProgression.length > 0) {
        const firstChordOriginal = state.currentProgression[firstChordIndex];
        const firstChord = state.temporarySwaps[firstChordIndex] ? { ...firstChordOriginal, ...state.temporarySwaps[firstChordIndex] } : firstChordOriginal;
        if (firstChord) {
            let turnBtnsContainer;
            if (!turnRow) {
                turnRow = document.createElement('div');
                turnRow.className = 'inspector-row inspector-row-turn';

                const turnLabel = document.createElement('span');
                turnLabel.className = 'inspector-label turn-label';
                turnRow.appendChild(turnLabel);

                turnBtnsContainer = document.createElement('div');
                turnBtnsContainer.className = 'turn-btns-container';
                turnRow.appendChild(turnBtnsContainer);

                content.appendChild(turnRow);
            } else {
                turnBtnsContainer = turnRow.querySelector('.turn-btns-container');
            }

            const turnLabel = turnRow.querySelector('.turn-label');
            turnLabel.textContent = `Turnaround to ${firstChord.symbol}:`;

            const turnarounds = getTurnaroundSuggestions(firstChord.symbol, state.mode, state.baseKey);
            const existingBtns = turnBtnsContainer.querySelectorAll('button');

            turnarounds.forEach((alt, i) => {
                let btn = existingBtns[i];
                if (!btn) {
                    btn = document.createElement('button');
                    btn.className = 'chord-btn turn-btn';
                    turnBtnsContainer.appendChild(btn);
                }
                btn.textContent = `+ ${alt}`;
                btn.dataset.action = 'turnaround';
                btn.dataset.index = index;
                btn.dataset.alt = alt;
                btn.dataset.key = firstChord.key;

                // Context Dimming for turnarounds
                const tuning = getEffectiveTuning(alt, firstChord.divisions || state.divisions || 12);
                const notes = getChordNotes(alt, firstChord.key, tuning.divisions);
                if (notes && activeSignatures.has(getChordSignature(notes, tuning.periodSize))) {
                    btn.classList.add('dimmed-chord');
                    btn.title = "Already in progression";
                } else {
                    btn.classList.remove('dimmed-chord');
                    if (btn.title === "Already in progression") btn.title = "";
                }
            });

            for (let i = turnarounds.length; i < existingBtns.length; i++) {
                existingBtns[i].remove();
            }
        } else if (turnRow) {
            turnRow.remove();
        }
    } else if (turnRow) {
        turnRow.remove();
    }
}