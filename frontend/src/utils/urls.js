function normalizeUrl(url) {
    return String(url).replace(/\/$/, '');
}

export function getBackendBase() {
    if (import.meta.env.VITE_BACKEND_URL) {
        return normalizeUrl(import.meta.env.VITE_BACKEND_URL);
    }
    return '';
}

export function apiUrl(path) {
    const base = getBackendBase();
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
}

export function getSocketUrl() {
    if (import.meta.env.VITE_SOCKET_URL) {
        return normalizeUrl(import.meta.env.VITE_SOCKET_URL);
    }
    if (import.meta.env.VITE_BACKEND_URL) {
        return normalizeUrl(import.meta.env.VITE_BACKEND_URL);
    }
    return undefined;
}
