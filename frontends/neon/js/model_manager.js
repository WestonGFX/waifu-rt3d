
export class ModelManagerUI {
    constructor() {
        this.modal = document.getElementById('model-manager-modal');
        this.listContainer = document.getElementById('mm_list');
        this.typeSelector = document.getElementById('mm_type_select');

        if (this.typeSelector) {
            this.typeSelector.onchange = (e) => this.load(e.target.value);
        }
    }

    open() {
        if (this.modal) this.modal.classList.add('open');
        this.load('asr'); // Default to ASR for this wizard
    }

    close() {
        if (this.modal) this.modal.classList.remove('open');
    }

    async load(type) {
        if (!this.listContainer) return;
        this.listContainer.innerHTML = '<div class="spinner">SCANNING_HARDWARE...</div>';

        try {
            // Parallel fetch
            const [recRes, instRes] = await Promise.all([
                fetch(`/api/models/recommend?type=${type}`),
                fetch('/api/models/installed')
            ]);
            
            const recData = await recRes.json();
            const instData = await instRes.json();
            
            this.render(type, recData.models, instData.installed[type] || []);
        } catch (e) {
            console.error("Model load failed", e);
            this.listContainer.innerHTML = `<div style="color:red">ERROR: ${e.message}</div>`;
        }
    }

    render(type, recommended, installed) {
        this.listContainer.innerHTML = '';
        const installedIds = new Set(installed.map(i => i.id));

        // Header
        const h = document.createElement('div');
        h.innerHTML = `<h3 style="color:var(--neon-blue)">RECOMMENDED_FOR_YOUR_HARDWARE</h3>`;
        this.listContainer.appendChild(h);

        if (recommended.length === 0) {
            this.listContainer.innerHTML += '<div>No recommendations found.</div>';
        }

        recommended.forEach(model => {
            const isInstalled = installedIds.has(model.id);
            const card = document.createElement('div');
            card.className = 'model-card';
            card.style.cssText = `
                border: 1px solid ${isInstalled ? 'var(--neon-green)' : 'var(--glass-border)'};
                background: rgba(0,0,0,0.3);
                padding: 10px;
                margin-bottom: 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;

            card.innerHTML = `
                <div>
                    <div style="color:var(--text-main); font-weight:bold;">${model.id}</div>
                    <div style="font-size:0.8rem; color:${model.compatible ? 'var(--neon-green)' : 'red'}">
                        RAM: ${model.min_ram}GB | ${model.tags.join(', ')}
                    </div>
                </div>
                <div id="action-${model.id.replace(/[^a-zA-Z0-9]/g, '')}">
                    ${isInstalled
                    ? `<button class="btn" style="border-color:red; color:red; font-size:0.7rem;" onclick="window.mmUI.uninstall('${model.id}', '${type}')">UNINSTALL</button>`
                    : `<button class="btn btn-primary" style="font-size:0.7rem;" onclick="window.mmUI.install('${model.id}', '${type}')">INSTALL</button>`
                }
                </div>
            `;
            this.listContainer.appendChild(card);
        });

        // Installed but not recommended section?
        // For simplicity, just listing recommendations + status.
        // Or we can list "Other Installed" below.
    }

    async install(id, type) {
        const btnContainer = document.getElementById(`action-${id.replace(/[^a-zA-Z0-9]/g, '')}`);
        if (btnContainer) btnContainer.innerHTML = '<span class="blink">DOWNLOADING...</span>';

        try {
            const r = await fetch('/api/models/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, type })
            });
            const j = await r.json();
            if (j.ok) {
                // Reload list
                this.load(type);
                // Also show global toast
                const toast = document.createElement('div');
                toast.textContent = "INSTALL COMPLETE";
                toast.className = "toast toast-success";
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 3000);
            } else {
                throw new Error(j.error);
            }
        } catch (e) {
            if (btnContainer) btnContainer.innerHTML = `<span style="color:red">FAILED</span>`;
            alert("Install Failed: " + e.message);
        }
    }

    async uninstall(id, type) {
        if (!confirm(`Delete ${id}?`)) return;
        try {
            const r = await fetch(`/api/models/${type}/${id}`, { method: 'DELETE' }); // Issue: Slashes in ID
            // Actually server handles path param, but we need to encode? 
            // The server route is /api/models/{mtype}/{model_id:path}
            // So default fetch should work if ID is appended correctly.
            // But if ID starts with slash, might be issue. Typically HF IDs are author/repo.
            const j = await r.json();
            if (j.ok) this.load(type);
        } catch (e) {
            console.error(e);
            alert("Delete failed");
        }
    }
}
