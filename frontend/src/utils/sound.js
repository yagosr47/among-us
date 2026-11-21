/**
 * Lightweight procedural Web Audio synthesizer for crisp Among Us-style SFX
 * No external MP3/WAV files required; respects mute state.
 */
class SoundEffects {
    constructor() {
        this.ctx = null;
        this.muted = localStorage.getItem('soundMuted') === 'true';
        const savedVol = Number(localStorage.getItem('soundVolume'));
        this.volume = Number.isFinite(savedVol) && savedVol >= 0 && savedVol <= 1 ? savedVol : 0.85;
    }

    _getCtx() {
        if (this.muted || typeof window === 'undefined') return null;
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
        return this.ctx;
    }

    isMuted() {
        return this.muted;
    }

    getVolume() {
        return this.volume;
    }

    setVolume(val) {
        const clamped = Math.max(0, Math.min(1, Number(val) || 0));
        this.volume = clamped;
        localStorage.setItem('soundVolume', String(clamped));
        return this.volume;
    }

    setMuted(nextMuted) {
        this.muted = Boolean(nextMuted);
        localStorage.setItem('soundMuted', String(this.muted));
        return this.muted;
    }

    toggleMute() {
        this.muted = !this.muted;
        localStorage.setItem('soundMuted', String(this.muted));
        return this.muted;
    }

    _tone(freq, duration, type = 'sine', volume = 0.14, delay = 0, endFreq = null) {
        const ctx = this._getCtx();
        if (!ctx) return;
        const scaledVol = Math.max(0.0001, volume * this.volume);
        const now = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (endFreq !== null) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
        }
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(scaledVol, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
    }

    playClick() {
        this._tone(620, 0.055, 'triangle', 0.1, 0, 380);
    }

    playFootstep() {
        this._tone(135, 0.045, 'sine', 0.035, 0, 75);
    }

    playShhh() {
        this._tone(160, 0.65, 'sawtooth', 0.12, 0, 70);
        this._tone(320, 0.5, 'triangle', 0.08, 0.05, 110);
    }

    playRoleReveal(isImposter) {
        if (isImposter) {
            this._tone(185, 0.45, 'sawtooth', 0.13, 0, 120);
            this._tone(138, 0.7, 'sawtooth', 0.14, 0.18, 92);
        } else {
            this._tone(440, 0.28, 'triangle', 0.11, 0);
            this._tone(554, 0.35, 'triangle', 0.11, 0.12);
            this._tone(659, 0.5, 'sine', 0.12, 0.24);
        }
    }

    playKill() {
        this._tone(240, 0.14, 'sawtooth', 0.2, 0, 55);
        this._tone(90, 0.32, 'square', 0.15, 0.06, 38);
    }

    playEmergency() {
        this._tone(490, 0.22, 'sawtooth', 0.15, 0, 440);
        this._tone(370, 0.28, 'sawtooth', 0.15, 0.22, 330);
        this._tone(490, 0.22, 'sawtooth', 0.15, 0.48, 440);
    }

    playReport() {
        this._tone(680, 0.18, 'square', 0.12, 0, 520);
        this._tone(520, 0.3, 'sawtooth', 0.13, 0.14, 280);
    }

    playVent() {
        this._tone(280, 0.16, 'triangle', 0.14, 0, 110);
        this._tone(140, 0.12, 'square', 0.07, 0.05, 90);
    }

    playTaskComplete() {
        this._tone(523.25, 0.15, 'sine', 0.12, 0);
        this._tone(659.25, 0.15, 'sine', 0.12, 0.1);
        this._tone(783.99, 0.3, 'triangle', 0.14, 0.2);
    }

    playVote() {
        this._tone(740, 0.08, 'sine', 0.1, 0, 920);
    }

    playChat() {
        this._tone(880, 0.06, 'sine', 0.07, 0, 1020);
    }

    playEject() {
        this._tone(220, 1.2, 'sine', 0.11, 0, 65);
    }

    playVictory() {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
            this._tone(f, 0.35, 'triangle', 0.12, idx * 0.11);
        });
    }

    playDefeat() {
        [311.13, 277.18, 233.08, 174.61].forEach((f, idx) => {
            this._tone(f, 0.4, 'sawtooth', 0.11, idx * 0.14);
        });
    }
}

export const soundFX = new SoundEffects();
export default soundFX;
