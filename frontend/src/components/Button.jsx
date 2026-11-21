import styles from './Button.module.css';

export function Button({ onClick, children, className = '', disabled = false, type = 'button' }) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={`${styles.button} ${className}`}
        >
            {children}
        </button>
    );
}

export default Button;
