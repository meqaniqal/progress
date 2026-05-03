export const STORAGE_KEY = 'progress_app_state';

export function saveState(state) {
    try {
        // Exclude history array from localStorage to prevent quota bloat, as it is only needed per-session
        const { history, ...stateToSave } = state;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
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

export function clearState() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.error('[storage] Failed to clear state', e);
    }
}