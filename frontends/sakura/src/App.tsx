import { useEffect } from 'react';
import { TabBar } from './components/TabBar';
import { ChatsView } from './views/ChatsView';
import { ChatThread } from './views/ChatThread';
import { DiscoverView } from './views/DiscoverView';
import { CreateView } from './views/CreateView';
import { SettingsView } from './views/SettingsView';
import { useAppStore } from './stores/appStore';
import { useTheme } from './hooks/useTheme';

function ViewRouter() {
  const { activeTab } = useAppStore();
  switch (activeTab) {
    case 'chats': return <ChatsView />;
    case 'discover': return <DiscoverView />;
    case 'create': return <CreateView />;
    case 'memory': return <div className="p-6"><h2 className="text-xl font-semibold">Memory</h2></div>;
    case 'settings': return <SettingsView />;
    default: return <ChatsView />;
  }
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
        <div className="pb-12">
          <ViewRouter />
          <TabBar />
        </div>
      )}
    </div>
  );
}
