export class ChatInterface {
    constructor() {
        this.container = document.getElementById('chat-messages');
        this.input = document.querySelector('.chat-layer input');
        this.sendBtn = document.querySelector('.chat-layer button');

        this.bindEvents();
    }

    bindEvents() {
        if (this.sendBtn) {
            this.sendBtn.onclick = () => this.sendMessage();
        }
        if (this.input) {
            this.input.onkeydown = (e) => {
                if (e.key === 'Enter') this.sendMessage();
            };
        }
    }

    sendMessage() {
        const text = this.input.value.trim();
        if (!text) return;

        // 1. Show User Message
        this.addBubble(text, true);
        this.input.value = '';

        // 2. Simulate AI Processing (until Backend wire-up)
        // TODO: Wire to StateManager/API
        setTimeout(() => {
            this.addBubble("I heard you! (Backend connection pending)", false);
        }, 600);
    }

    addBubble(text, isUser) {
        const bubble = document.createElement('div');
        
        const align = isUser ? 'flex-end' : 'flex-start';
        const bg = isUser ? 'var(--brand-primary)' : 'var(--glass-highlight)';
        const color = isUser ? '#000' : 'var(--text-main)';
        
        bubble.style.cssText = `
            align-self: ${align};
            background: ${bg};
            color: ${color};
            padding: 10px 15px;
            border-radius: 12px;
            margin-bottom: 10px;
            max-width: 80%;
            display: inline-block;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        `;
        
        // Wrap in a flex row to support alignment
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = align;
        row.appendChild(bubble);

        bubble.innerText = text;
        this.container.appendChild(row);
        
        // Auto Scroll
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
