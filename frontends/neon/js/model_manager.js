
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

        // --- SEARCH BAR HEADER ---
        this.listContainer.innerHTML = `
            <div style="display:flex; gap:10px; margin-bottom:15px; background:var(--surface-main); padding:10px; border:2px solid var(--border-color);">
                <input type="text" id="mm_search" placeholder="Enter Repo ID (e.g. TheBloke/Mistral-7B-v0.1-GGUF)" 
                    style="flex:1; background:black; border:1px solid #555; colorm:white; padding:8px; font-family:var(--font-pixel);"
                    value="TheBloke/Mistral-7B-Instruct-v0.2-GGUF">
                <button id="mm_search_btn" class="btn btn-primary" style="font-size:0.8rem;">SCAN REPO</button>
            </div>
            <div id="mm_results"></div>
        `;

        document.getElementById('mm_search_btn').onclick = () => {
            const query = document.getElementById('mm_search').value.trim();
            if (query) this.scanRepo(query, type);
        };

        // Load initial recommendations into results
        this.scanRepo('TheBloke/Mistral-7B-Instruct-v0.2-GGUF', type); // Default
    }

    async scanRepo(repoId, type) {
        const container = document.getElementById('mm_results');
        container.innerHTML = '<div class="spinner" style="color:var(--p)">SCANNING FILES & ESTIMATING VRAM...</div>';

        try {
            const r = await fetch(`/api/models/details?id=${repoId}`);
            const data = await r.json();
            
            if (data.error) throw new Error(data.error);
            
            this.renderDetails(data, type);
        } catch (e) {
            container.innerHTML = `<div style="color:red; font-family:var(--font-pixel); padding:20px; border:2px solid red;">ERROR: ${e.message}</div>`;
        }
    }

    renderDetails(data, type) {
        const container = document.getElementById('mm_results');
        const availableVram = data.hardware_check.vram_total_gb || 0;

        let html = `
            <div style="margin-bottom:10px; font-family:var(--font-pixel); color:var(--text-muted);">
                REPO: <strong style="color:var(--p)">${data.id}</strong> | 
                PARAMS: ${data.params}B | 
                SYSTEM VRAM: ${availableVram.toFixed(1)} GB
            </div>
            <table style="width:100%; border-collapse:collapse; font-family:var(--font-pixel); font-size:0.8rem;">
                <tr style="background:var(--surface-light); color:var(--p); text-align:left;">
                    <th style="padding:10px;">FILENAME</th>
                    <th style="padding:10px;">QUANT</th>
                    <th style="padding:10px;">EST. VRAM</th>
                    <th style="padding:10px;">STATUS</th>
                    <th style="padding:10px;">ACTION</th>
                </tr>
        `;

        data.files.forEach(f => {
            const vramOk = f.estimated_vram_gb < availableVram;
            const rowColor = vramOk ? 'var(--text-main)' : '#ff5555';

        // Extract pure quantization string for the API
        // Heuristic: If filename contains "Q4_K_M", use that.
        // Simple extraction for now: Just pass the quantization tag (e.g. Q4) is NOT enough for specific file.
        // Wait, previous backend logic uses hf_hub_download filename=target_file.
        // We need to pass the "Quantization String" that helps backend FIND this file.
        // Actually, if we pass the FILENAME as quantization arg, backend can use it directly?
        // Backend logic: `candidates = [f for f in files if quantization.lower() in f.lower() ...]`
        // So if we pass unique part of filename, it works.

            html += `
                <tr style="border-bottom:1px solid #333; color:${rowColor};">
                    <td style="padding:8px;">${f.filename}</td>
                    <td style="padding:8px;">${f.quantization}</td>
                    <td style="padding:8px;">${f.estimated_vram_gb} GB</td>
                    <td style="padding:8px;">
                        ${vramOk ? '<span style="color:var(--s)">OK</span>' : '⚠️ LOW VRAM'}
                    </td>
                    <td style="padding:8px;">
                        <button class="btn ${vramOk ? 'btn-primary' : ''}" 
                            style="font-size:0.7rem; padding:5px 10px; opacity:${vramOk ? 1 : 0.5}"
                            onclick="window.mmUI.installRaw('${data.id}', '${type}', '${f.quantization}')">
                            INSTALL
                        </button>
                    </td>
                </tr>
            `;
        });

        html += '</table>';
        container.innerHTML = html;
    }

    async installRaw(id, type, quant) {
        if (!confirm(`Install ${id} (${quant})?`)) return;
        this.install(id, type, quant);
    }

    async install(id, type, quantization) {
        const saneId = id.replace(/[^a-zA-Z0-9]/g, '');
        const btnContainer = document.getElementById(`action-${saneId}`);
        if (btnContainer) btnContainer.innerHTML = '<span class="blink" style="color:var(--p)">DOWNLOADING...</span>';

        try {
            const r = await fetch('/api/models/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, type, quantization })
            });
            const j = await r.json();
            if (j.ok) {
                // Reload list
                this.load(type);
                // Also show global toast
                const toast = document.createElement('div');
                toast.textContent = `INSTALLED ${quantization || 'MODEL'}`;
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
