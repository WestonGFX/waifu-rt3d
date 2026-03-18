import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseModel = vi.fn();
const mockUseApp = vi.fn();
const mockUseCompanion = vi.fn();
const mockUseEnvironment = vi.fn();

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();

  class FailingWebGLRenderer {
    domElement: HTMLCanvasElement;

    constructor(options: { canvas?: HTMLCanvasElement } = {}) {
      this.domElement = options.canvas ?? document.createElement('canvas');
      throw new Error('Error creating WebGL context.');
    }

    setPixelRatio() {}
    setSize() {}
    dispose() {}
    render() {}
  }

  return {
    ...actual,
    WebGLRenderer: FailingWebGLRenderer,
  };
});

vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: class OrbitControls {
    target = { set: vi.fn(), copy: vi.fn() };
    enabled = true;
    enablePan = true;
    enableZoom = true;
    screenSpacePanning = true;
    minDistance = 0.5;
    maxDistance = 8;
    rotateSpeed = 1;
    update() {}
    dispose() {}
  },
}));

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class GLTFLoader {
    register() {}
    load() {}
  },
}));

vi.mock('@pixiv/three-vrm', () => ({
  VRMLoaderPlugin: class VRMLoaderPlugin {},
  VRM: class VRM {},
  VRMUtils: {
    removeUnnecessaryVertices: vi.fn(),
    combineSkeletons: vi.fn(),
    combineMorphs: vi.fn(),
    rotateVRM0: vi.fn(),
  },
}));

vi.mock('three-mesh-bvh', () => ({
  acceleratedRaycast: vi.fn(),
  computeBoundsTree: vi.fn(),
  disposeBoundsTree: vi.fn(),
}));

vi.mock('../../context/ModelContext.tsx', () => ({
  useModel: () => mockUseModel(),
}));

vi.mock('../../context/AppContext.tsx', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('../../context/CompanionContext.tsx', () => ({
  useCompanion: () => mockUseCompanion(),
}));

vi.mock('../../context/EnvironmentContext.tsx', () => ({
  useEnvironment: () => mockUseEnvironment(),
}));

vi.mock('../../providers/registry.ts', () => ({
  getAnimationProvider: vi.fn(() => ({
    generate: vi.fn(async () => null),
  })),
}));

vi.mock('./ViewerChrome.tsx', () => ({
  default: () => <div data-testid="viewer-chrome">viewer chrome</div>,
}));

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

describe('ThreeViewer', () => {
  beforeEach(() => {
    mockUseModel.mockReturnValue({
      state: {
        modelUrl: null,
        isLoading: false,
        error: null,
        loadingProgress: 0,
      },
      dispatch: vi.fn(),
    });

    mockUseApp.mockReturnValue({
      state: {
        avatar: {
          phase: 'idle',
          emotion: 'neutral',
          gesture: 'none',
          gaze: 'camera',
          energy: 0.4,
          intimacy: 0.2,
          talkIntensity: 0,
          reaction: 'none',
          idle: 'neutral',
          lastAssistantText: '',
        },
        avatarTuning: {},
        providerConfig: {
          animation: { primary: 'performance' },
        },
        metrics: {
          currentFps: 0,
          averageFps: 0,
        },
      },
      dispatch: vi.fn(),
    });

    mockUseCompanion.mockReturnValue({
      state: {
        renderSettings: {
          antialias: true,
          orbitSensitivity: 1,
          pixelRatioCap: 1,
        },
      },
      activePersona: null,
    });

    mockUseEnvironment.mockReturnValue({
      currentEnvironment: null,
      state: {
        roomRuntime: {
          roomMode: 'none',
        },
        familiarityByEnvironmentId: {},
      },
      incrementFamiliarity: vi.fn(),
      setRoomRuntime: vi.fn(),
    });
  });

  it('shows a graceful fallback when WebGL renderer creation fails', async () => {
    const { default: ThreeViewer } = await import('./ThreeViewer.tsx');

    expect(() => render(<ThreeViewer />)).not.toThrow();
    expect(await screen.findByText('3D viewer unavailable')).toBeInTheDocument();
    expect(screen.getByText(/3D rendering is unavailable in this browser session right now/i)).toBeInTheDocument();
    expect(screen.getByTestId('viewer-chrome')).toBeInTheDocument();
    expect(document.querySelector('.viewer-stage')).toHaveAttribute('data-render-paused', 'false');
  });
});
