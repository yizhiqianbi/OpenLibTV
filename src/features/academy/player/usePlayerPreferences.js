import { useState } from 'react';
import { readStoredValue, writeStoredValue } from '../../../services/storage.ts';
import { normalizePreferences, PLAYER_PREFERENCE_KEY } from './player-model.js';

export function usePlayerPreferences() {
  const [preference, setPreference] = useState(() =>
    normalizePreferences(readStoredValue(PLAYER_PREFERENCE_KEY, {})),
  );
  const [storageError, setStorageError] = useState('');
  function update(patch) {
    const next = normalizePreferences({ ...preference, ...patch });
    setPreference(next);
    try {
      writeStoredValue(PLAYER_PREFERENCE_KEY, next);
      setStorageError('');
    } catch {
      setStorageError('播放偏好无法保存，当前选择仍然有效');
    }
  }
  return {
    ...preference,
    storageError,
    setRate: (rate) => update({ rate }),
    setQualityHeight: (qualityHeight) => update({ qualityHeight }),
  };
}
