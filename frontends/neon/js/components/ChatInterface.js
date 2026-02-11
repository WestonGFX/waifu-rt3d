import { state } from '../core/StateManager.js';

export class ChatInterface {
    constructor() {
        this.container = document.getElementById('chat-messages');
        // Replace input with textarea if not already done, or handle both
        this.inputWrapper = document.querySelector('.chat-layer');
        this.setupInput();
        this.sendBtn = document.querySelector('.chat-layer button:last-child');
        this.toggleBtn = document.getElementById('btn-toggle-right'); // Ref to toggle for layout check

        this.bindEvents();
        this.isThinking = false;
    }

    setupInput() {
        // Now using existing textarea from HTML
        this.input = document.getElementById('chat-input');
        if (!this.input) console.error("Chat Input not found!");
    }

    bindEvents() {
        if (this.sendBtn) {
            this.sendBtn.onclick = () => this.sendMessage();
        }
        if (this.input) {
            // Auto-expand
            this.input.addEventListener('input', () => {
                this.input.style.height = 'auto';
                this.input.style.height = Math.min(this.input.scrollHeight, 200) + 'px';
            });

            // Enter to send, Shift+Enter for newline
            this.input.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            };
        }
    }

    setThinking(thinking, avatarUrl) {
        this.isThinking = thinking;

        // Update Header Indicator
        const dot = document.querySelector('.status-dot');
        const label = document.querySelector('.ai-status-label');

        if (dot && label) {
            if (thinking) {
                dot.style.background = '#ff00ff'; // Magenta
                dot.style.boxShadow = '0 0 15px #ff00ff';
                label.innerText = 'UPLINKING_NEURAL_DATA...';
                label.style.color = '#ff00ff';
            } else {
                dot.style.background = '#00ffff'; // Cyan
                dot.style.boxShadow = '0 0 15px #00ffff';
                label.innerText = 'NEURAL_LINK: STABLE';
                label.style.color = '#00ffff';
            }
        }
    }

    async sendMessage() {
        const text = this.input.value.trim();
        if (!text) return;

        // Reset height
        this.input.value = '';
        this.input.style.height = 'auto'; // Reset to default CSS height

        // 1. Show User Message
        this.addBubble(text, true, null); // User doesn't need avatar img in this design

        // 2. Identify Character Avatar logic
        let avatarUrl = null;
        if (state.state.currentCharacterId) {
            const char = state.state.characters.find(c => c.id == state.state.currentCharacterId);
            if (char) {
                // Use same fallback logic as Grid
                if (char.avatar_url && !char.avatar_url.includes('default')) {
                    avatarUrl = char.avatar_url;
                } else {
                    const cleanName = char.name.toLowerCase().split(' ')[0];
                    avatarUrl = `/images/${cleanName}_pixel_portrait.png`;
                }
            }
        }

        // 3. Set Thinking State
        this.setThinking(true, avatarUrl);

        // 4. Send to Backend
        try {
            const response = await state.sendMessage(text);

            this.setThinking(false, null); // Clear thinking

            if (response && (response.text || response.reply)) {
                this.addBubble(response.text || response.reply, false, avatarUrl);
            } else {
                this.addBubble("(No response received from Neural Link)", false, avatarUrl);
            }
        } catch (err) {
            this.setThinking(false, null);
            console.error(err);
            this.addBubble(`Error: ${err.message}`, false, null);
        }
    }

    addBubble(text, isUser, avatarUrl) {
        const row = document.createElement('div');
        row.className = isUser ? 'message-user' : 'message-ai';
        row.style.display = 'flex';
        row.style.marginBottom = '15px';
        row.style.alignItems = 'flex-end';
        row.style.width = '100%';

        if (isUser) {
            row.style.justifyContent = 'flex-end';
        } else {
            row.style.justifyContent = 'flex-start';
        }

        // Avatar (AI Only)
        let avatarHtml = '';
        if (!isUser) {
            avatarHtml = `
                <div class="chat-avatar" style="
                    width: 35px; height: 35px; 
                    margin-right: 10px; 
                    border-radius: 50%; 
                    overflow: hidden; 
                    border: 1px solid var(--neon-cyan);
                    flex-shrink: 0;
                ">
                    <img src="${avatarUrl || 'assets/default_avatar.png'}" 
                         onerror="this.src='assets/default_avatar.png'"
                         style="width: 100%; height: 100%; object-fit: cover;">
                </div>`;
        }

        const bubbleContent = document.createElement('div');
        bubbleContent.className = 'bubble-content';
        bubbleContent.innerText = text;

        const timestamp = document.createElement('div');
        timestamp.className = 'bubble-timestamp';
        timestamp.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        bubbleContent.appendChild(timestamp);

        row.innerHTML = isUser ? '' : avatarHtml;
        row.appendChild(bubbleContent);

        this.container.appendChild(row);
        this.container.scrollTop = this.container.scrollHeight;
    }
}



// Add animation globally if not exists
if (!document.getElementById('anim-pop')) {
    const style = document.createElement('style');
    style.id = 'anim-pop';
    style.innerHTML = `
        @keyframes popIn {
            0% { transform: scale(0.8); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}
