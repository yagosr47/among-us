import { useState, useEffect } from 'react';
import styles from './Toast.module.css';

export function Toast({ message, type = 'info', duration = 4000, onClose }) {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        if (duration === 0) return;
        const timer = setTimeout(() => {
            setIsVisible(false);
            if (onClose) onClose();
        }, duration);
        return () => clearTimeout(timer);
    }, [duration, onClose]);

    if (!isVisible) return null;

    return (
        <div className={`${styles.toast} ${styles[type]}`}>
            <div className={styles.content}>
                <span className={styles.icon}>
                    {type === 'warning' && '⚠️'}
                    {type === 'error' && '❌'}
                    {type === 'success' && '✅'}
                    {type === 'info' && 'ℹ️'}
                </span>
                <p className={styles.message}>{message}</p>
            </div>
            <button
                className={styles.closeBtn}
                onClick={() => {
                    setIsVisible(false);
                    if (onClose) onClose();
                }}
                aria-label="Close notification"
            >
                ✕
            </button>
        </div>
    );
}

export function ToastContainer() {
    const [toasts, setToasts] = useState([]);

    useEffect(() => {
        window.showToast = (message, type = 'info', duration = 3500) => {
            const id = `${Date.now()}-${Math.random()}`;
            setToasts((prev) => [...prev, { id, message, type, duration }]);
            return id;
        };
        return () => {
            delete window.showToast;
        };
    }, []);

    const removeToast = (id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <div className={styles.container}>
            {toasts.map((toast) => (
                <Toast
                    key={toast.id}
                    message={toast.message}
                    type={toast.type}
                    duration={toast.duration}
                    onClose={() => removeToast(toast.id)}
                />
            ))}
        </div>
    );
}
