import { useState, useEffect } from 'react';
import styles from './SettingsModal.module.css';
import { soundFX } from '../utils/sound.js';
import { DEFAULT_ROOM_SETTINGS } from '../game/skeldData.js';

export default function SettingsModal({
    mode = 'menu', // 'menu' | 'waiting' | 'game'
    muted,
    onToggleMute,
    hudPrefs,
    onUpdateHudPrefs,
    roomSettings = DEFAULT_ROOM_SETTINGS,
    isHost = false,
    onOpenLaptopSettings,
    onLeaveRoom,
    onClose,
}) {
    const [tab, setTab] = useState('general');
    const [volume, setVolume] = useState(() => Math.round(soundFX.getVolume() * 100));

    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose?.();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const handleVolumeChange = (e) => {
        const pct = Number(e.target.value);
        setVolume(pct);
        soundFX.setVolume(pct / 100);
        if (pct > 0 && muted) {
            onToggleMute?.(false);
        }
    };

    const togglePref = (key) => {
        soundFX.playClick();
        onUpdateHudPrefs?.({
            ...hudPrefs,
            [key]: !hudPrefs?.[key],
        });
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.titleRow}>
                        <div className={styles.gearBadge}>⚙️</div>
                        <div>
                            <h2 className={styles.title}>SETTINGS & CONTROLS</h2>
                            <p className={styles.subtitle}>
                                {mode === 'game'
                                    ? 'Match Preferences, Sound & Controls'
                                    : mode === 'waiting'
                                      ? 'Client Audio, HUD & Lobby Configuration'
                                      : 'Audio, Interface & Game Controls'}
                            </p>
                        </div>
                    </div>
                    <button type="button" className={styles.closeBtn} onClick={onClose}>
                        [Esc] Close ✕
                    </button>
                </div>

                <div className={styles.tabs}>
                    <button
                        type="button"
                        className={`${styles.tabBtn} ${tab === 'general' ? styles.tabActive : ''}`}
                        onClick={() => {
                            soundFX.playClick();
                            setTab('general');
                        }}
                    >
                        🔊 Audio & HUD
                    </button>
                    <button
                        type="button"
                        className={`${styles.tabBtn} ${tab === 'controls' ? styles.tabActive : ''}`}
                        onClick={() => {
                            soundFX.playClick();
                            setTab('controls');
                        }}
                    >
                        🎮 Controls
                    </button>
                    {(mode === 'game' || mode === 'waiting') && (
                        <button
                            type="button"
                            className={`${styles.tabBtn} ${tab === 'rules' ? styles.tabActive : ''}`}
                            onClick={() => {
                                soundFX.playClick();
                                setTab('rules');
                            }}
                        >
                            📋 Match Rules
                        </button>
                    )}
                </div>

                <div className={styles.body}>
                    {tab === 'general' && (
                        <>
                            <div className={styles.sectionCard}>
                                <h3 className={styles.sectionTitle}>Audio</h3>
                                <div className={styles.row}>
                                    <div className={styles.rowLabel}>
                                        <span className={styles.rowTitle}>Sound Effects</span>
                                        <span className={styles.rowDesc}>
                                            Toggle footsteps, UI clicks, kills, tasks & emergency alarms
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className={`${styles.toggleBtn} ${
                                            !muted ? styles.toggleOn : styles.toggleOff
                                        }`}
                                        onClick={() => {
                                            const next = onToggleMute?.();
                                            if (!next) soundFX.playClick();
                                        }}
                                    >
                                        {muted ? 'MUTED' : 'ON'}
                                    </button>
                                </div>

                                <div className={styles.volumeRow}>
                                    <span className={styles.rowDesc}>SFX Volume</span>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={muted ? 0 : volume}
                                        onChange={handleVolumeChange}
                                        className={styles.rangeInput}
                                    />
                                    <span className={styles.volBadge}>{muted ? '0%' : `${volume}%`}</span>
                                </div>
                            </div>

                            {hudPrefs && (
                                <div className={styles.sectionCard}>
                                    <h3 className={styles.sectionTitle}>Screen Interface</h3>
                                    <div className={styles.row}>
                                        <div className={styles.rowLabel}>
                                            <span className={styles.rowTitle}>Show Task List Panel</span>
                                            <span className={styles.rowDesc}>
                                                Display active tasks & total crew progress bar in match
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            className={`${styles.toggleBtn} ${
                                                hudPrefs.showTaskPanel ? styles.toggleOn : styles.toggleOff
                                            }`}
                                            onClick={() => togglePref('showTaskPanel')}
                                        >
                                            {hudPrefs.showTaskPanel ? 'SHOWN' : 'HIDDEN'}
                                        </button>
                                    </div>

                                    <div className={styles.row}>
                                        <div className={styles.rowLabel}>
                                            <span className={styles.rowTitle}>Show Lobby Rules Card</span>
                                            <span className={styles.rowDesc}>
                                                Show match settings summary card on top-left in dropship
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            className={`${styles.toggleBtn} ${
                                                hudPrefs.showRulesCard ? styles.toggleOn : styles.toggleOff
                                            }`}
                                            onClick={() => togglePref('showRulesCard')}
                                        >
                                            {hudPrefs.showRulesCard ? 'SHOWN' : 'HIDDEN'}
                                        </button>
                                    </div>

                                    <div className={styles.row}>
                                        <div className={styles.rowLabel}>
                                            <span className={styles.rowTitle}>Show Keybind Hints Bar</span>
                                            <span className={styles.rowDesc}>
                                                Display subtle shortcut bar at the bottom-left of screen
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            className={`${styles.toggleBtn} ${
                                                hudPrefs.showControlsHint ? styles.toggleOn : styles.toggleOff
                                            }`}
                                            onClick={() => togglePref('showControlsHint')}
                                        >
                                            {hudPrefs.showControlsHint ? 'SHOWN' : 'HIDDEN'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {tab === 'controls' && (
                        <div className={styles.sectionCard}>
                            <h3 className={styles.sectionTitle}>Keyboard & Mouse Shortcuts</h3>
                            <div className={styles.keyGrid}>
                                <div className={styles.keyRow}>
                                    <span className={styles.keyCap}>W A S D / ↑↓←→</span>
                                    <span className={styles.keyAction}>Move Crewmate / Ghost</span>
                                </div>
                                <div className={styles.keyRow}>
                                    <span className={styles.keyCap}>E</span>
                                    <span className={styles.keyAction}>Use / Task / Meeting / Laptop</span>
                                </div>
                                <div className={styles.keyRow}>
                                    <span className={styles.keyCap}>R</span>
                                    <span className={styles.keyAction}>Report Dead Body</span>
                                </div>
                                <div className={styles.keyRow}>
                                    <span className={styles.keyCap}>M</span>
                                    <span className={styles.keyAction}>Toggle Skeld Mini-Map</span>
                                </div>
                                <div className={styles.keyRow}>
                                    <span className={styles.keyCap}>Q / K</span>
                                    <span className={styles.keyAction}>Kill Crewmate (Impostor)</span>
                                </div>
                                <div className={styles.keyRow}>
                                    <span className={styles.keyCap}>V</span>
                                    <span className={styles.keyAction}>Enter / Exit Vent (Impostor)</span>
                                </div>
                                <div className={styles.keyRow}>
                                    <span className={styles.keyCap}>C</span>
                                    <span className={styles.keyAction}>Color & Name (In Lobby)</span>
                                </div>
                                <div className={styles.keyRow}>
                                    <span className={styles.keyCap}>Esc</span>
                                    <span className={styles.keyAction}>Open / Close Settings</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === 'rules' && (
                        <div className={styles.sectionCard}>
                            <h3 className={styles.sectionTitle}>Active Ship Rules — The Skeld</h3>
                            <div className={styles.rulesGrid}>
                                <div className={styles.ruleChip}>
                                    <span>Impostors</span>
                                    <b>{roomSettings.impostorCount}</b>
                                </div>
                                <div className={styles.ruleChip}>
                                    <span>Player Speed</span>
                                    <b>{roomSettings.playerSpeed}x</b>
                                </div>
                                <div className={styles.ruleChip}>
                                    <span>Crew Vision</span>
                                    <b>{roomSettings.crewVision}x</b>
                                </div>
                                <div className={styles.ruleChip}>
                                    <span>Impostor Vision</span>
                                    <b>{roomSettings.impostorVision}x</b>
                                </div>
                                <div className={styles.ruleChip}>
                                    <span>Kill Cooldown</span>
                                    <b>{roomSettings.killCooldownSec}s</b>
                                </div>
                                <div className={styles.ruleChip}>
                                    <span>Kill Distance</span>
                                    <b>{String(roomSettings.killDistance).toUpperCase()}</b>
                                </div>
                                <div className={styles.ruleChip}>
                                    <span>Tasks</span>
                                    <b>{roomSettings.tasksPerPlayer}</b>
                                </div>
                                <div className={styles.ruleChip}>
                                    <span>Voting Time</span>
                                    <b>{roomSettings.meetingDurationSec}s</b>
                                </div>
                                <div className={styles.ruleChip}>
                                    <span>Emergency Calls</span>
                                    <b>{roomSettings.emergencyMeetings}</b>
                                </div>
                                <div className={styles.ruleChip}>
                                    <span>Confirm Ejects</span>
                                    <b>{roomSettings.confirmEjects ? 'ON' : 'OFF'}</b>
                                </div>
                                <div className={styles.ruleChip}>
                                    <span>Anonymous Votes</span>
                                    <b>{roomSettings.anonymousVotes ? 'ON' : 'OFF'}</b>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    <div className={styles.footerGroup}>
                        {mode === 'waiting' && onOpenLaptopSettings && (
                            <button
                                type="button"
                                className={styles.secondaryBtn}
                                onClick={() => {
                                    soundFX.playClick();
                                    onClose?.();
                                    onOpenLaptopSettings();
                                }}
                            >
                                💻 {isHost ? 'Edit Match Rules & Color' : 'Customize Color & Name'}
                            </button>
                        )}
                        {(mode === 'waiting' || mode === 'game') && onLeaveRoom && (
                            <button
                                type="button"
                                className={styles.dangerBtn}
                                onClick={() => {
                                    soundFX.playClick();
                                    onClose?.();
                                    onLeaveRoom();
                                }}
                            >
                                🚪 Leave Room
                            </button>
                        )}
                    </div>

                    <button
                        type="button"
                        className={styles.primaryBtn}
                        onClick={() => {
                            soundFX.playClick();
                            onClose?.();
                        }}
                    >
                        {mode === 'game' ? 'Resume Game' : 'Done'}
                    </button>
                </div>
            </div>
        </div>
    );
}
