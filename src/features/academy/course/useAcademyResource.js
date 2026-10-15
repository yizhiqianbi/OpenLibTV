import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Each request belongs to one route/selection. Late responses cannot replace a new selection. */
export function useAcademyResource(key, read, { keepPrevious = false } = {}) {
  const loader = useRef(read);
  useLayoutEffect(() => {
    loader.current = read;
  }, [read]);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ key, loading: !!key, data: null, error: null });
  useEffect(() => {
    let active = true;
    if (!key) return;
    setState((previous) => ({
      key,
      loading: true,
      data: keepPrevious && previous.key === key ? previous.data : null,
      error: null,
    }));
    Promise.resolve()
      .then(() => loader.current({ force: revision > 0 }))
      .then(
        (data) => {
          if (active) setState({ key, loading: false, data, error: null });
        },
        (error) => {
          if (active)
            setState((previous) => ({
              key,
              loading: false,
              data: keepPrevious && previous.key === key ? previous.data : null,
              error,
            }));
        },
      );
    return () => {
      active = false;
    };
  }, [key, revision, keepPrevious]);
  return {
    ...(key && state.key === key ? state : { key, loading: !!key, data: null, error: null }),
    reload: () => setRevision((value) => value + 1),
  };
}
