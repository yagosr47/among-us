const STORAGE_KEY = 'amongUsHudPrefs';

export const DEFAULT_HUD_PREFS = {
    showTaskPanel: true,
    showControlsHint: true,
    showRulesCard: true,
};

export function loadHudPrefs() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_HUD_PREFS };
        const parsed = JSON.parse(raw);
        return {
            showTaskPanel:
                typeof parsed?.showTaskPanel === 'boolean'
                    ? parsed.showTaskPanel
                    : DEFAULT_HUD_PREFS.showTaskPanel,
            showControlsHint:
                typeof parsed?.showControlsHint === 'boolean'
                    ? parsed.showControlsHint
                    : DEFAULT_HUD_PREFS.showControlsHint,
            showRulesCard:
                typeof parsed?.showRulesCard === 'boolean'
                    ? parsed.showRulesCard
                    : DEFAULT_HUD_PREFS.showRulesCard,
        };
    } catch {
        return { ...DEFAULT_HUD_PREFS };
    }
}

export function saveHudPrefs(prefs) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
        // ignore storage quota errors
    }
}
