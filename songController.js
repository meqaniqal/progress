import { state, switchActiveSection, createAndAppendSection, renameSection, removeSectionFromSequence, appendExistingSection, reorderSequence, inheritSectionData, saveHistoryState, persistAppState, applyMacroLoopBounds } from './store.js';
import { initDragAndDrop } from './dragdrop.js';

let _onRenderProgression = null;
export let isSongTrayOpen = false;
let _activeSequenceIndex = null;
let _showInheritForSection = null;

// Generates a stable, professional muted hue based on the unique section ID
function getSectionHue(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const macroHues = [210, 280, 340, 15, 45, 180, 260, 320]; // Slate, Mauve, Rose, Rust, Gold, Teal, Indigo, Magenta
    return macroHues[Math.abs(hash) % macroHues.length];
}

function createBracketElement(id, text) {
    const br = document.createElement('div');
    br.id = id;
    br.textContent = text;
    br.draggable = true;
    br.className = 'bracket-element';
    return br;
}

export function setActiveSequenceIndex(index) {
    _activeSequenceIndex = index;
}

export function getActiveSequenceIndex() {
    return _activeSequenceIndex;
}

export function initSongController(callbacks) {
    _onRenderProgression = callbacks.onRenderProgression;

    const btnAddSection = document.getElementById('btn-add-section');
    const btnToggleTray = document.getElementById('btn-toggle-song-tray');
    const btnCloseTray = document.getElementById('btn-close-song-tray');
    const tabsContainer = document.getElementById('section-tabs');
    const trayDisplay = document.getElementById('song-sequence-display');
    const progressionDisplay = document.getElementById('progression-display');
    const paletteContainer = document.getElementById('song-section-buttons');
    const btnDeleteBlock = document.getElementById('btn-delete-macro-block');

    if (btnAddSection) {
        btnAddSection.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.getElementById('active-section-dropdown')) {
                closeSectionDropdown();
                return;
            }

            // Phase 6 First-Time Flow
            if (state.songSequence.length === 1) {
                const firstId = state.songSequence[0];
                if (state.sections[firstId] && state.sections[firstId].name === 'Section 1') {
                    openFirstTimeRenameDropdown(btnAddSection, firstId, () => {
                        setTimeout(() => openAddSectionDropdown(btnAddSection), 50); // slight delay to prevent event clashes
                    });
                    return;
                }
            }

            openAddSectionDropdown(btnAddSection);
        });
    }

    // Strict Event Delegation for tabs
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.section-tab');
            if (!tab) return;
            
            const sectionId = tab.dataset.id;
            
            if (sectionId === state.activeSectionId) {
                const existingDropdown = document.getElementById('active-section-dropdown');
                if (existingDropdown) {
                    closeSectionDropdown();
                } else {
                    openRenameDropdown(tab, sectionId);
                }
            } else {
                // Switch to existing section
                if (switchActiveSection(sectionId)) {
                    _activeSequenceIndex = state.songSequence.lastIndexOf(sectionId);
                    updateSongUI();
                    if (_onRenderProgression) _onRenderProgression();
                }
            }
        });
    }

    // Handle double tap on the dedicated palette buttons safely
    if (paletteContainer) {
        let lastPaletteTapTime = 0;
        let lastPaletteTapId = null;

        paletteContainer.addEventListener('pointerdown', (e) => {
            const btn = e.target.closest('.section-palette-btn');
            if (!btn) return;
            
            const now = Date.now();
            if (now - lastPaletteTapTime < 350 && lastPaletteTapId === btn.dataset.id) {
                e.preventDefault();
                appendExistingSection(btn.dataset.id);
                _activeSequenceIndex = state.songSequence.length - 1;
                switchActiveSection(btn.dataset.id);
                updateSongUI();
                if (_onRenderProgression) _onRenderProgression();
                lastPaletteTapTime = 0;
            } else {
                lastPaletteTapTime = now;
                lastPaletteTapId = btn.dataset.id;
            }
        });
    }

    if (btnToggleTray) btnToggleTray.addEventListener('click', toggleSongTray);
    if (btnCloseTray) btnCloseTray.addEventListener('click', () => { if (isSongTrayOpen) toggleSongTray(); });

    if (btnDeleteBlock) {
        btnDeleteBlock.addEventListener('click', () => {
            if (_activeSequenceIndex !== null && _activeSequenceIndex < state.songSequence.length) {
                removeSectionFromSequence(_activeSequenceIndex);
                if (_activeSequenceIndex >= state.songSequence.length) {
                    _activeSequenceIndex = state.songSequence.length > 0 ? state.songSequence.length - 1 : null;
                }
                updateSongUI();
                if (_onRenderProgression) _onRenderProgression();
            }
        });
    }

    if (trayDisplay) {
        trayDisplay.addEventListener('click', (e) => {
            // Focus the clicked section in the editor
            const block = e.target.closest('.song-section-block');
            if (block) {
                const index = parseInt(block.dataset.index, 10);
                _activeSequenceIndex = index;
                switchActiveSection(block.dataset.id);
                updateSongUI();
                if (_onRenderProgression) _onRenderProgression();
            }
        });

        initDragAndDrop({
            display: trayDisplay,
            itemClass: 'song-section-block',
            placeholderClass: 'song-placeholder',
            sourceClass: 'section-palette-btn',
            sourceDataAttribute: 'id',
            bracketStartId: 'bracket-macro-start',
            bracketEndId: 'bracket-macro-end',
            onReorder: (oldIndex, newIndex, newLoopStart, newLoopEnd) => {
                if (oldIndex === null || newIndex === null) { updateSongUI(); return; }
                if (oldIndex !== newIndex) {
                    reorderSequence(oldIndex, newIndex);
                    
                    // Keep highlight locked to the dragged block
                    if (_activeSequenceIndex === oldIndex) {
                        _activeSequenceIndex = newIndex;
                    } else if (_activeSequenceIndex !== null && _activeSequenceIndex > oldIndex && _activeSequenceIndex <= newIndex) {
                        _activeSequenceIndex--;
                    } else if (_activeSequenceIndex !== null && _activeSequenceIndex < oldIndex && _activeSequenceIndex >= newIndex) {
                        _activeSequenceIndex++;
                    }
                }
                
                if (newLoopStart !== null && newLoopEnd !== null) {
                    state.macroLoopStart = newLoopStart;
                    state.macroLoopEnd = newLoopEnd;
                    applyMacroLoopBounds();
                    persistAppState();
                }
                updateSongUI();
            },
            onAddFromSource: (sourceId, sourceKey, insertIndex, newLoopStart, newLoopEnd) => {
                if (insertIndex === null) insertIndex = state.songSequence.length;
                appendExistingSection(sourceId, insertIndex);
                
                if (newLoopStart !== null && newLoopEnd !== null) {
                    state.macroLoopStart = newLoopStart;
                    state.macroLoopEnd = newLoopEnd;
                    applyMacroLoopBounds();
                    persistAppState();
                }
                _activeSequenceIndex = insertIndex;
                switchActiveSection(sourceId);
                updateSongUI();
                if (_onRenderProgression) _onRenderProgression();
            },
            onBracketDrop: (bracketId, insertIndex, newLoopStart, newLoopEnd) => {
                saveHistoryState();
                if (newLoopStart !== null && newLoopEnd !== null) {
                    state.macroLoopStart = newLoopStart;
                    state.macroLoopEnd = newLoopEnd;
                } else {
                    if (insertIndex === null) insertIndex = state.songSequence.length;
                    if (bracketId === 'bracket-macro-start') state.macroLoopStart = insertIndex;
                    else if (bracketId === 'bracket-macro-end') state.macroLoopEnd = insertIndex;
                }
                applyMacroLoopBounds();
                persistAppState();
                updateSongUI();
                if (_onRenderProgression) _onRenderProgression();

                // Instantly sync audio engine to new macro loop boundaries by restarting playback
                const playBtn = document.getElementById('btn-play-toggle');
                if (playBtn && playBtn.classList.contains('active')) {
                    playBtn.click();
                    setTimeout(() => {
                        if (playBtn && !playBtn.classList.contains('active')) playBtn.click();
                    }, 50);
                }
            },
            onDragCancel: () => updateSongUI(),
            getItemText: (index) => state.sections[state.songSequence[index]]?.name || ''
        });
    }

    // Strict Event Delegation for "Inherit From" logic
    document.body.addEventListener('change', (e) => {
        if (e.target.id === 'inherit-section-select') {
            const sourceId = e.target.value;
            if (!sourceId) return;
            
            inheritSectionData(state.activeSectionId, sourceId);
            updateSongUI();
            if (_onRenderProgression) _onRenderProgression();
        }
    });

    document.body.addEventListener('click', (e) => {
        if (e.target.id === 'btn-close-inherit') {
            _showInheritForSection = null;
            updateSongUI();
        }
    });
    
    initMobileUnitabSwiping();
}

function getUniqueSectionName(name, excludeSectionId = null) {
    const existing = Object.values(state.sections)
        .filter(s => s.id !== excludeSectionId)
        .map(s => s.name.toLowerCase());
    
    let cleanName = name.trim();
    if (!existing.includes(cleanName.toLowerCase())) return cleanName;
    
    let base = cleanName;
    let counter = 2;
    const match = cleanName.match(/^(.*)\s+(\d+)$/);
    if (match) {
        base = match[1];
        counter = parseInt(match[2], 10);
    }
    
    while (existing.includes(`${base} ${counter}`.toLowerCase())) {
        counter++;
    }
    return `${base} ${counter}`;
}

function showDropdownMenu(anchorElement, titleText, presets, initialInputValue, placeholderText, onApply) {
    closeSectionDropdown();

    const dropdown = document.createElement('div');
    dropdown.className = 'section-rename-dropdown';
    dropdown.id = 'active-section-dropdown';
    
    let html = '';
    if (titleText) {
        html += `<div style="font-size: 11px; padding: 4px 8px; opacity: 0.8; font-weight: bold;">${titleText}</div>`;
    }
    presets.forEach(p => {
        html += `<div class="rename-option preset-option">${p}</div>`;
    });
    html += `<div class="rename-option input-option">
                <input type="text" id="section-custom-input" value="${initialInputValue}" placeholder="${placeholderText}" />
             </div>`;
    
    dropdown.innerHTML = html;
    
    const rect = anchorElement.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 2}px`;
    
    document.body.appendChild(dropdown);

    const input = dropdown.querySelector('#section-custom-input');
    input.focus();
    if (initialInputValue) input.select();

    const handleApply = (val) => {
        closeSectionDropdown();
        if (val && val.trim() !== '') {
            onApply(val.trim());
        }
    };

    dropdown.addEventListener('click', (e) => {
        if (e.target.classList.contains('preset-option')) {
            handleApply(e.target.textContent);
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleApply(input.value);
        else if (e.key === 'Escape') closeSectionDropdown();
    });

    // Smart distance closing logic (150px threshold)
    const moveHandler = (e) => {
        if (!document.getElementById('active-section-dropdown')) return;
        const dr = dropdown.getBoundingClientRect();
        const distX = Math.max(dr.left - e.clientX, 0, e.clientX - dr.right);
        const distY = Math.max(dr.top - e.clientY, 0, e.clientY - dr.bottom);
        const distance = Math.sqrt(distX * distX + distY * distY);
        if (distance > 150) closeSectionDropdown();
    };

    // Mobile tap-outside closing logic
    const outsideClickHandler = (e) => {
        if (!document.getElementById('active-section-dropdown')) return;
        if (!dropdown.contains(e.target) && !anchorElement.contains(e.target)) {
            closeSectionDropdown();
        }
    };

    let listenersAttached = false;
    const timeoutId = setTimeout(() => {
        document.addEventListener('pointermove', moveHandler);
        document.addEventListener('pointerdown', outsideClickHandler);
        listenersAttached = true;
    }, 50);

    dropdown._cleanup = () => {
        clearTimeout(timeoutId);
        if (listenersAttached) {
            document.removeEventListener('pointermove', moveHandler);
            document.removeEventListener('pointerdown', outsideClickHandler);
        }
    };
}

function openRenameDropdown(tabElement, sectionId) {
    const currentName = state.sections[sectionId].name;
    const basePresets = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Outro'];
    showDropdownMenu(tabElement, null, basePresets, currentName, "Custom name...", (newName) => {
        const unique = getUniqueSectionName(newName, sectionId);
        renameSection(sectionId, unique);
        updateSongUI();
    });
}

function openAddSectionDropdown(anchorElement) {
    const basePresets = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Outro'];
    const dynamicPresets = basePresets.map(p => getUniqueSectionName(p));
    showDropdownMenu(anchorElement, null, dynamicPresets, '', "Custom name...", (newName) => {
        const unique = getUniqueSectionName(newName);
        createAndAppendSection(unique);
        updateSongUI();
        if (_onRenderProgression) _onRenderProgression();
    });
}

function openFirstTimeRenameDropdown(anchorElement, sectionId, onComplete) {
    const presets = ['Intro', 'Verse'];
    showDropdownMenu(anchorElement, "Name current sketch:", presets, '', "e.g. Verse...", (newName) => {
        const unique = getUniqueSectionName(newName, sectionId);
        renameSection(sectionId, unique);
        updateSongUI();
        if (onComplete) onComplete();
    });
}

function closeSectionDropdown() {
    const dropdown = document.getElementById('active-section-dropdown');
    if (dropdown) {
        if (dropdown._cleanup) dropdown._cleanup();
        dropdown.remove();
    }
}

function initMobileUnitabSwiping() {
    const unitab = document.getElementById('mobile-unitab');
    if (!unitab) return;

    let touchStartX = 0;
    let touchEndX = 0;
    const SWIPE_THRESHOLD = 40;

    unitab.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
    }, {passive: true});
    
    unitab.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, {passive: true});

    unitab.addEventListener('click', e => {
        const existingDropdown = document.getElementById('active-section-dropdown');
        if (existingDropdown) closeSectionDropdown();
        else openRenameDropdown(unitab, state.activeSectionId);
    });

    function handleSwipe() {
        const diff = touchEndX - touchStartX;
        if (Math.abs(diff) > SWIPE_THRESHOLD) {
            const orderedSections = state.songSequence.map(id => state.sections[id]).filter((sec, index, self) => 
                index === self.findIndex((t) => (t.id === sec.id))
            );
            
            const currentIndex = orderedSections.findIndex(s => s.id === state.activeSectionId);
            if (currentIndex === -1) return;

            let nextIndex = currentIndex;
            if (diff < 0) { // Swiped left -> next tab
                nextIndex = (currentIndex + 1) % orderedSections.length;
            } else { // Swiped right -> prev tab
                nextIndex = (currentIndex - 1 + orderedSections.length) % orderedSections.length;
            }
            
            if (nextIndex !== currentIndex) {
                const nextId = orderedSections[nextIndex].id;
                switchActiveSection(nextId);
                setActiveSequenceIndex(state.songSequence.lastIndexOf(nextId));
                updateSongUI();
                if (_onRenderProgression) _onRenderProgression();
            }
        }
    }
}

export function toggleSongTray() {
    const tray = document.getElementById('song-sequencer-tray');
    const btnToggleTray = document.getElementById('btn-toggle-song-tray');
    
    isSongTrayOpen = !isSongTrayOpen;
    
    if (isSongTrayOpen) {
        tray.style.display = 'block';
        btnToggleTray.classList.add('active');
        Array.from(document.querySelectorAll('.chord-palette')).forEach(p => p.style.display = 'none');
    } else {
        tray.style.display = 'none';
        btnToggleTray.classList.remove('active');
        Array.from(document.querySelectorAll('.chord-palette')).forEach(p => p.style.display = 'block');
    }
    updateSongUI();

    // Instantly sync audio engine context (Micro vs Macro) by restarting playback
    const playBtn = document.getElementById('btn-play-toggle');
    if (playBtn && playBtn.classList.contains('active')) {
        playBtn.click();
        setTimeout(() => {
            if (playBtn && !playBtn.classList.contains('active')) playBtn.click();
        }, 50);
    }
}

export function exitSongMode() {
    if (isSongTrayOpen) toggleSongTray();
}

export function updateSongUI() {
    const tabsContainer = document.getElementById('section-tabs');
    const btnToggleTray = document.getElementById('btn-toggle-song-tray');
    const trayDisplay = document.getElementById('song-sequence-display');
    const progressionDisplay = document.getElementById('progression-display');
    const paletteContainer = document.getElementById('song-section-buttons');
    if (!tabsContainer || !trayDisplay || !progressionDisplay) return;

    // 1. Render Section Tabs & Palette Buttons (Unique list of created sections)
    const renderedIds = new Set();
    const orderedSections = state.songSequence.map(id => state.sections[id]).filter(sec => {
        if (!sec || renderedIds.has(sec.id)) return false;
        renderedIds.add(sec.id);
        return true;
    });

    // Strict DOM Reconciliation for Tabs (Prevents dragging bugs)
    const existingTabs = tabsContainer.querySelectorAll('.section-tab');
    orderedSections.forEach((sec, i) => {
        let tab = existingTabs[i];
        if (!tab) {
            tab = document.createElement('div');
            tab.className = 'section-tab';
            tabsContainer.appendChild(tab);
        }
        tab.dataset.id = sec.id;
        tab.title = sec.id === state.activeSectionId ? 'Click to rename' : `Switch to ${sec.name}`;
        tab.style.setProperty('--macro-hue', getSectionHue(sec.id));
        tab.textContent = sec.name;
        
        if (sec.id === state.activeSectionId) tab.classList.add('active');
        else tab.classList.remove('active');
    });
    for (let i = orderedSections.length; i < existingTabs.length; i++) {
        tabsContainer.removeChild(existingTabs[i]);
    }
    
    if (paletteContainer) {
        // Strict DOM Reconciliation for Palette Buttons
        const existingPalettes = paletteContainer.querySelectorAll('.section-palette-btn');
        orderedSections.forEach((sec, i) => {
            let btn = existingPalettes[i];
            if (!btn) {
                btn = document.createElement('button');
                btn.className = 'chord-btn section-palette-btn';
                btn.draggable = true;
                paletteContainer.appendChild(btn);
            }
            btn.dataset.id = sec.id;
            btn.title = "Drag to sequencer or double-click to append";
            btn.style.setProperty('--macro-hue', getSectionHue(sec.id));
            btn.textContent = `${sec.name} ⬇`;
        });
        for (let i = orderedSections.length; i < existingPalettes.length; i++) {
            paletteContainer.removeChild(existingPalettes[i]);
        }
    }

    if (btnToggleTray) {
        if (isSongTrayOpen) {
            btnToggleTray.style.display = 'none';
        } else {
                const hasMultipleSections = Object.keys(state.sections).length > 1;
                const hasSequence = state.songSequence.length > 1;
                btnToggleTray.style.display = (hasMultipleSections || hasSequence) ? 'inline-block' : 'none';
        }
    }

    // 1.5 Render Mobile Unitab Data
    const unitabLabel = document.getElementById('mobile-unitab-label');
    const unitabDots = document.getElementById('mobile-unitab-dots');
    const unitab = document.getElementById('mobile-unitab');
    
    if (unitab && unitabLabel && unitabDots) {
        const activeSec = state.sections[state.activeSectionId];
        if (activeSec) {
            unitabLabel.textContent = activeSec.name;
            unitab.style.setProperty('--macro-hue', getSectionHue(activeSec.id));
            
            unitabDots.innerHTML = '';
            orderedSections.forEach(sec => {
                const dot = document.createElement('div');
                dot.className = 'mobile-unitab-dot';
                if (sec.id === state.activeSectionId) {
                    dot.classList.add('active');
                    dot.style.background = `hsl(${getSectionHue(sec.id)}, 70%, 60%)`;
                    dot.style.opacity = '1';
                }
                unitabDots.appendChild(dot);
            });
        }
    }

    // 2. Render Macro Sequencer Tray Blocks
    if (state.songSequence.length === 0) {
        trayDisplay.innerHTML = '<div class="section-empty-state">No sections in song sequence.</div>';
        _activeSequenceIndex = null;
    } else {
        // Validate _activeSequenceIndex matches activeSectionId
        if (_activeSequenceIndex !== null && state.songSequence[_activeSequenceIndex] !== state.activeSectionId) {
            _activeSequenceIndex = state.songSequence.lastIndexOf(state.activeSectionId);
            if (_activeSequenceIndex === -1) _activeSequenceIndex = null;
        } else if (_activeSequenceIndex === null) {
            _activeSequenceIndex = state.songSequence.lastIndexOf(state.activeSectionId);
        }

        const emptyState = trayDisplay.querySelector('.section-empty-state');
        if (emptyState) emptyState.remove();

        const existingBlocks = trayDisplay.querySelectorAll('.song-section-block');

        state.songSequence.forEach((id, index) => {
            let block = existingBlocks[index];
            const sec = state.sections[id];
            if (!sec) return;
            
            const isPlaying = (id === state.activeSectionId && index === _activeSequenceIndex);
            
            if (!block) {
                block = document.createElement('div');
                block.className = 'song-section-block';
                block.innerHTML = `<span class="block-name"></span>`;
                block.draggable = true;
                trayDisplay.appendChild(block);
            }
            
            block.dataset.id = id;
            block.dataset.index = index;
            block.style.setProperty('--macro-hue', getSectionHue(id));
            block.querySelector('.block-name').textContent = sec.name;
            
            if (isPlaying) block.classList.add('playing');
            else block.classList.remove('playing');
        });

        for (let i = state.songSequence.length; i < existingBlocks.length; i++) {
            trayDisplay.removeChild(existingBlocks[i]);
        }

        // Render Macro Brackets
        if (state.songSequence.length > 0 && state.isLooping) {
            let startBr = document.getElementById('bracket-macro-start') || createBracketElement('bracket-macro-start', '[');
            let endBr = document.getElementById('bracket-macro-end') || createBracketElement('bracket-macro-end', ']');
            
            startBr.style.display = 'inline-block';
            endBr.style.display = 'inline-block';

            const updatedItems = trayDisplay.querySelectorAll('.song-section-block');
            
            let mStart = state.macroLoopStart ?? 0;
            let mEnd = state.macroLoopEnd ?? state.songSequence.length;
            if (mEnd === 0 || mEnd > state.songSequence.length) mEnd = state.songSequence.length;

            if (updatedItems[mStart]) trayDisplay.insertBefore(startBr, updatedItems[mStart]);
            else trayDisplay.appendChild(startBr);

            if (updatedItems[mEnd]) trayDisplay.insertBefore(endBr, updatedItems[mEnd]);
            else trayDisplay.appendChild(endBr);
            
            updatedItems.forEach((block, index) => {
                if (index >= mStart && index < mEnd) block.classList.add('in-loop');
                else block.classList.remove('in-loop');
            });
        } else {
            const startBr = document.getElementById('bracket-macro-start');
            const endBr = document.getElementById('bracket-macro-end');
            if (startBr && startBr.parentNode) startBr.parentNode.removeChild(startBr);
            if (endBr && endBr.parentNode) endBr.parentNode.removeChild(endBr);
        }
    }

    const btnDeleteBlock = document.getElementById('btn-delete-macro-block');
    if (btnDeleteBlock) {
        btnDeleteBlock.disabled = (_activeSequenceIndex === null || state.songSequence.length === 0);
        btnDeleteBlock.style.opacity = btnDeleteBlock.disabled ? '0.5' : '1';
        btnDeleteBlock.style.cursor = btnDeleteBlock.disabled ? 'not-allowed' : 'pointer';
    }

    // 3. Render "Inherit From" empty state
    let inheritContainer = document.getElementById('inherit-container');
    if (!inheritContainer) {
        inheritContainer = document.createElement('div');
        inheritContainer.id = 'inherit-container';
        progressionDisplay.parentNode.insertBefore(inheritContainer, progressionDisplay);
    }

    const oldInherit = progressionDisplay.querySelector('#inherit-empty-state');
    if (oldInherit) oldInherit.remove();

    if (state.currentProgression.length === 0 && Object.keys(state.sections).length > 1) {
        _showInheritForSection = state.activeSectionId;
    }

    if (_showInheritForSection === state.activeSectionId && Object.keys(state.sections).length > 1) {
        const currentName = state.sections[state.activeSectionId].name;
        let defaultInheritId = '';
        
        // Smart Default: Find a section with the same base name (e.g., "Chorus" for "Chorus 2")
        const baseNameMatch = currentName.match(/^([a-zA-Z\s]+)/);
        if (baseNameMatch) {
            const baseName = baseNameMatch[1].trim().toLowerCase();
            const possibleMatches = Object.values(state.sections).filter(s => 
                s.id !== state.activeSectionId && 
                s.progression.length > 0 && 
                s.name.toLowerCase().includes(baseName)
            );
            if (possibleMatches.length > 0) defaultInheritId = possibleMatches[0].id;
        }
        
        if (!defaultInheritId) {
            const anyNonEmpty = Object.values(state.sections).find(s => s.id !== state.activeSectionId && s.progression.length > 0);
            if (anyNonEmpty) defaultInheritId = anyNonEmpty.id;
        }

        const optionsHtml = Object.values(state.sections)
            .filter(s => s.id !== state.activeSectionId && s.progression.length > 0)
            .map(s => `<option value="${s.id}" ${s.id === defaultInheritId ? 'selected' : ''}>${s.name}</option>`)
            .join('');
            
        if (optionsHtml !== '') {
            const isEmpty = state.currentProgression.length === 0;
            const inheritHtml = `
                <div class="section-empty-state" id="inherit-empty-state" style="margin: auto; margin-top: 10px; margin-bottom: 10px; padding: 0;">
                    ${isEmpty ? `<div style="font-size: 15px; margin-bottom: 10px;">This section is empty.</div>` : ''}
                    <div style="display: flex; gap: 8px; align-items: center; justify-content: center; flex-wrap: wrap;">
                        <span style="font-weight: bold; opacity: 0.8;">Inherit from:</span>
                        <select id="inherit-section-select" class="rhythm-select">
                            <option value="" disabled ${!defaultInheritId ? 'selected' : ''}>Select a section...</option>
                            ${optionsHtml}
                        </select>
                        <button id="btn-close-inherit" class="control-btn secondary" style="padding: 4px 12px; font-size: 13px;">⬅ Close</button>
                    </div>
                </div>
            `;
            
            inheritContainer.innerHTML = inheritHtml;
        } else {
            inheritContainer.innerHTML = '';
        }
    } else {
        inheritContainer.innerHTML = '';
    }
}