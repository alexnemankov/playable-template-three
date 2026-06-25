export class SoundManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private musicInterval: any = null;

  constructor() {
    // Browser autoplays block audio until the user interacts.
    // We register a one-off listener to start audio on the first user interaction.
    window.addEventListener('pointerdown', this.initAudio, { once: true });
    window.addEventListener('touchstart', this.initAudio, { once: true });
  }

  private initAudio = () => {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.playLofiMusicLoop();
    } catch (e) {
      console.warn('Web Audio API not supported in this browser/webview', e);
    }
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    if (this.ctx) {
      if (muted) {
        this.ctx.suspend();
      } else {
        this.ctx.resume();
      }
    }
  }

  // Soft pop sound effect when grabbing a tile
  public playGrabSFX() {
    if (!this.ctx || this.isMuted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, this.ctx.currentTime + 0.12);
      
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
    } catch (e) {
      // Bypassed if audio context is suspended or errored
    }
  }

  private lastCollisionTime: number = 0;

  // Short click/wood tap sound when tiles collide
  public playCollisionSFX(force: number) {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastCollisionTime < 0.1) return;
    this.lastCollisionTime = now;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      const baseFreq = 700 + Math.random() * 200;
      osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, this.ctx.currentTime + 0.06);
      
      const volume = Math.min(force * 0.4, 0.15);
      gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.06);
    } catch (e) {
      // Bypassed if context suspended
    }
  }

  // Satisfying C Major 7 arpeggio (C4, E4, G4, B4) arpeggiated success chords on snap
  public playSnapSFX() {
    if (!this.ctx || this.isMuted) return;
    try {
      const now = this.ctx.currentTime;
      const notes = [261.63, 329.63, 392.00, 493.88];
      
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        
        gain.gain.setValueAtTime(0.0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.45);
        
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.45);
      });
    } catch (e) {
      // Bypassed if context suspended
    }
  }

  // Synthesizes a warm, smooth background chord pad loop in real-time
  private playLofiMusicLoop() {
    if (!this.ctx) return;
    
    // Chord progression: Am7 -> D7 -> Gmaj7 -> Cmaj7 (very common jazz/lofi licks)
    const chords = [
      [220.00, 261.63, 329.63, 392.00], // Am7 (A3, C4, E4, G4)
      [293.66, 349.23, 440.00, 523.25], // D7 (D3, F4, A4, C5)
      [196.00, 246.94, 293.66, 392.00], // Gmaj7 (G3, B3, D4, G4)
      [261.63, 329.63, 392.00, 493.88]  // Cmaj7 (C4, E4, G4, B4)
    ];

    let step = 0;
    const playChord = () => {
      if (this.isMuted || !this.ctx) return;
      
      try {
        const now = this.ctx.currentTime;
        const chord = chords[step];
        
        chord.forEach((freq) => {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          
          osc.type = 'sine'; // Soft tone
          osc.frequency.setValueAtTime(freq, now);
          
          // Smooth fade attack and decay
          gain.gain.setValueAtTime(0.0, now);
          gain.gain.linearRampToValueAtTime(0.04, now + 1.2); 
          gain.gain.exponentialRampToValueAtTime(0.001, now + 3.8);
          
          osc.connect(gain);
          gain.connect(this.ctx!.destination);
          osc.start(now);
          osc.stop(now + 4.0);
        });
        
        step = (step + 1) % chords.length;
      } catch (e) {
        // Bypassed if context suspended
      }
    };

    // Play next chord pad every 4 seconds
    playChord();
    this.musicInterval = setInterval(playChord, 4000);
  }
}
