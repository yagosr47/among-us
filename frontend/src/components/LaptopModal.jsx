import { useState, useEffect } from 'react';
import styles from './LaptopModal.module.css';
import CrewmateAvatar from './CrewmateAvatar.jsx';
import { PLAYER_COLORS } from '../utils/colors.js';
import { DEFAULT_ROOM_SETTINGS, SETTING_OPTIONS } from '../game/skeldData.js';
import { soundFX } from '../utils/sound.js';

function StepperControl({ label, value, options, format = (v) => v, disabled, onChange }) {
    const idx = Math.max(0, options.indexOf(value));
    const canPrev = !disabled && idx > 0;
    const canNext = !disabled && idx < options.length - 1;

    return (
        <div className={styles.settingRow}>
            <span className={styles.settingLabel}>{label}</span>
            <div className={styles.stepper}>
                <button
                    type="button"
                    disabled={!canPrev}
                    className={styles.stepBtn}
                    onClick={() => {
                        soundFX.playClick();
                        onChange(options[idx - 1]);
                    }}
                >
                    ◀
                </button>
                <span className={styles.stepValue}>{format(options[idx] ?? value)}</span>
                <button
                    type="button"
                    disabled={!canNext}
                    className={styles.stepBtn}
                    onClick={() => {
                        soundFX.playClick();
                        onChange(options[idx + 1]);
                    }}
                >
                    ▶
                </button>
            </div>
        </div>
    );
}

function ToggleControl({ label, value, disabled, onChange }) {
    return (
        <div className={styles.settingRow}>
            <span className={styles.settingLabel}>{label}</span>
            <button
                type="button"
                disabled={disabled}
                className={`${styles.toggleBtn} ${value ? styles.toggleOn : styles.toggleOff}`}
                onClick={() => {
                    soundFX.playClick();
                    onChange(!value);
                }}
            >
                {value ? 'ON' : 'OFF'}
            </button>
        </div>
    );
}

export default function LaptopModal({
    initialTab = 'settings',
    isHost = false,
    isOffline = false,
    hostName = 'Host',
    player,
    players = {},
    settings = DEFAULT_ROOM_SETTINGS,
    onUpdateSettings,
    onResetSettings,
    onCustomizePlayer,
    customError = '',
    onClose,
}) {
    const [tab, setTab] = useState(initialTab);
    const [name, setName] = useState(player?.name || '');
    const [color, setColor] = useState(player?.color || '#c51111');
    const [savedMsg, setSavedMsg] = useState('');

    useEffect(() => {
        setTab(initialTab);
    }, [initialTab]);

    useEffect(() => {
        if (player) {
            setName(player.name || '');
            setColor(player.color || '#c51111');
        }
    }, [player]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const takenColors = new Set(
        Object.values(players || {})
            .filter((p) => p.id !== player?.id)
            .map((p) => String(p.color || '').toLowerCase())
    );

    const playerCount = Object.keys(players || {}).length;
    const effectiveImpostors = Math.max(
        1,
        Math.min(settings.impostorCount || 1, Math.max(1, Math.floor((playerCount - 1) / 2)))
    );

    const handleCustomizeSubmit = (e) => {
        e.preventDefault();
        soundFX.playClick();
        onCustomizePlayer?.({ name: name.trim(), color });
        setSavedMsg('Customization updated!');
        setTimeout(() => setSavedMsg(''), 1800);
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.laptopBezel} onClick={(e) => e.stopPropagation()}>
                <div className={styles.topBar}>
                    <div className={styles.terminalBrand}>
                        <span className={styles.ledDot} />
                        <span>SKELD DROPSHIP TERMINAL</span>
                    </div>

                    <div className={styles.tabs}>
                        <button
                            type="button"
                            className={`${styles.tabBtn} ${tab === 'customize' ? styles.tabActive : ''}`}
                            onClick={() => {
                                soundFX.playClick();
                                setTab('customize');
                            }}
                        >
                            🎨 Color & Name
                        </button>
                        <button
                            type="button"
                            className={`${styles.tabBtn} ${tab === 'settings' ? styles.tabActive : ''}`}
                            onClick={() => {
                                soundFX.playClick();
                                setTab('settings');
                            }}
                        >
                            ⚙️ Game Settings
                        </button>
                    </div>

                    <button type="button" className={styles.closeBtn} onClick={onClose}>
                        ✕
                    </button>
                </div>

                <div className={styles.screenBody}>
                    {tab === 'customize' ? (
                        <form className={styles.customizeLayout} onSubmit={handleCustomizeSubmit}>
                            <div className={styles.avatarStage}>
                                <div className={styles.avatarBob}>
                                    <CrewmateAvatar color={color} size={112} />
                                </div>
                                <span className={styles.previewTag}>{name.trim() || 'Crewmate'}</span>
                            </div>

                            <div className={styles.customizeControls}>
                                <label className={styles.fieldLabel}>Crewmate Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    maxLength={20}
                                    className={styles.nameInput}
                                    placeholder="Enter name..."
                                />

                                <label className={styles.fieldLabel}>Suit Color</label>
                                <div className={styles.swatchGrid}>
                                    {PLAYER_COLORS.map((c) => {
                                        const isTaken = takenColors.has(c.hex.toLowerCase());
                                        const isSelected = color.toLowerCase() === c.hex.toLowerCase();
                                        return (
                                            <button
                                                key={c.hex}
                                                type="button"
                                                disabled={isTaken}
                                                title={isTaken ? `${c.name} (Taken)` : c.name}
                                                onClick={() => {
                                                    soundFX.playClick();
                                                    setColor(c.hex);
                                                }}
                                                className={`${styles.swatchBtn} ${
                                                    isSelected ? styles.swatchSelected : ''
                                                } ${isTaken ? styles.swatchTaken : ''}`}
                                                style={{ backgroundColor: c.hex }}
                                            >
                                                {isTaken ? '✖' : isSelected ? '✓' : ''}
                                            </button>
                                        );
                                    })}
                                </div>

                                {customError && <p className={styles.errorMsg}>{customError}</p>}
                                {!customError && savedMsg && <p className={styles.successMsg}>{savedMsg}</p>}

                                <button type="submit" className={styles.applyBtn}>
                                    Apply Changes
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className={styles.settingsLayout}>
                            <div className={styles.settingsHeader}>
                                <div>
                                    <h3 className={styles.settingsTitle}>Match Rules — The Skeld</h3>
                                    <p className={styles.settingsSub}>
                                        {isHost
                                            ? 'You are the room host. Changes apply immediately for all players.'
                                            : `Read-only view. Only host "${hostName}" can modify room rules.`}
                                    </p>
                                </div>
                                <div className={styles.headerBadges}>
                                    <span className={isHost ? styles.hostBadge : styles.guestBadge}>
                                        {isHost ? '👑 HOST CONTROLS' : '🔒 VIEW ONLY'}
                                    </span>
                                    {isHost && (
                                        <button
                                            type="button"
                                            className={styles.resetBtn}
                                            onClick={() => {
                                                soundFX.playClick();
                                                onResetSettings?.();
                                            }}
                                        >
                                            Reset Defaults
                                        </button>
                                    )}
                                </div>
                            </div>

                            {settings.impostorCount > effectiveImpostors && (
                                <div className={styles.scalingBanner}>
                                    ℹ️ Selected {settings.impostorCount} impostors — with {playerCount} players in lobby,{' '}
                                    {effectiveImpostors} impostor(s) will start (add {settings.impostorCount * 2 + 1}+ players for{' '}
                                    {settings.impostorCount}).
                                </div>
                            )}

                            <div className={styles.settingsGrid}>
                                <StepperControl
                                    label="Impostors"
                                    value={settings.impostorCount}
                                    options={SETTING_OPTIONS.impostorCount}
                                    disabled={!isHost}
                                    onChange={(v) => onUpdateSettings?.({ impostorCount: v })}
                                />
                                <ToggleControl
                                    label="Confirm Ejects"
                                    value={settings.confirmEjects}
                                    disabled={!isHost}
                                    onChange={(v) => onUpdateSettings?.({ confirmEjects: v })}
                                />
                                <StepperControl
                                    label="Emergency Meetings"
                                    value={settings.emergencyMeetings}
                                    options={SETTING_OPTIONS.emergencyMeetings}
                                    disabled={!isHost}
                                    onChange={(v) => onUpdateSettings?.({ emergencyMeetings: v })}
                                />
                                <StepperControl
                                    label="Emergency Cooldown"
                                    value={settings.emergencyCooldownSec}
                                    options={SETTING_OPTIONS.emergencyCooldownSec}
                                    format={(v) => `${v}s`}
                                    disabled={!isHost}
                                    onChange={(v) => onUpdateSettings?.({ emergencyCooldownSec: v })}
                                />
                                <StepperControl
                                    label="Voting Time"
                                    value={settings.meetingDurationSec}
                                    options={SETTING_OPTIONS.meetingDurationSec}
                                    format={(v) => `${v}s`}
                                    disabled={!isHost}
                                    onChange={(v) => onUpdateSettings?.({ meetingDurationSec: v })}
                                />
                                <ToggleControl
                                    label="Anonymous Votes"
                                    value={settings.anonymousVotes}
                                    disabled={!isHost}
                                    onChange={(v) => onUpdateSettings?.({ anonymousVotes: v })}
                                />
                                <StepperControl
                                    label="Player Speed"
                                    value={settings.playerSpeed}
                                    options={SETTING_OPTIONS.playerSpeed}
                                    format={(v) => `${v}x`}
                                    disabled={!isHost}
                                    onChange={(v) => onUpdateSettings?.({ playerSpeed: v })}
                                />
                                <StepperControl
                                    label="Crewmate Vision"
                                    value={settings.crewVision}
                                    options={SETTING_OPTIONS.crewVision}
                                    format={(v) => `${v}x`}
                                    disabled={!isHost}
                                    onChange={(v) => onUpdateSettings?.({ crewVision: v })}
                                />
                                <StepperControl
                                    label="Impostor Vision"
                                    value={settings.impostorVision}
                                    options={SETTING_OPTIONS.impostorVision}
                                    format={(v) => `${v}x`}
                                    disabled={!isHost}
                                    onChange={(v) => onUpdateSettings?.({ impostorVision: v })}
                                />
                                <StepperControl
                                    label="Kill Cooldown"
                                    value={settings.killCooldownSec}
                                    options={SETTING_OPTIONS.killCooldownSec}
                                    format={(v) => `${v}s`}
                                    disabled={!isHost}
                                    onChange={(v) => onUpdateSettings?.({ killCooldownSec: v })}
                                />
                                <StepperControl
                                    label="Kill Distance"
                                    value={settings.killDistance}
                                    options={SETTING_OPTIONS.killDistance}
                                    format={(v) => String(v).toUpperCase()}
                                    disabled={!isHost}
                                    onChange={(v) => onUpdateSettings?.({ killDistance: v })}
                                />
                                <StepperControl
                                    label="Tasks per Player"
                                    value={settings.tasksPerPlayer}
                                    options={SETTING_OPTIONS.tasksPerPlayer}
                                    disabled={!isHost}
                                    onChange={(v) => onUpdateSettings?.({ tasksPerPlayer: v })}
                                />
                            </div>

                            {isOffline && (
                                <div className={styles.botSection}>
                                    <div className={styles.botHeader}>🤖 Offline Bot Configuration</div>
                                    <div className={styles.settingsGrid}>
                                        <StepperControl
                                            label="AI Bots in Match"
                                            value={settings.botCount}
                                            options={SETTING_OPTIONS.botCount}
                                            format={(v) => `${v} Bots (${v + 1} Total)`}
                                            disabled={!isHost}
                                            onChange={(v) => onUpdateSettings?.({ botCount: v })}
                                        />
                                        <StepperControl
                                            label="Bot Difficulty"
                                            value={settings.botDifficulty}
                                            options={SETTING_OPTIONS.botDifficulty}
                                            format={(v) => String(v).toUpperCase()}
                                            disabled={!isHost}
                                            onChange={(v) => onUpdateSettings?.({ botDifficulty: v })}
                                        />
                                        <StepperControl
                                            label="Your Role"
                                            value={settings.preferredRole}
                                            options={SETTING_OPTIONS.preferredRole}
                                            format={(v) => String(v).toUpperCase()}
                                            disabled={!isHost}
                                            onChange={(v) => onUpdateSettings?.({ preferredRole: v })}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
