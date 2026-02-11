export const microcopy = {
  status: {
    stable: 'Uplink stable',
    thinking: 'Neural link processing',
    typing: 'Signal composing',
    sending: 'Transmission in progress',
    voiceIdle: 'Voice scope idle',
    voiceMic: 'Voice scope tracking mic',
    voiceTts: 'Voice scope tracking synth',
    voiceMixed: 'Voice scope tracking dual stream',
    memorySession: 'Session graph mode',
    memoryRag: 'RAG memory mode',
    memoryOffline: 'Semantic memory offline',
    memorySyncing: 'Memory graph syncing',
    memoryEmpty: 'No graph links yet',
    syncing: 'Syncing protocol'
  },
  input: {
    placeholder: 'Transmit to neural channel...',
    send: 'Transmit',
    micOn: 'Audio stream on',
    micOff: 'Audio stream off'
  },
  errors: {
    sendFailed: 'Transmission failed. Retry protocol available.',
    memoryFailed: 'Memory bank unavailable. Running session fallback.',
    micDenied: 'Audio stream permission denied.',
    micUnavailable: 'Audio capture is unavailable on this device.',
    micFailed: 'Audio stream initialization failed.',
    settingsSyncFailed: 'Protocol sync failed. Settings kept local until retry.'
  },
  actions: {
    retry: 'Retry',
    refresh: 'Refresh',
    openSettings: 'HUD',
    apply: 'Apply protocol',
    close: 'Close'
  }
} as const;
