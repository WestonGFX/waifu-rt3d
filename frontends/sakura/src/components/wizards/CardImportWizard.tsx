import { useState, useRef } from 'react';
import { Upload, Check, Loader2, FileText } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useWizardStore } from '../../stores/wizardStore';
import { WizardShell, type WizardStepDef, type WizardStepProps } from '../wizard/WizardShell';
import { api } from '../../lib/api';

/* ── Step 0: Upload ───────────────────────────────────────────────────── */

function StepUpload({ onNext, setWizardData }: WizardStepProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Parse a SillyTavern character card (CHARA v2 PNG or JSON).
   * Extracts character data from the file and stores it in wizardData.
   */
  const handleFile = async (file: File) => {
    setParsing(true);
    setError(null);
    try {
      // Try JSON first
      if (file.name.endsWith('.json')) {
        const text = await file.text();
        const data = JSON.parse(text);
        const charData = data.data || data;
        // Extract all CHARA v2 fields individually so they can be
        // persisted in their own DB columns (v68+) without data loss.
        const altGreetings = Array.isArray(charData.alternate_greetings)
          ? charData.alternate_greetings : [];
        const tags = Array.isArray(charData.tags) ? charData.tags : [];
        setWizardData({
          importedCard: {
            name: charData.name || charData.char_name || 'Imported Character',
            system_prompt: charData.system_prompt || '',
            greeting_message: charData.first_mes || charData.greeting || '',
            scenario: charData.scenario || '',
            chara_description: charData.description || '',
            personality_traits: charData.personality || charData.description || '',
            mes_example: charData.mes_example || '',
            post_history_instructions: charData.post_history_instructions || '',
            alternate_greetings: altGreetings,
            creator_notes: charData.creator_notes || '',
            chara_tags: tags,
          },
          fileName: file.name,
        });
        onNext();
        return;
      }

      // PNG with embedded CHARA data — send to backend for extraction
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/characters/import-card', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Import failed');
      const result = await res.json();
      setWizardData({
        importedCard: result.character || result,
        fileName: file.name,
      });
      onNext();
    } catch (e) {
      setError(`Failed to parse card: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setParsing(false);
    }
  };

  return (
    <div>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Import a SillyTavern character card (.json or .png with embedded CHARA data).
      </p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => fileRef.current?.click()}
        className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl cursor-pointer transition-all mb-4"
        style={{
          border: `2px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
          backgroundColor: dragOver ? 'var(--color-accent-soft)' : 'var(--color-surface)',
        }}
      >
        {parsing ? (
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
        ) : (
          <Upload size={24} style={{ color: 'var(--color-text-tertiary)' }} />
        )}
        <p className="text-xs text-center" style={{ color: 'var(--color-text-secondary)' }}>
          {parsing ? 'Parsing card...' : 'Drop a character card here, or click to browse'}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {error && (
        <p className="text-xs mb-3" style={{ color: 'var(--color-danger)' }}>{error}</p>
      )}
    </div>
  );
}

/* ── Step 1: Review & Create ──────────────────────────────────────────── */

function StepReview({ onNext, wizardData }: WizardStepProps) {
  const { loadCharacters, selectCharacter } = useAppStore();
  const card = wizardData.importedCard as Record<string, string> | undefined;
  const fileName = wizardData.fileName as string || '';
  const [name, setName] = useState(card?.name || 'Imported Character');
  const [creating, setCreating] = useState(false);

  if (!card) {
    return (
      <div className="text-center py-6">
        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>No card data found. Go back and upload a file.</p>
      </div>
    );
  }

  const handleCreate = async () => {
    setCreating(true);
    try {
      // Pass all available CHARA V2 fields (v68+) — the backend import
      // endpoint handles each field individually, avoiding data loss.
      const charData: Record<string, unknown> = {
        name: name.trim(),
        system_prompt: card.system_prompt || '',
        greeting_text: card.greeting_message || card.first_mes || '',
        personality_traits: card.personality_traits || card.chara_description || '',
        scenario: card.scenario || undefined,
        chara_description: card.chara_description || undefined,
        mes_example: card.mes_example || undefined,
        post_history_instructions: card.post_history_instructions || undefined,
        alternate_greetings: card.alternate_greetings || undefined,
        creator_notes: card.creator_notes || undefined,
        chara_tags: card.chara_tags || undefined,
      };
      // Remove undefined values so the backend doesn't insert empty strings
      for (const key of Object.keys(charData)) {
        if (charData[key] === undefined) delete charData[key];
      }
      const created = await api.createCharacter(charData);
      await loadCharacters();
      selectCharacter(created);
      onNext();
    } catch (e) {
      console.error('Failed to create character from card:', e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <FileText size={14} style={{ color: 'var(--color-accent)' }} />
        <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{fileName}</span>
      </div>

      <div className="mb-3">
        <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-tertiary)' }}>Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full text-xs px-3 py-2 outline-none rounded-lg"
          style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
        />
      </div>

      {card.system_prompt && (
        <div className="mb-3">
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-tertiary)' }}>Personality</label>
          <div className="text-[11px] p-2 rounded-lg max-h-[100px] overflow-y-auto" style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}>
            {(card.system_prompt || '').slice(0, 300)}{(card.system_prompt || '').length > 300 ? '...' : ''}
          </div>
        </div>
      )}

      {card.greeting_message && (
        <div className="mb-3">
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-tertiary)' }}>Greeting</label>
          <div className="text-[11px] p-2 rounded-lg" style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}>
            {(card.greeting_message || '').slice(0, 200)}{(card.greeting_message || '').length > 200 ? '...' : ''}
          </div>
        </div>
      )}

      {card.scenario && (
        <div className="mb-3">
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-tertiary)' }}>Scenario</label>
          <div className="text-[11px] p-2 rounded-lg" style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}>
            {(card.scenario || '').slice(0, 200)}{(card.scenario || '').length > 200 ? '...' : ''}
          </div>
        </div>
      )}

      {card.chara_tags && typeof card.chara_tags === 'string' ? null : Array.isArray(card.chara_tags) && card.chara_tags.length > 0 && (
        <div className="mb-5">
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-tertiary)' }}>Tags</label>
          <div className="flex gap-1 flex-wrap">
            {(card.chara_tags as string[]).slice(0, 10).map((tag: string, i: number) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleCreate}
          disabled={!name.trim() || creating}
          className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Create Character
        </button>
      </div>
    </div>
  );
}

/* ── Wizard assembly ──────────────────────────────────────────────────── */

const STEPS: WizardStepDef[] = [
  { id: 'upload', title: 'Upload', component: StepUpload },
  { id: 'review', title: 'Review & Create', component: StepReview },
];

/**
 * Character Card Import Wizard — 2-step modal for importing SillyTavern cards.
 */
export function CardImportWizard() {
  const { closeWizard } = useWizardStore();
  return (
    <WizardShell
      steps={STEPS}
      variant="modal"
      title="Import Character Card"
      onComplete={closeWizard}
      onCancel={closeWizard}
    />
  );
}
