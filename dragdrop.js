import { CONFIG } from './config.js';

export function getDragAfterElement(container, x, y) {
    const draggableElements = [...container.querySelectorAll('.progression-item:not(.dragging), #bracket-start:not(.dragging), #bracket-end:not(.dragging)')];

    for (const child of draggableElements) {
        const box = child.getBoundingClientRect();
        // Check if the cursor is vertically within the range of the current or previous rows
        if (y < box.bottom) {
            if (y < box.top) return child;
            // If cursor is in the same row, check if it's in the left half.
            if (x < box.left + box.width / 2) return child;
        }
    }
    return null; // Mouse is at the very end or in an empty area
}

export function initDragAndDrop({
    display,
    sourceButtons,
    onReorder,
    onAddFromSource,
    onBracketDrop,
    onDragCancel,
    getProgressionItemText,
    getBaseKey
}) {
    let draggedIndex = null;
    let draggedBracket = null;
    let currentAfterElement = undefined;

    // Safely initialize DOM elements (protects against Jest Node.js environment)
    const dragPlaceholder = typeof document !== 'undefined' ? document.createElement('div') : null;

    if (dragPlaceholder) {
        dragPlaceholder.className = 'progression-placeholder';
    }

    function createCustomDragImage(text) {
        const el = document.createElement('div');
        el.textContent = text;
        Object.assign(el.style, {
            position: 'absolute',
            top: '-1000px',
            background: 'var(--bg-panel)',
            color: 'var(--text-main)',
            padding: '8px 16px',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: 'bold',
            fontFamily: 'sans-serif',
            pointerEvents: 'none',
            zIndex: '9999',
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
        });
        document.body.appendChild(el);
        return el;
    }

    display.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('progression-item')) {
            draggedIndex = parseInt(e.target.dataset.index, 10);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'reorder'); // polyfill safety
            
            dragPlaceholder.className = 'progression-placeholder';
            dragPlaceholder.textContent = '';
            Object.assign(dragPlaceholder.style, {
                transition: 'width 0.2s ease-out, margin 0.2s ease-out, opacity 0.2s ease-out',
                display: 'inline-block',
                border: '2px dashed #888',
                borderRadius: '4px',
                boxSizing: 'border-box',
                height: '36px',
                verticalAlign: 'top',
                pointerEvents: 'none',
                color: 'transparent'
            });

            const chordText = getProgressionItemText(draggedIndex);
            const dragImg = createCustomDragImage(chordText);
            e.dataTransfer.setDragImage(dragImg, CONFIG.DRAG_OFFSET_X, CONFIG.DRAG_OFFSET_Y);
            
            setTimeout(() => {
                e.target.classList.add('dragging');
                e.target.style.display = 'none'; 
                document.body.removeChild(dragImg);
            }, 0);
        } else if (e.target.id === 'bracket-start' || e.target.id === 'bracket-end') {
            // Handling Dragging for Loop Brackets
            draggedBracket = e.target.id;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'bracket'); // polyfill safety
            
            // Make the placeholder look exactly like the bracket
            dragPlaceholder.className = 'bracket-placeholder';
            dragPlaceholder.textContent = e.target.textContent;
            Object.assign(dragPlaceholder.style, {
                transition: 'opacity 0.2s ease-out',
                display: 'inline-block',
                border: 'none',
                height: '36px',
                verticalAlign: 'top',
                pointerEvents: 'none',
                fontSize: '36px',
                fontWeight: '200',
                color: 'var(--bracket-color)',
                margin: '0 4px',
                lineHeight: '40px',
                fontFamily: 'monospace',
                width: 'auto'
            });
            
            // Invisible drag image to prevent confusing ghost icon
            const dragImg = createCustomDragImage('');
            dragImg.style.background = 'transparent';
            dragImg.style.boxShadow = 'none';
            e.dataTransfer.setDragImage(dragImg, 0, 0);
            
            setTimeout(() => {
                e.target.classList.add('dragging');
                e.target.style.display = 'none'; 
                document.body.removeChild(dragImg);
            }, 0);
        }
    });

    display.addEventListener('dragend', () => {
        currentAfterElement = undefined;
        const draggingEl = document.querySelector('.dragging');
        if (draggingEl) {
            draggingEl.classList.remove('dragging');
            draggingEl.style.display = ''; // Restore visibility
        }
        if (dragPlaceholder.parentNode) dragPlaceholder.parentNode.removeChild(dragPlaceholder);
        
        const resetIndex = draggedIndex;
        draggedIndex = null;
        draggedBracket = null;
        
        if (resetIndex !== null) {
            onReorder(resetIndex, resetIndex); // Dispatch a clean reset intent
        } else {
            onDragCancel(); // Clean reset for brackets if dropped outside
        }
    });

    display.addEventListener('dragenter', (e) => {
        e.preventDefault(); // Crucial for mobile polyfills to register as a valid drop target
    });

    display.addEventListener('dragover', (e) => {
        e.preventDefault(); 
        const afterElement = getDragAfterElement(display, e.clientX, e.clientY);
        
        if (afterElement !== currentAfterElement) {
            currentAfterElement = afterElement;
            dragPlaceholder.style.width = '0px';
            dragPlaceholder.style.margin = '0px';
            dragPlaceholder.style.opacity = '0';
            
            if (afterElement == null) display.appendChild(dragPlaceholder);
            else display.insertBefore(dragPlaceholder, afterElement);
            
            requestAnimationFrame(() => {
                if (draggedBracket) {
                    dragPlaceholder.style.width = 'auto'; 
                    dragPlaceholder.style.margin = '0 4px';
                    dragPlaceholder.style.opacity = '1';
                } else {
                    dragPlaceholder.style.width = '60px';
                    dragPlaceholder.style.margin = '0 4px';
                    dragPlaceholder.style.opacity = '1';
                }
            });
        }
    });

    display.addEventListener('dragleave', (e) => {
        if (!display.contains(e.relatedTarget) && dragPlaceholder.parentNode) {
            dragPlaceholder.parentNode.removeChild(dragPlaceholder);
            currentAfterElement = undefined;
        }
    });

    display.addEventListener('drop', (e) => {
        e.preventDefault();
        currentAfterElement = undefined;

        const allItems = [...display.querySelectorAll('.progression-item:not(.dragging), .progression-placeholder, .bracket-placeholder, #bracket-start:not(.dragging), #bracket-end:not(.dragging)')];
        
        let insertIndex = null;
        let newLoopStart = null;
        let newLoopEnd = null;
        let currentItemCount = 0;

        // Calculate exact state intents purely by looking at the resulting visual DOM order
        for (const el of allItems) {
            if (el.classList.contains('progression-placeholder')) {
                insertIndex = currentItemCount;
            } else if (el.id === 'bracket-start' || (el.classList.contains('bracket-placeholder') && draggedBracket === 'bracket-start')) {
                newLoopStart = currentItemCount;
            } else if (el.id === 'bracket-end' || (el.classList.contains('bracket-placeholder') && draggedBracket === 'bracket-end')) {
                newLoopEnd = currentItemCount;
            }
            
            if (el.classList.contains('progression-item') || el.classList.contains('progression-placeholder')) {
                currentItemCount++;
            }
        }

        if (dragPlaceholder.parentNode) dragPlaceholder.parentNode.removeChild(dragPlaceholder);

        let sourceChord = e.dataTransfer.getData('source-chord');
        let sourceKeyStr = e.dataTransfer.getData('source-key');

        // Fallback for mobile polyfill which strips non-standard MIME types
        if (!sourceChord) {
            try {
                const payload = JSON.parse(e.dataTransfer.getData('text/plain'));
                sourceChord = payload.sourceChord;
                sourceKeyStr = payload.sourceKey;
            } catch (err) {}
        }

        const sourceKey = sourceKeyStr ? parseInt(sourceKeyStr, 10) : 60;
        if (sourceChord) {
            onAddFromSource(sourceChord, sourceKey, insertIndex, newLoopStart, newLoopEnd);
        } else if (draggedBracket) {
            onBracketDrop(draggedBracket, insertIndex, newLoopStart, newLoopEnd);
            draggedBracket = null;
        } else if (draggedIndex !== null) {
            onReorder(draggedIndex, insertIndex, newLoopStart, newLoopEnd);
            draggedIndex = null; // Consume intent
        }
    });

    if (sourceButtons) {
        sourceButtons.forEach(btn => {
            btn.draggable = true;
            btn.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('source-chord', btn.dataset.chord);
                e.dataTransfer.setData('source-key', getBaseKey().toString());
                e.dataTransfer.effectAllowed = 'copy';
                
                // Polyfill safety: encode custom data into text/plain
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    sourceChord: btn.dataset.chord,
                    sourceKey: getBaseKey().toString()
                }));
                
                draggedIndex = null;
                
                dragPlaceholder.className = 'progression-placeholder';
                dragPlaceholder.textContent = '';
                Object.assign(dragPlaceholder.style, {
                    transition: 'width 0.2s ease-out, margin 0.2s ease-out, opacity 0.2s ease-out',
                    display: 'inline-block',
                    border: '2px dashed #888',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                    height: '36px',
                    verticalAlign: 'top',
                    pointerEvents: 'none',
                    color: 'transparent'
                });

                const dragImg = createCustomDragImage(btn.dataset.chord);
                e.dataTransfer.setDragImage(dragImg, CONFIG.DRAG_OFFSET_X, CONFIG.DRAG_OFFSET_Y);
                setTimeout(() => document.body.removeChild(dragImg), 0);
            });

            btn.addEventListener('dragend', () => {
                if (dragPlaceholder && dragPlaceholder.parentNode) {
                    dragPlaceholder.parentNode.removeChild(dragPlaceholder);
                }
            });
        });
    }
}