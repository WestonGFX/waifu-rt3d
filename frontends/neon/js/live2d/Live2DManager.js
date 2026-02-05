
export class Live2DManager {
    constructor() {
        this.app = null;
        this.model = null;
        this.canvas = document.getElementById('live2d-canvas');
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        // Initialize Pixi Application
        this.app = new PIXI.Application({
            view: this.canvas,
            autoStart: true,
            backgroundAlpha: 0, // Transparent
            resizeTo: window
        });

        // Register Interaction
        // pixi-live2d-display uses internal interaction, but we might need to enable it
        // this.app.renderer.plugins.interaction.autoPreventDefault = false;

        this.initialized = true;
        console.log("[Live2D] Engine Initialized");
        
        // MVP: Auto-load sample if available (User needs to put a model here)
        // this.loadModel('assets/live2d/hiyori/hiyori.model3.json');
    }

    async loadModel(modelPath) {
        if (!this.initialized) await this.init();

        // Clear existing model
        if (this.model) {
            this.app.stage.removeChild(this.model);
            this.model.destroy();
            this.model = null;
        }

        try {
            console.log(`[Live2D] Loading: ${modelPath}`);
            const model = await PIXI.live2d.Live2DModel.from(modelPath);
            
            this.model = model;
            this.app.stage.addChild(this.model);

            // Scale and Position
            this.fitModelToScreen();

            // Enable Ticking (Physics/Motion)
            const ticker = PIXI.Ticker.shared;
            ticker.add((deltaTime) => {
                if (this.model) {
                    this.model.update(ticker.elapsedMS);
                }
            });

            console.log("[Live2D] Model Loaded Successfully");
        } catch (e) {
            console.error("[Live2D] Load Failed:", e);
        }
    }

    fitModelToScreen() {
        if (!this.model) return;
        
        // Basic fitting logic
        const scaleX = (window.innerWidth * 0.8) / this.model.width;
        const scaleY = (window.innerHeight * 0.8) / this.model.height;
        const scale = Math.min(scaleX, scaleY);
        
        this.model.scale.set(scale);
        this.model.x = (window.innerWidth - this.model.width) / 2;
        this.model.y = (window.innerHeight - this.model.height) / 2;
    }

    resize() {
        if (this.app) {
            this.app.resize();
            this.fitModelToScreen();
        }
    }
}

export const live2d = new Live2DManager();
