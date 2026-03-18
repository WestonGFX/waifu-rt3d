import { type ProviderConfig, type ProviderOptionsBag } from '../types/index.ts';
import { type RuntimeModelInfo, type RuntimeStatus } from '../types/companion.ts';

export function getProviderOptions(
  providerConfig: ProviderConfig,
  providerId: string,
): ProviderOptionsBag {
  return providerConfig.providerOptions?.[providerId] ?? {};
}

export function updateProviderOptions(
  providerConfig: ProviderConfig,
  providerId: string,
  patch: Partial<ProviderOptionsBag>,
): ProviderConfig {
  return {
    ...providerConfig,
    providerOptions: {
      ...(providerConfig.providerOptions ?? {}),
      [providerId]: {
        ...(providerConfig.providerOptions?.[providerId] ?? {}),
        ...patch,
      },
    },
  };
}

export function resolveConfiguredLLMModelId(providerConfig: ProviderConfig): string | undefined {
  return getProviderOptions(providerConfig, providerConfig.llm.primary).model;
}

export function resolveCurrentRuntimeStatus(
  runtimeStatuses: RuntimeStatus[],
  providerConfig: ProviderConfig,
): RuntimeStatus | undefined {
  return runtimeStatuses.find((runtime) => runtime.id === providerConfig.llm.primary);
}

export function resolveCurrentRuntimeModel(
  runtimeStatuses: RuntimeStatus[],
  providerConfig: ProviderConfig,
): RuntimeModelInfo | undefined {
  const runtime = resolveCurrentRuntimeStatus(runtimeStatuses, providerConfig);
  if (!runtime) return undefined;

  const configuredModelId = resolveConfiguredLLMModelId(providerConfig);
  if (configuredModelId) {
    return runtime.models.find((model) => model.id === configuredModelId);
  }

  if (runtime.activeModelId) {
    return runtime.models.find((model) => model.id === runtime.activeModelId);
  }

  return runtime.models[0];
}

export function resolveEffectiveContextWindow(
  runtimeStatuses: RuntimeStatus[],
  providerConfig: ProviderConfig,
  fallback = 4096,
): number {
  const providerId = providerConfig.llm.primary;
  const configured = getProviderOptions(providerConfig, providerId).contextWindow;
  const runtimeModel = resolveCurrentRuntimeModel(runtimeStatuses, providerConfig);
  return configured ?? runtimeModel?.contextWindow ?? fallback;
}

export function resolveMaximumContextWindow(
  runtimeStatuses: RuntimeStatus[],
  providerConfig: ProviderConfig,
): number | undefined {
  return resolveCurrentRuntimeModel(runtimeStatuses, providerConfig)?.contextWindow;
}
