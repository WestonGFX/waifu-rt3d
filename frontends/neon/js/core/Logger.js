/**
 * Logger.js
 * Comprehensive logging system for Dev Mode.
 * Supports: Memory Buffer, Session Persistence, File Export.
 */
export class Logger {
    constructor(limit = 1000) {
        this.limit = limit;
        this.logs = [];
        this.isEnabled = false; 
        
        // Load from session if exists
        try {
            const saved = sessionStorage.getItem('waifu_logs');
            if (saved) this.logs = JSON.parse(saved);
        } catch (e) {
            console.error("Failed to load logs", e);
        }
    }

    /**
     * Enable or Disable Dev Mode Overlay logging
     */
    toggle(state) {
        this.isEnabled = state;
    }

    /**
     * Log an event
     * @param {string} source Component/Module Name
     * @param {string} message Detail
     * @param {string} type 'info' | 'warn' | 'error' | 'success'
     */
    log(source, message, type = 'info') {
        const entry = {
            timestamp: new Date().toISOString(),
            source,
            message,
            type
        };

        this.logs.push(entry);
        
        // Prune
        if (this.logs.length > this.limit) {
            this.logs.shift();
        }

        // Persist
        sessionStorage.setItem('waifu_logs', JSON.stringify(this.logs));

        // Console Mirror
        const css = type === 'error' ? 'color:red' : type === 'warn' ? 'color:orange' : 'color:#00f3ff';
        console.log(`%c[${source}] ${message}`, css);

        // GUI Update (if listener attached)
        if (this.onLog) this.onLog(entry);
    }

    warn(source, message) { this.log(source, message, 'warn'); }
    error(source, message) { this.log(source, message, 'error'); }
    success(source, message) { this.log(source, message, 'success'); }

    /**
     * Export logs to a text file
     */
    exportLogs() {
        const text = this.logs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] [${l.source}]: ${l.message}`).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `waifu_debug_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.log.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
    }

    clear() {
        this.logs = [];
        sessionStorage.removeItem('waifu_logs');
        if (this.onLog) this.onLog(null); // Signal clear
    }
}

export const logger = new Logger(2000); // Singleton
