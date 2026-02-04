
export class CharacterManagerUI {
    constructor() {
        this.modal = document.getElementById('charModal');
        this.form = document.getElementById('charForm');
        this.list = document.getElementById('charListManage');
        
        // Bind Trigger
        const openBtn = document.getElementById('openCharModal');
        if(openBtn) openBtn.onclick = () => this.open();
        
        // Bind Close
        const closeBtn = document.getElementById('closeCharModal');
        if(closeBtn) closeBtn.onclick = () => this.close();
        
        // Bind Actions
        document.getElementById('saveChar').onclick = () => this.save();
        document.getElementById('newChar').onclick = () => this.clearForm();
        
        // Add File Listeners if they exist
        this.setupFileHandling();
    }

    setupFileHandling() {
        // We will dynamically inject file inputs if they don't exist in HTML yet, 
        // OR we can expect HTML to be updated. 
        // For now, let's look for triggers.
        const avatarInput = document.getElementById('uploadAvatarBtn');
        if(avatarInput) avatarInput.onchange = (e) => this.uploadFile(e.target.files[0], 'avatar');
    }

    open() {
        this.modal.classList.add('open');
        this.loadList();
    }

    close() {
        this.modal.classList.remove('open');
    }

    async loadList() {
        try {
            const r = await fetch('/api/characters');
            const j = await r.json();
            this.list.innerHTML = '';
            
            j.characters.forEach(char => {
                 const item = document.createElement('div');
                 item.style.cssText = 'padding:10px; margin-bottom:5px; border:1px solid var(--glass-border); display:flex; justify-content:space-between; background:rgba(26,6,40,0.3); align-items:center;';
                 
                 item.innerHTML = `
                    <div>
                        <strong style="color:var(--neon-green); font-size:0.8rem;">${char.name}</strong>
                    </div>
                 `;
                 
                 const actions = document.createElement('div');
                 
                 const editBtn = document.createElement('button');
                 editBtn.textContent = 'EDIT';
                 editBtn.className = 'btn';
                 editBtn.style.fontSize = '0.6rem';
                 editBtn.style.padding = '5px 8px';
                 editBtn.style.marginRight = '5px';
                 editBtn.onclick = () => this.edit(char);
                 
                 const delBtn = document.createElement('button');
                 delBtn.textContent = 'DEL';
                 delBtn.className = 'btn';
                 delBtn.style.fontSize = '0.6rem';
                 delBtn.style.padding = '5px 8px';
                 delBtn.style.borderColor = 'var(--neon-pink)';
                 delBtn.style.color = 'var(--neon-pink)';
                 if (char.id === 1) delBtn.disabled = true;
                 else delBtn.onclick = () => this.delete(char.id);
                 
                 actions.appendChild(editBtn);
                 actions.appendChild(delBtn);
                 item.appendChild(actions);
                 
                 this.list.appendChild(item);
            });
        } catch (e) {
            console.error(e);
        }
    }

    edit(char) {
        document.getElementById('editCharId').value = char.id;
        document.getElementById('charName').value = char.name;
        document.getElementById('charPrompt').value = char.system_prompt;
        document.getElementById('charAvatar').value = char.avatar_url || '';
        document.getElementById('charVoice').value = char.voice_id || '';
        document.getElementById('charTTS').value = char.tts_provider || '';
        document.getElementById('charTraits').value = (char.personality_traits || []).join(', ');
    }

    clearForm() {
        document.getElementById('editCharId').value = '';
        document.getElementById('charName').value = '';
        document.getElementById('charPrompt').value = '';
        document.getElementById('charAvatar').value = '';
        document.getElementById('charVoice').value = '';
        document.getElementById('charTTS').value = '';
        document.getElementById('charTraits').value = '';
    }

    async save() {
        const id = document.getElementById('editCharId').value;
        const data = {
            name: document.getElementById('charName').value,
            system_prompt: document.getElementById('charPrompt').value,
            avatar_url: document.getElementById('charAvatar').value,
            voice_id: document.getElementById('charVoice').value,
            tts_provider: document.getElementById('charTTS').value,
            personality_traits: document.getElementById('charTraits').value.split(',').filter(Boolean)
        };
        
        if(!data.name) { alert("Name required"); return; }

        const url = id ? `/api/characters/${id}` : '/api/characters';
        const method = id ? 'PUT' : 'POST';
        
        try {
            const r = await fetch(url, {
                method, 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            const j = await r.json();
            if(j.ok || j.id) {
                this.loadList();
                this.clearForm();
                alert("Saved!");
                // Refresh list if external function exists
                if(window.loadCharacters) window.loadCharacters();
            }
        } catch(e) {
            alert("Error: " + e.message);
        }
    }

    async delete(id) {
        if(!confirm("Are you sure?")) return;
        await fetch(`/api/characters/${id}`, { method: 'DELETE' });
        this.loadList();
        if(window.loadCharacters) window.loadCharacters();
    }

    async uploadFile(file, type) {
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            // Determine endpoint
            const endpoint = type === 'avatar' ? '/api/upload/avatar' : '/api/upload/image';
            const r = await fetch(endpoint, {
                method: 'POST',
                body: formData
            });
            const j = await r.json();
            if (j.ok) {
                if (type === 'avatar') {
                    document.getElementById('charAvatar').value = j.url;
                }
                alert("Upload Complete");
            } else {
                alert("Upload Failed: " + j.error);
            }
        } catch (e) {
            alert("Upload Error: " + e.message);
        }
    }
}
