# Neuro-sama Feature Implementation Plan
**Goal:** Transform waifu-rt3d into a Neuro-sama-quality AI VTuber

## Research Sources
- [Neuro-sama Wikipedia](https://en.wikipedia.org/wiki/Neuro-sama)
- [Neuro-sama Technical Details](https://virtualyoutuber.fandom.com/wiki/Neuro-sama)
- [VTuber Animation Techniques](https://3daily.ai/blog/the-secret-to-smooth-vtuber-animation-blendshapes-timing-real-time-syncing/)
- [Live2D Lip Sync Implementation](https://medium.com/@mizutori/live2d-on-the-web-part-2-integrating-lip-sync-for-custom-audio-files-in-vue-js-4e521e57e49c)
- [Open-LLM-VTuber GitHub](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber)
- [VU-VRM Lip Sync](https://github.com/Automattic/VU-VRM)

## Current State vs. Neuro-sama

| Feature | Neuro-sama | waifu-rt3d v5.31 | Gap |
|---------|-----------|------------------|-----|
| LLM Integration | 2B params, q2_k | LM Studio (flexible) | ✅ Equal |
| TTS | Low-latency custom | Fish Audio/ElevenLabs/Piper/XTTS | ✅ Equal |
| 3D Avatar | Unity 3D (Nov 2025) | Three.js VRM | ✅ Equal |
| Lip Sync | Audio-driven realtime | **None** | ❌ **Critical Gap** |
| Facial Expressions | Emotion-driven Live2D | **Static T-pose** | ❌ **Critical Gap** |
| Idle Animations | Breathing, blinking, movement | Basic breathing only | ⚠️ Partial |
| Gesture System | Nods, waves, reactions | Head nod on send | ⚠️ Partial |
| Eye Tracking | Dynamic gaze | **None** | ❌ Missing |
| Response Latency | Low (streaming) | Waits for full response | ⚠️ Higher |

---

## Phase 1: Real-Time Lip Sync (v5.32) - **Priority 1**
**Timeline:** 1-2 weeks
**Complexity:** Medium

### Technical Approach: Audio-Driven Blendshapes

Neuro-sama uses **VTube Studio** with audio volume → mouth open parameter mapping.
We'll implement the same with Three.js + VRM blendshapes.

### Implementation Steps

#### 1.1: Add Audio Analysis to Viewer
**File:** `frontend/viewer/viewer.html`

```javascript
class AudioLipSync {
    constructor(vrm) {
        this.vrm = vrm;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.isPlaying = false;
    }

    async playAudioWithLipSync(audioUrl) {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);

        this.isPlaying = true;
        source.start(0);

        source.onended = () => {
            this.isPlaying = false;
            this.setMouthOpen(0); // Close mouth when done
        };

        this.updateLipSync();
    }

    updateLipSync() {
        if (!this.isPlaying) return;

        this.analyser.getByteFrequencyData(this.dataArray);

        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        const average = sum / this.dataArray.length;

        // Normalize to 0.0 - 1.0
        const normalized = Math.min(average / 128, 1.0);

        // Apply to VRM blendshape
        this.setMouthOpen(normalized);

        requestAnimationFrame(() => this.updateLipSync());
    }

    setMouthOpen(value) {
        // VRM 1.0
        if (this.vrm.expressionManager) {
            this.vrm.expressionManager.setValue('aa', value);
        }
        // VRM 0.x
        else if (this.vrm.blendShapeProxy) {
            this.vrm.blendShapeProxy.setValue('aa', value);
        }
    }
}

// Usage
let lipSync = new AudioLipSync(currentVRM);
lipSync.playAudioWithLipSync('/files/audio/response.mp3');
```

#### 1.2: Add Phoneme-Based Mouth Shapes (Advanced)
**Enhancement:** Map audio frequency bands to specific mouth shapes

```javascript
class PhonemeBasedLipSync extends AudioLipSync {
    updateLipSync() {
        if (!this.isPlaying) return;

        this.analyser.getByteFrequencyData(this.dataArray);

        // Analyze frequency bands for phoneme detection
        const lowFreq = this.getAverageBand(0, 10);   // 'u', 'o'
        const midFreq = this.getAverageBand(10, 30);  // 'e', 'i'
        const highFreq = this.getAverageBand(30, 60); // 'a'

        // Set blendshapes based on frequency analysis
        if (this.vrm.expressionManager) {
            this.vrm.expressionManager.setValue('aa', highFreq);
            this.vrm.expressionManager.setValue('ih', midFreq);
            this.vrm.expressionManager.setValue('ou', lowFreq);
        }

        requestAnimationFrame(() => this.updateLipSync());
    }

    getAverageBand(start, end) {
        let sum = 0;
        for (let i = start; i < end && i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        return Math.min((sum / (end - start)) / 128, 1.0);
    }
}
```

#### 1.3: Integration with Main App
**File:** `frontend/index.html`

```javascript
// After TTS audio is generated
if (tts_url) {
    const iframe = document.getElementById('vrm-iframe');
    iframe.contentWindow.postMessage({
        type: 'speak_with_lipsync',
        audioUrl: tts_url
    }, '*');
}
```

**File:** `frontend/viewer/viewer.html`

```javascript
window.addEventListener('message', (event) => {
    if (event.data.type === 'speak_with_lipsync') {
        lipSync.playAudioWithLipSync(event.data.audioUrl);
    }
});
```

### Success Criteria
- ✅ Mouth opens/closes in sync with audio volume
- ✅ Smooth transitions (no jitter)
- ✅ Proper mouth closure when audio stops
- ✅ Works with all TTS providers

---

## Phase 2: Expressive Idle Animations (v5.32) - **Priority 2**
**Timeline:** 1 week
**Complexity:** Low-Medium

### Animations to Implement

#### 2.1: Breathing Animation (Enhanced)
**Current:** Basic sinusoidal chest rotation
**Target:** Natural breathing with multiple body parts

```javascript
class NaturalBreathing {
    constructor(vrm) {
        this.vrm = vrm;
        this.breathPhase = 0;
        this.breathRate = 0.8; // breaths per second
    }

    update(deltaTime) {
        this.breathPhase += deltaTime * this.breathRate * Math.PI * 2;

        const breathStrength = Math.sin(this.breathPhase) * 0.003;

        // Chest
        const chest = this.vrm.humanoid.getNormalizedBoneNode('chest');
        if (chest) {
            chest.rotation.x = breathStrength;
            chest.rotation.z = breathStrength * 0.5;
        }

        // Shoulders
        const leftShoulder = this.vrm.humanoid.getNormalizedBoneNode('leftShoulder');
        const rightShoulder = this.vrm.humanoid.getNormalizedBoneNode('rightShoulder');
        if (leftShoulder) leftShoulder.rotation.z = breathStrength * 0.3;
        if (rightShoulder) rightShoulder.rotation.z = -breathStrength * 0.3;
    }
}
```

#### 2.2: Blinking Animation
**Randomized realistic blinking**

```javascript
class BlinkController {
    constructor(vrm) {
        this.vrm = vrm;
        this.nextBlinkTime = this.getNextBlinkDelay();
        this.isBlinking = false;
        this.blinkProgress = 0;
    }

    update(deltaTime) {
        if (this.isBlinking) {
            this.blinkProgress += deltaTime * 10; // Blink speed

            if (this.blinkProgress < 0.5) {
                // Closing
                const value = this.blinkProgress * 2;
                this.setBlinkValue(value);
            } else {
                // Opening
                const value = 1.0 - ((this.blinkProgress - 0.5) * 2);
                this.setBlinkValue(value);
            }

            if (this.blinkProgress >= 1.0) {
                this.isBlinking = false;
                this.blinkProgress = 0;
                this.setBlinkValue(0);
                this.nextBlinkTime = this.getNextBlinkDelay();
            }
        } else {
            this.nextBlinkTime -= deltaTime;
            if (this.nextBlinkTime <= 0) {
                this.isBlinking = true;
            }
        }
    }

    setBlinkValue(value) {
        if (this.vrm.expressionManager) {
            this.vrm.expressionManager.setValue('blink', value);
        } else if (this.vrm.blendShapeProxy) {
            this.vrm.blendShapeProxy.setValue('blink', value);
        }
    }

    getNextBlinkDelay() {
        // Random blink every 2-6 seconds
        return 2 + Math.random() * 4;
    }
}
```

#### 2.3: Head Movement System
**Subtle idle movements**

```javascript
class IdleHeadMovement {
    constructor(vrm) {
        this.vrm = vrm;
        this.headTarget = { x: 0, y: 0, z: 0 };
        this.headCurrent = { x: 0, y: 0, z: 0 };
        this.nextMoveTime = 5;
    }

    update(deltaTime) {
        this.nextMoveTime -= deltaTime;

        if (this.nextMoveTime <= 0) {
            // Choose new random target
            this.headTarget = {
                x: (Math.random() - 0.5) * 0.2, // ±0.1 radians
                y: (Math.random() - 0.5) * 0.3,
                z: (Math.random() - 0.5) * 0.1
            };
            this.nextMoveTime = 3 + Math.random() * 7; // 3-10 seconds
        }

        // Smooth interpolation to target
        const lerpSpeed = deltaTime * 0.5;
        this.headCurrent.x += (this.headTarget.x - this.headCurrent.x) * lerpSpeed;
        this.headCurrent.y += (this.headTarget.y - this.headCurrent.y) * lerpSpeed;
        this.headCurrent.z += (this.headTarget.z - this.headCurrent.z) * lerpSpeed;

        // Apply to head bone
        const head = this.vrm.humanoid.getNormalizedBoneNode('head');
        if (head) {
            head.rotation.x = this.headCurrent.x;
            head.rotation.y = this.headCurrent.y;
            head.rotation.z = this.headCurrent.z;
        }
    }
}
```

#### 2.4: Eye Gaze Tracking
**Follow mouse cursor or random targets**

```javascript
class EyeGazeController {
    constructor(vrm, camera) {
        this.vrm = vrm;
        this.camera = camera;
        this.gazeTarget = new THREE.Vector3(0, 1.4, 0); // Default: straight ahead
        this.mousePos = { x: 0, y: 0 };

        window.addEventListener('mousemove', (e) => {
            this.mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });
    }

    update() {
        // Convert mouse position to 3D target
        const vector = new THREE.Vector3(
            this.mousePos.x,
            this.mousePos.y,
            0.5
        );
        vector.unproject(this.camera);

        // Look at target
        const head = this.vrm.humanoid.getNormalizedBoneNode('head');
        if (head) {
            head.lookAt(vector);
        }

        // Update eye bones
        const leftEye = this.vrm.humanoid.getNormalizedBoneNode('leftEye');
        const rightEye = this.vrm.humanoid.getNormalizedBoneNode('rightEye');
        if (leftEye) leftEye.lookAt(vector);
        if (rightEye) rightEye.lookAt(vector);
    }
}
```

### Success Criteria
- ✅ Natural breathing animation
- ✅ Realistic blinking (2-6 second intervals)
- ✅ Subtle head movements
- ✅ Eye gaze follows mouse
- ✅ All animations run smoothly at 60 FPS

---

## Phase 3: Emotion-Based Expressions (v5.33) - **Priority 3**
**Timeline:** 1-2 weeks
**Complexity:** Medium-High

### LLM Sentiment → Expression Mapping

#### 3.1: Backend Sentiment Analysis
**File:** `backend/llm/adapters/base.py`

Add sentiment detection to LLM responses:

```python
import re
from typing import Dict, Optional

class LLMAdapter:
    def detect_sentiment(self, text: str) -> Dict[str, float]:
        """
        Detect sentiment/emotion from LLM response text.
        
        Returns:
            dict: {"emotion": str, "intensity": float, "gesture": Optional[str]}
        """
        text_lower = text.lower()
        
        # Emotion keywords
        emotions = {
            "happy": ["happy", "joy", "excited", "love", "wonderful", "great", "haha", "lol"],
            "sad": ["sad", "sorry", "unfortunate", "cry", "miss"],
            "surprised": ["wow", "oh!", "amazing", "incredible", "can't believe"],
            "confused": ["confused", "hmm", "what?", "don't understand"],
            "thinking": ["let me think", "well", "perhaps", "maybe", "consider"],
            "neutral": []
        }
        
        scores = {}
        for emotion, keywords in emotions.items():
            scores[emotion] = sum(1 for kw in keywords if kw in text_lower)
        
        # Determine dominant emotion
        max_emotion = max(scores, key=scores.get)
        intensity = min(scores[max_emotion] / 3, 1.0)  # Normalize to 0-1
        
        # Gesture detection
        gesture = None
        if "!" in text and scores["happy"] > 0:
            gesture = "nod"
        elif "?" in text:
            gesture = "tilt"
        
        return {
            "emotion": max_emotion if intensity > 0.2 else "neutral",
            "intensity": intensity,
            "gesture": gesture
        }
```

#### 3.2: Expression System in Frontend
**File:** `frontend/viewer/viewer.html`

```javascript
class ExpressionController {
    constructor(vrm) {
        this.vrm = vrm;
        this.currentExpression = "neutral";
        this.targetExpression = "neutral";
        this.transitionProgress = 1.0;
    }

    setExpression(emotion, intensity = 1.0, duration = 0.5) {
        this.targetExpression = emotion;
        this.targetIntensity = intensity;
        this.transitionDuration = duration;
        this.transitionProgress = 0;
    }

    update(deltaTime) {
        if (this.transitionProgress < 1.0) {
            this.transitionProgress += deltaTime / this.transitionDuration;
            const t = Math.min(this.transitionProgress, 1.0);

            // Blend between current and target expression
            this.applyExpression(this.targetExpression, t * this.targetIntensity);
        }
    }

    applyExpression(emotion, intensity) {
        const em = this.vrm.expressionManager || this.vrm.blendShapeProxy;
        if (!em) return;

        // Reset all expressions
        const expressions = ['happy', 'sad', 'surprised', 'angry', 'neutral'];
        expressions.forEach(expr => em.setValue(expr, 0));

        // Apply target expression
        if (emotion === "happy") {
            em.setValue('happy', intensity);
        } else if (emotion === "sad") {
            em.setValue('sad', intensity);
        } else if (emotion === "surprised") {
            em.setValue('surprised', intensity);
        } else if (emotion === "confused") {
            em.setValue('surprised', intensity * 0.5);
            // Tilt head
            const head = this.vrm.humanoid.getNormalizedBoneNode('head');
            if (head) head.rotation.z = 0.2 * intensity;
        } else if (emotion === "thinking") {
            // Hand to chin gesture
            const leftHand = this.vrm.humanoid.getNormalizedBoneNode('leftHand');
            if (leftHand) {
                leftHand.position.y = 1.2 * intensity;
            }
        }
    }
}

// Integration
window.addEventListener('message', (event) => {
    if (event.data.type === 'set_expression') {
        expressionController.setExpression(
            event.data.emotion,
            event.data.intensity
        );
    }
    if (event.data.type === 'trigger_gesture') {
        gestureController.trigger(event.data.gesture);
    }
});
```

#### 3.3: API Integration
**File:** `backend/server.py`

Extend `/api/chat` endpoint:

```python
@app.post("/api/chat")
async def chat(...):
    # ... existing code ...
    
    reply = res["reply"]
    
    # Detect sentiment
    sentiment = adapter.detect_sentiment(reply)
    
    # ... save to database ...
    
    return {
        "ok": True,
        "reply": reply,
        "audio": tts_url,
        "session_id": session_id,
        "emotion": sentiment["emotion"],
        "emotion_intensity": sentiment["intensity"],
        "gesture": sentiment["gesture"]
    }
```

**File:** `frontend/index.html`

```javascript
async function send() {
    // ... existing code ...
    
    const data = await r.json();
    
    // Set expression based on sentiment
    const iframe = $('#vrm-iframe');
    iframe.contentWindow.postMessage({
        type: 'set_expression',
        emotion: data.emotion,
        intensity: data.emotion_intensity
    }, '*');
    
    // Trigger gesture if present
    if (data.gesture) {
        iframe.contentWindow.postMessage({
            type: 'trigger_gesture',
            gesture: data.gesture
        }, '*');
    }
    
    // ... rest of code ...
}
```

### Success Criteria
- ✅ LLM responses trigger appropriate expressions
- ✅ Smooth expression transitions
- ✅ Gestures execute correctly (nod, tilt, wave)
- ✅ Emotions blend naturally

---

## Phase 4: Performance Optimization (v5.34) - **Priority 4**
**Timeline:** 1 week
**Complexity:** Medium

### Optimizations Needed

#### 4.1: Streaming TTS Responses
**Current:** Wait for full LLM response before TTS
**Target:** Start TTS as soon as first sentence is ready

```python
# backend/server.py
@app.post("/api/chat/stream")
async def chat_stream(...):
    """Stream LLM + TTS responses."""
    from fastapi.responses import StreamingResponse
    import asyncio
    
    async def generate():
        # Stream LLM tokens
        for token in adapter.chat_stream(messages):
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
            
            # When sentence complete, trigger TTS
            if token in ['.', '!', '?']:
                sentence = current_sentence
                tts_result = tts_client.speak(sentence, tts_opts)
                yield f"data: {json.dumps({'type': 'audio', 'url': tts_result['url']})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")
```

#### 4.2: Animation Frame Rate Optimization
**Target:** Maintain 60 FPS with all animations active

```javascript
// Use requestAnimationFrame efficiently
class AnimationManager {
    constructor() {
        this.lastTime = 0;
        this.controllers = [];
    }

    register(controller) {
        this.controllers.push(controller);
    }

    update(currentTime) {
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Update all controllers
        this.controllers.forEach(c => c.update(deltaTime));

        requestAnimationFrame((t) => this.update(t));
    }

    start() {
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.update(t));
    }
}

// Usage
const animManager = new AnimationManager();
animManager.register(breathingController);
animManager.register(blinkController);
animManager.register(headMovementController);
animManager.register(eyeGazeController);
animManager.register(expressionController);
animManager.start();
```

#### 4.3: Audio Caching
**Cache frequently used audio clips**

```javascript
class AudioCache {
    constructor(maxSize = 50) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    async get(url) {
        if (this.cache.has(url)) {
            return this.cache.get(url);
        }

        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(url, arrayBuffer);
        return arrayBuffer;
    }
}
```

---

## Phase 5: Advanced Features (v5.35+) - **Future**

### Game Playing AI (Like Neuro's osu!/Minecraft)
- Screen capture integration
- Python game agent
- Action execution system

### Voice Interaction Interruption
- Allow user to interrupt AI mid-sentence
- Stop TTS and reset conversation context

### Memory & Learning
- Long-term conversation memory
- User preferences learning
- Personality adaptation

### Multi-Character System
- Quick character switching
- Character-specific animations
- Shared conversation history

---

## Hardware Requirements

### Minimum (For Testing)
- CPU: 4-core processor
- GPU: Integrated graphics (for basic rendering)
- RAM: 8GB
- Storage: 10GB (for models + audio cache)

### Recommended (For Production)
- CPU: 8-core processor (for LLM inference)
- GPU: NVIDIA RTX 3060+ or AMD equivalent (for Three.js rendering + potential GPU-accelerated TTS)
- RAM: 16GB+
- Storage: 50GB SSD (for model cache + audio files)

### Optimal (For Streaming Like Neuro)
- CPU: AMD Ryzen 9 / Intel i9
- GPU: NVIDIA RTX 4080+ (for smooth 60 FPS 3D rendering + simultaneous recording)
- RAM: 32GB+
- Storage: 500GB NVMe SSD
- Audio: Virtual audio cable setup (VoiceMeeter, VB-Cable)

---

## Development Priority Order

1. **v5.31**: Complete Foundation Fixes (current plan)
2. **v5.32**: Real-Time Lip Sync + Enhanced Idle Animations
3. **v5.33**: Emotion-Based Expressions + Gesture System
4. **v5.34**: Performance Optimization + Streaming
5. **v5.35**: Advanced Features

---

## Success Metrics: Matching Neuro-sama

| Metric | Neuro-sama | waifu-rt3d Target |
|--------|-----------|-------------------|
| Response Latency | <2s (streaming) | <3s initial, <2s with streaming |
| Lip Sync Accuracy | High (audio-driven) | High (same technique) |
| Animation FPS | 60 FPS | 60 FPS |
| Expression Diversity | 10+ expressions | 8+ expressions (Phase 3) |
| Idle Animation Quality | Professional | Professional (Phase 2) |
| User Engagement | Very High | High → Very High |

---

## Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| v5.31 Foundation Fixes | 4-5 days | 1 week |
| v5.32 Lip Sync + Animations | 2 weeks | 3 weeks |
| v5.33 Emotions + Gestures | 2 weeks | 5 weeks |
| v5.34 Optimization | 1 week | 6 weeks |
| v5.35 Advanced Features | 4+ weeks | 10+ weeks |

**Total to Neuro-sama parity:** ~10-12 weeks of focused development

---

## Next Immediate Steps

1. ✅ Complete v5.31 Foundation Fixes (in progress)
2. Add lip sync system to v5.32 roadmap
3. Create prototype audio-driven blendshape controller
4. Test with Fish Audio TTS
5. Iterate on animation quality
