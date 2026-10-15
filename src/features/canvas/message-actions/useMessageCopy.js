import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { writeTextToClipboard } from '../../../services/clipboard-text.js';

export function useMessageCopy({ identity, getText, onNotify, writer = writeTextToClipboard }) {
  const latest = useRef({ getText, onNotify, writer });
  const active = useRef(null);
  const generation = useRef(0);
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  useLayoutEffect(() => {
    latest.current = { getText, onNotify, writer };
  });
  useLayoutEffect(() => {
    generation.current += 1;
    setStatus('');
    setPending(false);
    return () => {
      generation.current += 1;
      active.current?.abort();
      active.current = null;
    };
  }, [identity]);
  const copy = useCallback(async () => {
    const text = latest.current.getText();
    if (!text) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const revision = generation.current;
    setPending(true);
    setStatus('');
    const current = () =>
      !controller.signal.aborted &&
      generation.current === revision &&
      active.current === controller;
    try {
      await latest.current.writer(text, { signal: controller.signal });
      if (!current()) return;
      setStatus('复制成功');
      latest.current.onNotify?.('复制成功');
    } catch (error) {
      if (!current() || error?.name === 'AbortError') return;
      setStatus('复制失败');
      latest.current.onNotify?.('复制失败');
    } finally {
      if (current()) {
        setPending(false);
        active.current = null;
      }
    }
  }, []);
  return { copy, status, pending };
}
