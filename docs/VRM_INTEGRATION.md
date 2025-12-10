# VRM Model Integration Guide

## Overview

This guide covers how to integrate the `.vrm` 3D avatar models located in `/VRM models/` with your AI waifu application for a complete interactive experience.

---

## 📁 Available VRM Models

Your project includes three pre-made VRM avatars:

| Model | File | Size | Description |
|-------|------|------|-------------|
| **Panicandy** | `Panicandy.vrm` | 15.2 MB | Full model with outline |
| **Panicandy (No Outline)** | `Panicandy-no-outline.vrm` | 15.2 MB | Cleaner look, better performance |
| **Tsuki** | `Tsuki.vrm` | 16.5 MB | Alternative character design |

**Recommendation:** Start with `Panicandy-no-outline.vrm` for development (better FPS, cleaner aesthetic).

---

## 🎭 What is VRM?

VRM is an open 3D avatar format designed for VR/AR applications and VTuber software. It includes:
- 3D mesh and textures
- Bone rigging for animation
- Blend shapes for facial expressions
- Metadata (name, author, license)

**Key Features:**
- Humanoid rig compatible with Unity/WebGL
- Built-in expression presets (happy, sad, angry, etc.)
- Optimized for real-time rendering

---

## 🛠 Technical Integration

### Option 1: Web-Based (Three.js + VRM Loader) ⭐ RECOMMENDED

For your React/TypeScript project, use Three.js with the VRM loader.

#### Installation

```bash
npm install three @pixiv/three-vrm
# or
pnpm add three @pixiv/three-vrm
```

#### Basic Implementation

```typescript
// src/components/VRMViewer.tsx
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

export function VRMViewer({ modelPath }: { modelPath: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vrmRef = useRef<VRM | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Setup scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      30,
      window.innerWidth / window.innerHeight,
      0.1,
      20
    );
    camera.position.set(0, 1.4, 3);

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      alpha: true,
      antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Lighting
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1).normalize();
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // Load VRM
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      modelPath,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM;
        vrmRef.current = vrm;

        // Optional: Apply VRM utilities
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);

        // Add to scene
        scene.add(vrm.scene);

        console.log('VRM loaded:', vrm);
      },
      (progress) => {
        console.log(
          'Loading:',
          (progress.loaded / progress.total) * 100,
          '%'
        );
      },
      (error) => console.error('Error loading VRM:', error)
    );

    // Animation loop
    const clock = new THREE.Clock();
    function animate() {
      requestAnimationFrame(animate);

      const deltaTime = clock.getDelta();
      if (vrmRef.current) {
        // Update VRM (required for animations/blend shapes)
        vrmRef.current.update(deltaTime);
      }

      renderer.render(scene, camera);
    }
    animate();

    // Cleanup
    return () => {
      renderer.dispose();
    };
  }, [modelPath]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100vh' }} />;
}
```

#### Usage in App

```tsx
// src/App.tsx
import { VRMViewer } from './components/VRMViewer';

function App() {
  return (
    <div className="app">
      <VRMViewer modelPath="/VRM models/Panicandy-no-outline.vrm" />
      {/* Chat UI overlays here */}
    </div>
  );
}
```

---

### Option 2: Unity Integration (For Desktop App)

If building a Unity-based desktop application:

#### Setup

1. Install **UniVRM** package:
   - Download from: https://github.com/vrm-c/UniVRM/releases
   - Import into Unity project

2. Import VRM model:
   ```
   Assets → Import New Asset → Select Panicandy.vrm
   ```

3. Drag model into scene hierarchy

4. Add animation controller for expressions

#### C# Script Example

```csharp
using UnityEngine;
using VRM;

public class VRMController : MonoBehaviour
{
    private VRMBlendShapeProxy blendShapeProxy;

    void Start()
    {
        blendShapeProxy = GetComponent<VRMBlendShapeProxy>();
    }

    // Trigger expression
    public void SetExpression(string emotion)
    {
        switch (emotion)
        {
            case "happy":
                blendShapeProxy.ImmediatelySetValue(BlendShapePreset.Joy, 1.0f);
                break;
            case "sad":
                blendShapeProxy.ImmediatelySetValue(BlendShapePreset.Sorrow, 1.0f);
                break;
            case "angry":
                blendShapeProxy.ImmediatelySetValue(BlendShapePreset.Angry, 1.0f);
                break;
            // Add more expressions
        }
    }

    void Update()
    {
        // Smoothly blend back to neutral
        blendShapeProxy.Apply();
    }
}
```

---

## 🎨 Expression Mapping

Map LLM emotions to VRM blend shapes:

### Standard VRM Expressions

| VRM BlendShape | Use Case | LLM Emotion Tags |
|----------------|----------|------------------|
| `joy` | Happy, excited | joy, hype, proud |
| `angry` | Frustrated, tsundere | angry, tense |
| `sorrow` | Sad, empathetic | sad, melancholy |
| `fun` | Playful, teasing | playful, smug |
| `neutral` | Default state | calm, neutral |
| `blink` | Automatic | (always active) |
| `blinkLeft/Right` | Winking | flirt, playful |
| `a, i, u, e, o` | Lip sync | (text-to-speech) |

### Emotion Detection → Expression Trigger

```typescript
// src/services/expressionService.ts
import { VRM } from '@pixiv/three-vrm';

export class ExpressionService {
  private vrm: VRM;

  constructor(vrm: VRM) {
    this.vrm = vrm;
  }

  setExpressionFromEmotion(emotion: string, intensity: number = 1.0) {
    const expressionMap: Record<string, string> = {
      joy: 'happy',
      surprise: 'happy',
      smug: 'fun',
      flirt: 'fun',
      shy: 'fun',
      panic: 'angry',
      melancholy: 'sorrow',
      proud: 'happy',
      calm: 'neutral',
      tense: 'angry',
    };

    const vrmExpression = expressionMap[emotion] || 'neutral';
    this.applyExpression(vrmExpression, intensity);
  }

  private applyExpression(name: string, value: number) {
    const blendShapeProxy = this.vrm.expressionManager;
    if (blendShapeProxy) {
      blendShapeProxy.setValue(name, value);
    }
  }

  // Gradual blend to expression
  async transitionToExpression(name: string, duration: number = 500) {
    const blendShapeProxy = this.vrm.expressionManager;
    const steps = 20;
    const stepDuration = duration / steps;

    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      blendShapeProxy?.setValue(name, progress);
      await new Promise((resolve) => setTimeout(resolve, stepDuration));
    }
  }
}
```

### Integration with Chat

```typescript
// When receiving LLM response:
const response = await llm.chat(userMessage);

// Parse emotion from response metadata
const emotion = response.emotion || 'neutral'; // From vocabulary system

// Trigger expression
expressionService.setExpressionFromEmotion(emotion, 0.8);
```

---

## 🎤 Lip Sync (Text-to-Speech Integration)

Sync VRM mouth movements with TTS audio.

### Phoneme-Based Lip Sync

```typescript
import { VRM } from '@pixiv/three-vrm';

export class LipSyncService {
  private vrm: VRM;
  private audioContext: AudioContext;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.audioContext = new AudioContext();
  }

  // Simple amplitude-based lip sync
  async syncWithAudio(audioBuffer: AudioBuffer) {
    const analyser = this.audioContext.createAnalyser();
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(this.audioContext.destination);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const animate = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

      // Map volume to mouth opening
      const mouthValue = Math.min(average / 128, 1.0);
      this.vrm.expressionManager?.setValue('a', mouthValue);

      if (source.context.state === 'running') {
        requestAnimationFrame(animate);
      }
    };

    source.start();
    animate();
  }

  // Advanced: Phoneme-based sync (requires TTS phoneme timestamps)
  async syncWithPhonemes(phonemes: Array<{ phoneme: string; time: number }>) {
    for (const { phoneme, time } of phonemes) {
      setTimeout(() => {
        const visemeMap: Record<string, string> = {
          a: 'a',
          i: 'i',
          u: 'u',
          e: 'e',
          o: 'o',
        };
        const viseme = visemeMap[phoneme] || 'a';
        this.vrm.expressionManager?.setValue(viseme, 1.0);
      }, time);
    }
  }
}
```

---

## 📐 Camera & Scene Setup

### Optimal Camera Positioning

```typescript
// Portrait mode (face focus)
camera.position.set(0, 1.5, 1.2);
camera.lookAt(0, 1.4, 0); // Head height

// Full body view
camera.position.set(0, 1.0, 3.5);
camera.lookAt(0, 0.9, 0);

// Cinematic angle
camera.position.set(0.5, 1.6, 2.0);
camera.lookAt(0, 1.4, 0);
```

### Lighting Setup

```typescript
// Three-point lighting for VRM
const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
keyLight.position.set(2, 3, 3);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
fillLight.position.set(-2, 1, 2);
scene.add(fillLight);

const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
backLight.position.set(0, 3, -3);
scene.add(backLight);

// Ambient for overall brightness
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
```

### Background Options

```typescript
// Option 1: Transparent (overlay on app)
renderer.setClearColor(0x000000, 0);

// Option 2: Gradient background
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d')!;
const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
gradient.addColorStop(0, '#ff9ff3');
gradient.addColorStop(1, '#feca57');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, canvas.width, canvas.height);
const texture = new THREE.CanvasTexture(canvas);
scene.background = texture;

// Option 3: Solid color
scene.background = new THREE.Color(0x1a1a2e);
```

---

## 🎮 User Interaction

### Model Selection UI

```tsx
// src/components/ModelSelector.tsx
import { useState } from 'react';

const MODELS = [
  {
    name: 'Panicandy',
    path: '/VRM models/Panicandy-no-outline.vrm',
    thumbnail: '/thumbnails/panicandy.png',
  },
  {
    name: 'Tsuki',
    path: '/VRM models/Tsuki.vrm',
    thumbnail: '/thumbnails/tsuki.png',
  },
];

export function ModelSelector({ onSelect }: { onSelect: (path: string) => void }) {
  const [selected, setSelected] = useState(MODELS[0].path);

  return (
    <div className="model-selector">
      <h3>Choose Your Waifu</h3>
      <div className="model-grid">
        {MODELS.map((model) => (
          <button
            key={model.path}
            className={selected === model.path ? 'selected' : ''}
            onClick={() => {
              setSelected(model.path);
              onSelect(model.path);
            }}
          >
            <img src={model.thumbnail} alt={model.name} />
            <span>{model.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Camera Controls (Orbit)

```typescript
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// Add to VRMViewer setup
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.4, 0); // Look at head
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.0;
controls.maxDistance = 5.0;
controls.maxPolarAngle = Math.PI / 1.5; // Prevent going below model
controls.update();

// In animation loop:
controls.update();
```

---

## 🔧 Performance Optimization

### 1. Model Optimization

```typescript
import { VRMUtils } from '@pixiv/three-vrm';

// After loading VRM:
VRMUtils.removeUnnecessaryVertices(gltf.scene);
VRMUtils.removeUnnecessaryJoints(gltf.scene);

// Reduce polygon count (if needed)
gltf.scene.traverse((object) => {
  if (object instanceof THREE.Mesh) {
    object.castShadow = false; // Disable shadows for performance
    object.receiveShadow = false;
  }
});
```

### 2. Render Settings

```typescript
// Lower pixel ratio on mobile
const pixelRatio = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);

// Enable power preference
const renderer = new THREE.WebGLRenderer({
  canvas: canvasRef.current,
  powerPreference: 'high-performance',
  antialias: window.devicePixelRatio < 2, // Only on low-DPI
});
```

### 3. Lazy Loading

```typescript
// Only load VRM when user enters 3D view
const [modelLoaded, setModelLoaded] = useState(false);

useEffect(() => {
  if (isVisible && !modelLoaded) {
    loadVRM(modelPath);
    setModelLoaded(true);
  }
}, [isVisible]);
```

---

## 🎯 Complete Integration Flow

### End-to-End Pipeline

```
User Message
    ↓
LLM Processing (with system prompt + vocabulary)
    ↓
Response Generation
    ↓
├─→ Text Display (Chat UI)
├─→ Emotion Detection (from vocab metadata)
│     ↓
│   VRM Expression Update
├─→ TTS Generation (optional)
      ↓
    VRM Lip Sync
```

### Example Implementation

```typescript
// src/services/waifuService.ts
export class WaifuService {
  private vrm: VRM;
  private expressionService: ExpressionService;
  private lipSyncService: LipSyncService;

  async processUserMessage(message: string): Promise<void> {
    // 1. Get LLM response
    const llmResponse = await this.llm.chat(message);

    // 2. Detect emotion from vocabulary
    const emotion = this.vocab.detectEmotion(llmResponse.text);

    // 3. Update VRM expression
    await this.expressionService.transitionToExpression(emotion, 300);

    // 4. Generate TTS (if enabled)
    if (this.settings.ttsEnabled) {
      const audio = await this.tts.generate(llmResponse.text);
      await this.lipSyncService.syncWithAudio(audio);
    }

    // 5. Display text in chat
    this.chatUI.addMessage(llmResponse.text, 'assistant');
  }
}
```

---

## 📱 Platform-Specific Notes

### Web (React/Next.js)
- **Best for:** Cross-platform, easy deployment
- **VRM Library:** `@pixiv/three-vrm`
- **Renderer:** Three.js WebGL
- **Performance:** Good on desktop, acceptable on mobile
- **File serving:** Place VRMs in `/public` folder

### Desktop (Electron)
- **Best for:** Native performance, local LLM integration
- **VRM Library:** Same as web, or Unity build
- **Renderer:** Three.js or Unity WebGL export
- **Performance:** Excellent
- **File serving:** Local file system

### Desktop (Unity Standalone)
- **Best for:** Maximum performance, advanced animations
- **VRM Library:** UniVRM
- **Renderer:** Unity Engine
- **Performance:** Best
- **Integration:** More complex LLM bridge needed

---

## 🎨 Customization Tips

### 1. Add Custom Animations

```typescript
// Idle animation (subtle breathing)
function addBreathingAnimation(vrm: VRM) {
  const breathingSpeed = 2.0;
  const breathingAmount = 0.02;

  function animate(time: number) {
    const breathing = Math.sin(time * breathingSpeed) * breathingAmount;
    vrm.humanoid?.getNormalizedBoneNode('chest')?.position.set(0, breathing, 0);
    requestAnimationFrame(animate);
  }

  animate(0);
}
```

### 2. Custom Expressions

```typescript
// Create compound expressions
expressionService.setMultipleExpressions({
  joy: 0.7,
  fun: 0.3,
  blinkLeft: 1.0, // Wink
});
```

### 3. Head Tracking (Follow Mouse)

```typescript
function addHeadTracking(vrm: VRM, camera: THREE.Camera) {
  const mouse = new THREE.Vector2();

  window.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const head = vrm.humanoid?.getNormalizedBoneNode('head');
    if (head) {
      head.rotation.y = mouse.x * 0.3;
      head.rotation.x = mouse.y * 0.2;
    }
  });
}
```

---

## 🚀 Quick Start Checklist

- [ ] Install Three.js and `@pixiv/three-vrm`
- [ ] Create `VRMViewer` component
- [ ] Load `Panicandy-no-outline.vrm` model
- [ ] Verify model renders correctly
- [ ] Implement basic expression system
- [ ] Connect to LLM emotion detection
- [ ] Add TTS + lip sync (optional)
- [ ] Create model selector UI
- [ ] Optimize for target platform
- [ ] Test full integration pipeline

---

## 📚 Resources

- **VRM Specification:** https://vrm.dev/en/
- **@pixiv/three-vrm Docs:** https://pixiv.github.io/three-vrm/
- **Three.js Docs:** https://threejs.org/docs/
- **UniVRM (Unity):** https://github.com/vrm-c/UniVRM
- **VRM Viewer (Test Tool):** https://hub.vroid.com/

---

## 🔮 Future Enhancements

1. **Multiple Outfits:** Load texture variants for same model
2. **Background Scenes:** Add room environments
3. **Gesture System:** Hand movements tied to conversation context
4. **Seasonal Variants:** Holiday/themed model versions
5. **User-Uploaded Models:** Allow users to import their own VRMs
6. **AR Mode:** Mobile AR integration for real-world overlay

---

**Next Steps:**
1. Follow Quick Start Checklist
2. Test with existing VRM models
3. Integrate with chat system from main app
4. Connect to LLM + vocabulary system

For system prompt integration, see `SYSTEM_PROMPTS.md`.
For vocabulary details, see `VOCABULARY_INTEGRATION.md`.
