/**
 * Simple lip sync system for VRM avatars
 * Analyzes audio and generates viseme (mouth shape) data
 */

export class LipSyncController {
  constructor(vrm, audioContext) {
    this.vrm = vrm;
    this.audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = null;
    this.isPlaying = false;
    this.animationFrame = null;
  }

  /**
   * Start lip sync with audio URL
   * @param {string} audioUrl - URL to audio file
   */
  async start(audioUrl) {
    if (this.isPlaying) this.stop();

    try {
      // Fetch and decode audio
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      // Create audio source
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;

      // Create analyser for volume detection
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);

      // Start playback
      source.start(0);
      this.isPlaying = true;

      // Animate mouth based on volume
      this.animate();

      // Stop when audio ends
      source.onended = () => {
        this.stop();
      };

    } catch (error) {
      console.error('Lip sync error:', error);
      this.stop();
    }
  }

  /**
   * Animate mouth based on audio volume
   */
  animate() {
    if (!this.isPlaying || !this.analyser || !this.vrm) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    // Calculate average volume
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const normalizedVolume = Math.min(average / 128, 1.0); // 0.0 to 1.0

    // Apply to VRM blend shapes
    if (this.vrm.expressionManager) {
      // VRM 1.0
      const mouth = this.vrm.expressionManager.getExpression('aa'); // 'aa' is mouth open
      if (mouth) {
        this.vrm.expressionManager.setValue('aa', normalizedVolume * 0.8);
      }
    } else if (this.vrm.blendShapeProxy) {
      // VRM 0.x
      this.vrm.blendShapeProxy.setValue('a', normalizedVolume * 0.8);
    }

    // Continue animation
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  /**
   * Stop lip sync
   */
  stop() {
    this.isPlaying = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // Reset mouth
    if (this.vrm) {
      if (this.vrm.expressionManager) {
        this.vrm.expressionManager.setValue('aa', 0);
      } else if (this.vrm.blendShapeProxy) {
        this.vrm.blendShapeProxy.setValue('a', 0);
      }
    }
  }
}

/**
 * Simple phoneme-based lip sync (more advanced)
 * Maps text to mouth shapes
 */
export class PhonemeLipSync {
  constructor(vrm) {
    this.vrm = vrm;
    this.phonemeMap = {
      'A': ['a', 'ah', 'aa'],     // Mouth open
      'E': ['e', 'eh', 'ee'],     // Mouth smile
      'I': ['i', 'ih', 'ii'],     // Mouth thin smile
      'O': ['o', 'oh', 'oo'],     // Mouth round
      'U': ['u', 'uh', 'uu'],     // Mouth small round
      'N': ['n', 'm', 'ng'],      // Closed
      'S': ['s', 'sh', 'ch'],     // Teeth
    };
  }

  /**
   * Estimate phonemes from text (very basic)
   * In production, use a proper phoneme library or API
   */
  textToPhonemes(text) {
    const phonemes = [];
    const words = text.toLowerCase().split(/\s+/);

    for (const word of words) {
      for (const char of word) {
        const upper = char.toUpperCase();
        if ('AEIOU'.includes(upper)) {
          phonemes.push(upper);
        } else if ('NM'.includes(upper)) {
          phonemes.push('N');
        } else if ('SH'.includes(upper)) {
          phonemes.push('S');
        } else {
          phonemes.push('N'); // Default closed
        }
      }
    }

    return phonemes;
  }

  /**
   * Play phoneme sequence
   * @param {Array} phonemes - Array of phoneme codes
   * @param {number} duration - Total duration in ms
   */
  async playPhonemes(phonemes, duration = 3000) {
    const timePerPhoneme = duration / phonemes.length;

    for (let i = 0; i < phonemes.length; i++) {
      const phoneme = phonemes[i];
      this.setMouth(phoneme);
      await new Promise(resolve => setTimeout(resolve, timePerPhoneme));
    }

    // Reset
    this.setMouth('N');
  }

  /**
   * Set mouth shape for phoneme
   */
  setMouth(phoneme) {
    if (!this.vrm) return;

    // Reset all
    const shapes = ['a', 'e', 'i', 'o', 'u'];
    const setValue = (name, value) => {
      if (this.vrm.expressionManager) {
        this.vrm.expressionManager.setValue(name, value);
      } else if (this.vrm.blendShapeProxy) {
        this.vrm.blendShapeProxy.setValue(name, value);
      }
    };

    shapes.forEach(s => setValue(s, 0));

    // Set target phoneme
    const shapeMap = {
      'A': 'a',
      'E': 'e',
      'I': 'i',
      'O': 'o',
      'U': 'u',
      'N': null // Closed
    };

    const shape = shapeMap[phoneme];
    if (shape) {
      setValue(shape, 1.0);
    }
  }
}
