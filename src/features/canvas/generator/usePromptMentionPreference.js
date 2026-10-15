import { useSyncExternalStore } from 'react';
import { promptMentionPreferences } from '../../../services/prompt-mention-preference.ts';
import { emptyStorageSnapshot } from '../../../services/storage.ts';

export function usePromptMentionPreference() {
  const snapshot = useSyncExternalStore(
    promptMentionPreferences.subscribe,
    promptMentionPreferences.getSnapshot,
    () => emptyStorageSnapshot,
  );
  return {
    enabled: promptMentionPreferences.enabled(snapshot),
    setEnabled: promptMentionPreferences.setEnabled,
    error: snapshot.error,
  };
}
