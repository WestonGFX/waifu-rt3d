import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceMode } from '../hooks/useVoiceMode';

/**
 * Tests for useVoiceMode — the hook that drives the voice-input pipeline:
 *   getUserMedia → AudioContext VAD → MediaRecorder → ASR → onTranscribed
 *
 * All browser APIs (getUserMedia, AudioContext, MediaRecorder, rAF, fetch) are
 * stubbed — jsdom provides none of them.  We build a single set of stubs per
 * test in beforeEach so each test starts from a clean slate.
 */

// ---------------------------------------------------------------------------
// Shared per-test mock state — rebuilt in beforeEach
// ---------------------------------------------------------------------------

/** Fake MediaRecorder instances captured at construction time. */
let capturedRecorders: FakeMediaRecorder[] = [];

/** Fake MediaStreamTrack — its stop() is spyable. */
let fakeTrack: { stop: ReturnType<typeof vi.fn> };

/** Fake AnalyserNode — getByteFrequencyData is controllable per test. */
let fakeAnalyser: {
  fftSize: number;
  frequencyBinCount: number;
  getByteFrequencyData: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
};

/** Fake AudioContext — we capture the close spy for assertions. */
let fakeAudioCtxClose: ReturnType<typeof vi.fn>;

/** Fake MediaStream returned by getUserMedia. */
let fakeStream: { getTracks: ReturnType<typeof vi.fn> };

/** The getUserMedia spy — controls success vs. rejection. */
let getUserMedia: ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// FakeMediaRecorder class — defined at module level so it can be re-constructed
// ---------------------------------------------------------------------------

class FakeMediaRecorder {
  state = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn(() => { this.state = 'recording'; });
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.onstop?.();
  });

  constructor(_stream: unknown, _opts?: unknown) {
    capturedRecorders.push(this);
  }

  static isTypeSupported = vi.fn(() => true);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  capturedRecorders = [];

  fakeTrack = { stop: vi.fn() };
  fakeStream = { getTracks: vi.fn(() => [fakeTrack]) };

  fakeAnalyser = {
    fftSize: 256,
    frequencyBinCount: 128,
    // Default: silence (all zeros — below the default threshold of 18)
    getByteFrequencyData: vi.fn((_buf: Uint8Array) => {}),
    connect: vi.fn(),
  };

  fakeAudioCtxClose = vi.fn().mockResolvedValue(undefined);

  const fakeSource = { connect: vi.fn() };

  // AudioContext must be a real constructor function for vi.stubGlobal to work
  const AudioContextCtor = function (this: unknown) {
    Object.assign(this as object, {
      createMediaStreamSource: vi.fn(() => fakeSource),
      createAnalyser: vi.fn(() => fakeAnalyser),
      close: fakeAudioCtxClose,
      state: 'running',
    });
  };

  getUserMedia = vi.fn().mockResolvedValue(fakeStream);

  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('AudioContext', AudioContextCtor);
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper — onTranscribed spy
// ---------------------------------------------------------------------------

function makeOnTranscribed() {
  return vi.fn<(text: string, autoSend: boolean) => void>();
}

// ---------------------------------------------------------------------------
// Helper — simulate one VAD frame with audio above the threshold
// ---------------------------------------------------------------------------

function runVADFrameWithSpeech() {
  // Make the analyser report high amplitude (100 >> default threshold 18)
  fakeAnalyser.getByteFrequencyData.mockImplementation((buf: Uint8Array) => {
    buf.fill(100);
  });
  // Drive the rAF callback that was registered during start()
  const rafSpy = requestAnimationFrame as ReturnType<typeof vi.fn>;
  const [rafCallback] = rafSpy.mock.calls[0] ?? [];
  if (typeof rafCallback === 'function') {
    act(() => { (rafCallback as () => void)(); });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useVoiceMode', () => {
  it('starts in idle state with voiceActive false', () => {
    const { result } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed() })
    );

    expect(result.current.voiceActive).toBe(false);
    expect(result.current.voiceState).toBe('idle');
  });

  it('exposes startVoiceMode, stopVoiceMode, and toggleVoiceMode', () => {
    const { result } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed() })
    );

    expect(typeof result.current.startVoiceMode).toBe('function');
    expect(typeof result.current.stopVoiceMode).toBe('function');
    expect(typeof result.current.toggleVoiceMode).toBe('function');
  });

  it('startVoiceMode happy path — sets voiceActive=true and voiceState=listening', async () => {
    const { result } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed() })
    );

    await act(async () => {
      await result.current.startVoiceMode();
    });

    expect(result.current.voiceActive).toBe(true);
    expect(result.current.voiceState).toBe('listening');
  });

  it('startVoiceMode — calls getUserMedia with audio:true, video:false', async () => {
    const { result } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed() })
    );

    await act(async () => {
      await result.current.startVoiceMode();
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
  });

  it('startVoiceMode — schedules a requestAnimationFrame for the VAD loop', async () => {
    const { result } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed() })
    );

    await act(async () => {
      await result.current.startVoiceMode();
    });

    expect(requestAnimationFrame).toHaveBeenCalled();
  });

  it('startVoiceMode — permission denied keeps state idle', async () => {
    const denied = new DOMException('Permission denied', 'NotAllowedError');
    getUserMedia.mockRejectedValueOnce(denied);

    const { result } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed() })
    );

    await act(async () => {
      await result.current.startVoiceMode();
    });

    expect(result.current.voiceActive).toBe(false);
    expect(result.current.voiceState).toBe('idle');
  });

  it('startVoiceMode — hardware not found keeps state idle', async () => {
    const noDevice = new DOMException('No device found', 'NotFoundError');
    getUserMedia.mockRejectedValueOnce(noDevice);

    const { result } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed() })
    );

    await act(async () => {
      await result.current.startVoiceMode();
    });

    expect(result.current.voiceActive).toBe(false);
    expect(result.current.voiceState).toBe('idle');
  });

  it('startVoiceMode — second call while active is a no-op (idempotent)', async () => {
    const { result } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed() })
    );

    await act(async () => { await result.current.startVoiceMode(); });
    await act(async () => { await result.current.startVoiceMode(); });

    // getUserMedia must have been called exactly once despite two start attempts
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('stopVoiceMode — resets voiceActive and voiceState to idle', async () => {
    const { result } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed() })
    );

    await act(async () => { await result.current.startVoiceMode(); });
    act(() => { result.current.stopVoiceMode(); });

    expect(result.current.voiceActive).toBe(false);
    expect(result.current.voiceState).toBe('idle');
  });

  it('stopVoiceMode — calls track.stop() on every MediaStream track', async () => {
    const { result } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed() })
    );

    await act(async () => { await result.current.startVoiceMode(); });
    act(() => { result.current.stopVoiceMode(); });

    expect(fakeTrack.stop).toHaveBeenCalled();
  });

  it('stopVoiceMode — closes the AudioContext', async () => {
    const { result } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed() })
    );

    await act(async () => { await result.current.startVoiceMode(); });
    act(() => { result.current.stopVoiceMode(); });

    expect(fakeAudioCtxClose).toHaveBeenCalled();
  });

  it('stopVoiceMode — calls cancelAnimationFrame to prevent rAF loop leak', async () => {
    const { result } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed() })
    );

    await act(async () => { await result.current.startVoiceMode(); });
    act(() => { result.current.stopVoiceMode(); });

    // rAF handle returned by our stub was 42
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
  });

  it('stopVoiceMode from idle state — safe, does not throw', () => {
    const { result } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed() })
    );

    expect(() => {
      act(() => { result.current.stopVoiceMode(); });
    }).not.toThrow();

    expect(result.current.voiceState).toBe('idle');
  });

  it('toggleVoiceMode — starts voice from idle, then stops on second call', async () => {
    const { result } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed() })
    );

    // First toggle: idle → listening
    await act(async () => {
      result.current.toggleVoiceMode();
      await Promise.resolve(); // allow getUserMedia promise to settle
      await Promise.resolve();
    });

    expect(result.current.voiceActive).toBe(true);

    // Second toggle: active → idle
    act(() => { result.current.toggleVoiceMode(); });

    expect(result.current.voiceActive).toBe(false);
    expect(result.current.voiceState).toBe('idle');
  });

  it('unmount — triggers cleanup, stopping all media tracks and closing AudioContext', async () => {
    const { result, unmount } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed() })
    );

    await act(async () => { await result.current.startVoiceMode(); });

    act(() => { unmount(); });

    expect(fakeTrack.stop).toHaveBeenCalled();
    expect(fakeAudioCtxClose).toHaveBeenCalled();
  });

  it('onSpeechStart — fired on the first high-amplitude VAD frame', async () => {
    const onSpeechStart = vi.fn();
    const { result } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed(), onSpeechStart })
    );

    await act(async () => { await result.current.startVoiceMode(); });

    runVADFrameWithSpeech();

    expect(onSpeechStart).toHaveBeenCalledTimes(1);
  });

  it('onSpeechStart — not called when audio stays below silence threshold', async () => {
    const onSpeechStart = vi.fn();
    const { result } = renderHook(() =>
      useVoiceMode({ onTranscribed: makeOnTranscribed(), onSpeechStart, silenceThreshold: 18 })
    );

    await act(async () => { await result.current.startVoiceMode(); });

    // Override analyser to return values below the threshold
    fakeAnalyser.getByteFrequencyData.mockImplementation((buf: Uint8Array) => {
      buf.fill(5); // Well below threshold 18
    });
    const rafSpy = requestAnimationFrame as ReturnType<typeof vi.fn>;
    const [rafCallback] = rafSpy.mock.calls[0] ?? [];
    if (typeof rafCallback === 'function') {
      act(() => { (rafCallback as () => void)(); });
    }

    expect(onSpeechStart).not.toHaveBeenCalled();
  });

  it('transcribe path — successful ASR calls onTranscribed with text and autoSend=true', async () => {
    const onTranscribed = makeOnTranscribed();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ text: 'hello world' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const { result } = renderHook(() => useVoiceMode({ onTranscribed }));

    await act(async () => { await result.current.startVoiceMode(); });

    // A MediaRecorder should have been created and started
    expect(capturedRecorders.length).toBeGreaterThan(0);
    const recorder = capturedRecorders[0];

    // Simulate speech detection (sets speakingRef=true via VAD)
    runVADFrameWithSpeech();

    // Push a fake audio chunk into the recorder
    await act(async () => {
      recorder.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
    });

    // Drive recorder.onstop — with speakingRef=true and chunks present, transcribeChunk is called
    await act(async () => {
      recorder.stop();
      // Let the fetch promise chain resolve through multiple microtask ticks
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/asr/transcribe',
      expect.objectContaining({ method: 'POST' })
    );
    expect(onTranscribed).toHaveBeenCalledWith('hello world', true);
  });

  it('transcribe path — network failure does not call onTranscribed', async () => {
    const onTranscribed = makeOnTranscribed();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { result } = renderHook(() => useVoiceMode({ onTranscribed }));

    await act(async () => { await result.current.startVoiceMode(); });

    expect(capturedRecorders.length).toBeGreaterThan(0);
    const recorder = capturedRecorders[0];

    runVADFrameWithSpeech();

    await act(async () => {
      recorder.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
    });

    await act(async () => {
      recorder.stop();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onTranscribed).not.toHaveBeenCalled();
  });

  it('transcribe path — whitespace-only ASR response does not call onTranscribed', async () => {
    const onTranscribed = makeOnTranscribed();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ text: '   ' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const { result } = renderHook(() => useVoiceMode({ onTranscribed }));

    await act(async () => { await result.current.startVoiceMode(); });

    const recorder = capturedRecorders[0];

    runVADFrameWithSpeech();

    await act(async () => {
      recorder.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
    });

    await act(async () => {
      recorder.stop();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onTranscribed).not.toHaveBeenCalled();
  });
});
