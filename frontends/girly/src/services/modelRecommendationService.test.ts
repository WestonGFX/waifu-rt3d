import { describe, expect, it } from 'vitest';
import {
  buildModelRecommendation,
  buildRecommendedProviderPatch,
  needsProviderPatch,
} from './modelRecommendationService.ts';
import { type HelperCapabilities, type RuntimeModelInfo } from '../types/companion.ts';

const helperCapabilities: HelperCapabilities = {
  helperPythonVersion: '3.14.0',
  recommendedPython: '3.11 or 3.12',
  bootstrapScriptPath: '/tmp/bootstrap.py',
  recommendedBootstrapCommand: 'python3.12 /tmp/bootstrap.py',
  pythonCandidates: ['python3.12', 'python3'],
  voice: {
    localOnly: true,
    cloudOnly: true,
    hybrid: true,
  },
  llmRuntimes: ['ollama'],
  memory: {
    threadSummaries: true,
    longTerm: 'scaffolded',
  },
  localProviders: [],
  system: {
    machineModel: 'Mac14,9',
    chip: 'Apple M2 Pro',
    totalMemoryBytes: 32 * 1024 ** 3,
    metalDeviceName: 'Apple M2 Pro',
    recommendedMaxWorkingSetBytes: 26800603136,
    hasUnifiedMemory: true,
  },
};

const qwenModel: RuntimeModelInfo = {
  id: 'qwen3-vl:4b',
  family: 'qwen3vl',
  parameterSize: '4.4B',
  quantizationLevel: 'Q4_K_M',
  contextWindow: 262144,
  modifiedAt: '2026-02-03T17:35:49.357306816-08:00',
  loaded: false,
  capabilities: ['completion', 'vision', 'tools', 'thinking'],
  supportsTools: true,
  supportsVision: true,
  supportsReasoning: true,
};

describe('modelRecommendationService', () => {
  it('recommends a balanced default well below the hard maximum on this machine', () => {
    const recommendation = buildModelRecommendation(qwenModel, helperCapabilities);
    expect(recommendation).not.toBeNull();
    expect(recommendation?.recommendedContextWindow).toBe(65536);
    expect(recommendation?.presets.map((preset) => preset.contextWindow)).toEqual([65536, 131072, 262144]);
  });

  it('builds an auto-tune patch for the current runtime model', () => {
    const patch = buildRecommendedProviderPatch(qwenModel, helperCapabilities);
    expect(patch).toMatchObject({
      autoTune: true,
      contextWindow: 65536,
      keepModelWarm: true,
      enableTools: true,
      enableReasoning: true,
      enableVision: true,
    });
  });

  it('detects when an existing config already matches the recommendation', () => {
    const patch = buildRecommendedProviderPatch(qwenModel, helperCapabilities);
    expect(needsProviderPatch({
      autoTune: true,
      contextWindow: 65536,
      keepModelWarm: true,
      keepAlive: '30m',
      enableTools: true,
      enableReasoning: true,
      enableVision: true,
    }, patch)).toBe(false);
  });
});
