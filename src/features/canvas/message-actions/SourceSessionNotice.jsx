import { useLayoutEffect, useRef, useState } from 'react';
import { canContinueSourceSession, sourceSessionLabel } from './message-action-model.js';

export default function SourceSessionNotice({
  sourceId,
  session,
  language = 'zh',
  projectId,
  currentSessionId,
  ready = false,
  isShareReplay = false,
  onContinue,
  onNotify,
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const latest = useRef({
    sourceId,
    session,
    projectId,
    currentSessionId,
    ready,
    isShareReplay,
    onContinue,
    onNotify,
  });
  useLayoutEffect(() => {
    latest.current = {
      sourceId,
      session,
      projectId,
      currentSessionId,
      ready,
      isShareReplay,
      onContinue,
      onNotify,
    };
  });
  useLayoutEffect(() => {
    epoch.current += 1;
    inFlight.current = false;
    setPending(false);
    setError('');
    return () => {
      epoch.current += 1;
    };
  }, [sourceId, projectId, currentSessionId]);
  const allowed = canContinueSourceSession({
    sourceId,
    session,
    projectId,
    currentSessionId,
    ready,
    isShareReplay,
    pending,
    onContinue,
  });
  const label = sourceSessionLabel(session, language);
  const activate = async () => {
    if (!canContinueSourceSession({ ...latest.current, pending: inFlight.current })) return;
    const revision = epoch.current;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      const result = await latest.current.onContinue(sourceId);
      if (result === false) throw new Error('Source session switch failed');
    } catch {
      if (epoch.current !== revision) return;
      setError('操作失败');
      latest.current.onNotify?.('操作失败');
    } finally {
      if (epoch.current === revision) {
        inFlight.current = false;
        setPending(false);
      }
    }
  };
  return (
    <div className="cv-message-source-session">
      从{' '}
      <button
        type="button"
        title={label}
        disabled={!allowed}
        aria-busy={pending}
        onClick={() => void activate()}
      >
        <span className="cv-message-source-session-icon" aria-hidden="true" />
        <span>{label}</span>
      </button>{' '}
      继续，
      {error && (
        <span role="status" className="cv-message-source-session-error">
          {error}
        </span>
      )}
    </div>
  );
}
