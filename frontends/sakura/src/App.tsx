import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TabBar } from './components/TabBar';
import { MemoryPanel } from './components/MemoryPanel';
import { ChatsView } from './views/ChatsView';
import { ChatThread } from './views/ChatThread';
import { DiscoverView } from './views/DiscoverView';
import { CreateView } from './views/CreateView';
import { SettingsView } from './views/SettingsView';
import { useAppStore } from './stores/appStore';
import { useTheme } from './hooks/useTheme';

/**
 * Tab-based view router with animated transitions.
 * Uses Framer Motion's AnimatePresence for smooth fade+slide on tab switch.
 */
function ViewRouter() {
  const { activeTab } = useAppStore();

  const view = (() => {
    switch (activeTab) {
      case 'chats': return <ChatsView />;
      case 'discover': return <DiscoverView />;
      case 'create': return <CreateView />;
      case 'memory': return <ChatsView />;
      case 'settings': return <SettingsView />;
      default: return <ChatsView />;
    }
  })();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        {view}
      </motion.div>
    </AnimatePresence>
  );
}

export function App() {
  const { loadCharacters, loadConfig, inChatThread } = useAppStore();
  const { theme } = useTheme();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    loadCharacters().catch(console.error);
    loadConfig().catch(console.error);
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      {inChatThread ? (
        <ChatThread />
      ) : (
        <div className="pb-14">
          <ViewRouter />
          <TabBar />
        </div>
      )}
      <MemoryPanel />
    </div>
  );
}
