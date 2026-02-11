export const microcopy = {
  status: {
    stable: 'Uplink stable',
    thinking: 'Neural link processing',
    typing: 'Signal composing',
    memorySession: 'Session graph mode',
    memoryRag: 'RAG memory mode',
    memoryOffline: 'Semantic memory offline'
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
    micFailed: 'Audio stream initialization failed.'
  },
  actions: {
    retry: 'Retry',
    openSettings: 'HUD',
    apply: 'Apply protocol',
    close: 'Close'
  }
} as const;
