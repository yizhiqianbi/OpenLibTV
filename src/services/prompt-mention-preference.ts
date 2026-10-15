import { storageRepository, type StorageSnapshot } from './storage.ts';

export const PROMPT_MENTION_KEY = 'libtv:promptMentionEnabled';
const TIP_KEY = 'libtv:promptMentionTabTipSeen:';
type TipMode = 'caret' | 'batch';
type Repository = Pick<
  typeof storageRepository,
  'getSnapshot' | 'writeStoredString' | 'subscribeStoredValue'
>;

/** Source 974903 / 773557 use raw 1/0 strings, independent of account or canvas documents. */
export function createPromptMentionPreferences(repository: Repository) {
  const seen = new Set<TipMode>();
  return {
    getSnapshot: () => repository.getSnapshot(PROMPT_MENTION_KEY),
    subscribe: (listener: () => void) =>
      repository.subscribeStoredValue(PROMPT_MENTION_KEY, listener),
    enabled: (snapshot: StorageSnapshot) => snapshot.raw === null || snapshot.raw === '1',
    setEnabled(enabled: boolean) {
      try {
        repository.writeStoredString(PROMPT_MENTION_KEY, enabled ? '1' : '0');
        return true;
      } catch {
        return false;
      }
    },
    claimTip(mode: TipMode) {
      if (seen.has(mode) || repository.getSnapshot(TIP_KEY + mode).raw === '1') return false;
      seen.add(mode);
      try {
        repository.writeStoredString(TIP_KEY + mode, '1');
      } catch {
        // A denied store does not repeatedly show the same tip during this application session.
      }
      return true;
    },
  };
}

export const promptMentionPreferences = createPromptMentionPreferences(storageRepository);
