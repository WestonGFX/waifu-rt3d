import { useEffect } from 'react';
import { MessageCircle, Search, Sparkles, Brain, Settings } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

const TABS = [
  { id: 'chats', label: 'Chats', icon: MessageCircle },
  { id: 'discover', label: 'Characters', icon: Search },
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
      className="fixed bottom-0 left-0 right-0 h-14 flex items-center justify-around"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-surface) 80%, transparent)',
        backdropFilter: 'var(--blur-surface)',
        WebkitBackdropFilter: 'var(--blur-surface)',
        borderTop: '1px solid var(--color-border-subtle)',
        zIndex: 50
      }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => {
              if (tab.id === 'memory') {
                useAppStore.getState().toggleMemoryPanel();
              } else {
                setActiveTab(tab.id);
              }
            }}
            className="relative flex flex-col items-center gap-0.5 px-4 py-1.5 transition-all duration-200"
            style={{
              color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)'
            }}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
            <span
              className="text-[10px] font-medium"
              style={{ opacity: active ? 1 : 0.7 }}
            >
              {tab.label}
            </span>
            {/* Active indicator dot */}
            {active && (
              <span
                className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                style={{ backgroundColor: 'var(--color-accent)' }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
