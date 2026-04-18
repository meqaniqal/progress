export const STORAGE_KEY = 'progress_app_state';

export function saveState(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error('[storage] Failed to save state', e);
    }
}

export function loadState() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.error('[storage] Failed to load state', e);
        return null;
    }
}