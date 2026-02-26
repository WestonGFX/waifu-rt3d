import { useEffect } from 'react';
import { MessageCircle, Search, Sparkles, Brain, Settings } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

const TABS = [
  { id: 'chats', label: 'Chats', icon: MessageCircle },
  { id: 'discover', label: 'Discover', icon: Search },
  { id: 'create', label: 'Create', icon: Sparkles },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'settings', label: 'Settings', icon: Settings }
] as const;

export function TabBar() {
  const { activeTab, setActiveTab, inChatThread } = useAppStore();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        setActiveTab(TABS[parseInt(e.key) - 1].id);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setActiveTab]);

  if (inChatThread) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 h-12 flex items-center justify-around"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        zIndex: 50
      }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex flex-col items-center gap-0.5 px-4 py-1 transition-colors duration-150"
            style={{
              color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)'
            }}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
