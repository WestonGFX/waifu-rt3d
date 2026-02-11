import { HoloCard } from './HoloCard';
import type { Character } from '../types';

interface RosterPanelProps {
  characters: Character[];
  activeCharId: number;
  onSelect: (character: Character) => void;
  onOpenHud: () => void;
}

export function RosterPanel({ characters, activeCharId, onSelect, onOpenHud }: RosterPanelProps) {
  return (
    <aside className="v2-panel v2-roster">
      <header>
        <h1>Neural Roster</h1>
        <p>Character uplink matrix</p>
      </header>

      <div className="v2-roster-scroll">
        {characters.map((character, index) => (
          <button
            key={character.id}
            className={character.id === activeCharId ? 'v2-card-button active' : 'v2-card-button'}
            type="button"
            onClick={() => onSelect(character)}
          >
            <HoloCard
              title={character.name}
              subtitle={character.model_type === '2d' ? 'Live2D channel' : 'VRM channel'}
              image={character.avatar_url}
              accent={index % 2 === 0 ? 'cyan' : 'magenta'}
            />
          </button>
        ))}
      </div>

      <footer>
        <button type="button" onClick={onOpenHud}>
          Open HUD
        </button>
      </footer>
    </aside>
  );
}
