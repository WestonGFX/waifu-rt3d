/**
 * model_manager.js
 * Handles model searching, installation wizard, and installed model management.
 */

export class ModelManagerUI {
    constructor() {
        this.modal = document.getElementById('wizard-modal'); // We'll add this to index.html
        this.container = document.getElementById('wizard-content');
        this.installing = new Set();
    }

    toggleModal(force) {
        if (!this.modal) return;
        const isHidden = this.modal.style.display === 'none';
        if (force !== undefined) {
             this.modal.style.display = force ? 'flex' : 'none';
        } else {
             this.modal.style.display = isHidden ? 'flex' : 'none';
        }
        
        if (this.modal.style.display === 'flex') {
            this.startWizard();
        }
    }

    async startWizard() {
        this.renderStep1_HardwareScan();
    }

    async renderStep1_HardwareScan() {
        this.container.innerHTML = `
            <div style="text-align:center; padding: 20px;">
                <div class="spinner">SCANNING SYSTEM HARDWARE...</div>
            </div>
        `;
        
        // Fetch recommendations to get hardware stats + models
        try {
            const r = await fetch('/api/system/stats');
            const stats = await r.json();
            const hw = stats.hardware || {};
            
            this.container.innerHTML = `
                <h3 style="color:var(--neon-blue); border-bottom:1px solid var(--neon-purple); padding-bottom:10px;">SYSTEM DIAGNOSTICS</h3>
                <div style="font-size:0.7rem; margin: 15px 0;">
                    <div style="display:flex; justify-content:space-between;"><span>PLATFORM:</span> <span style="color:var(--neon-green)">${hw.platform}</span></div>
                    <div style="display:flex; justify-content:space-between;"><span>RAM:</span> <span style="color:var(--neon-green)">${hw.ram_total_gb} GB</span></div>
                    <div style="display:flex; justify-content:space-between;"><span>GPU:</span> <span style="color:var(--neon-green)">${hw.gpu_name}</span></div>
                    <div style="display:flex; justify-content:space-between;"><span>VRAM:</span> <span style="color:var(--neon-green)">${hw.vram_total_gb} GB</span></div>
                    <div style="display:flex; justify-content:space-between;"><span>ACCELERATOR:</span> <span style="color:var(--neon-green)">${hw.accelerator}</span></div>
                </div>
                <div style="margin-top:20px; text-align:right;">
                    <button id="wiz-next-1" style="background:var(--neon-blue); color:white; border:none; padding:10px 20px; font-family:var(--font-pixel); cursor:pointer;">
                        CHOOSE MODEL >>
                    </button>
                </div>
            `;
            
            document.getElementById('wiz-next-1').onclick = () => this.renderStep2_Recommendations(hw);

        } catch (e) {
            this.container.innerHTML = `<div style="color:red">ERROR: ${e.message}</div>`;
        }
    }

    async renderStep2_Recommendations(hw) {
        this.container.innerHTML = `
             <div class="spinner">FETCHING RECOMMENDATIONS...</div>
        `;

        try {
            const r = await fetch('/api/models/recommend?type=llm');
            const data = await r.json();
            const models = data.models || [];

            let html = `
                <h3 style="color:var(--neon-yellow); margin-bottom:15px;">RECOMMENDED MODELS</h3>
                <div style="overflow-y:auto; max-height:300px; padding-right:5px;">
            `;

            if (models.length === 0) {
                html += `<div style="padding:10px; opacity:0.7;">No specific recommendations found.</div>`;
            } else {
                models.forEach(m => {
                    const statusColor = m.compatible ? 'var(--neon-green)' : 'var(--neon-pink)';
                    html += `
                        <div style="border:1px solid ${statusColor}; background:rgba(0,0,0,0.3); padding:10px; margin-bottom:10px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="font-weight:bold; color:var(--neon-blue); font-size:0.7rem;">${m.id}</span>
                                <span style="font-size:0.5rem; background:${statusColor}; color:black; padding:2px 5px;">${m.compatible ? 'OPTIMAL' : 'WARNING'}</span>
                            </div>
                            <div style="font-size:0.6rem; margin:5px 0;">
                                MIN RAM: ${m.min_ram}GB | TAGS: ${m.tags.join(', ')}
                            </div>
                            ${!m.compatible ? `<div style="color:var(--neon-pink); font-size:0.5rem;">⚠️ ${m.compatibility_issue || 'Resource mismatch'}</div>` : ''}
                            <button class="install-btn" data-id="${m.id}" style="width:100%; margin-top:5px; background:rgba(255,255,255,0.1); border:1px solid ${statusColor}; color:${statusColor}; cursor:pointer;">
                                INSTALL
                            </button>
                        </div>
                    `;
                });
            }
            html += `</div>`;
            this.container.innerHTML = html;

            this.container.querySelectorAll('.install-btn').forEach(btn => {
                btn.onclick = (e) => this.installModel(e.target.dataset.id, 'llm');
            });

        } catch (e) {
             this.container.innerHTML = `<div style="color:red">ERROR: ${e.message}</div>`;
        }
    }

    async installModel(id, type) {
        if (this.installing.has(id)) return;
        this.installing.add(id);
        
        // Show status
        const btn = this.container.querySelector(`button[data-id="${id}"]`);
        if (btn) btn.textContent = "INSTALLING... (Check Logs)";

        try {
            await fetch('/api/models/install', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ id, type })
            });
            // Background install started
            alert("Installation started in background. Check terminal logs for progress.");
        } catch (e) {
            alert("Install failed: " + e.message);
        }
    }
}
