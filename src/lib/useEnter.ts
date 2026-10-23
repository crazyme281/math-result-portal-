import { useEffect, useRef } from 'react';
import { useIonViewWillEnter } from '@ionic/react';

/** Runs `fn` every time the page is shown (and once on mount). Calls within 800 ms of each other are merged. */
export function useEnter(fn: () => void) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const last = useRef(0);
  const run = () => {
    const now = Date.now();
    if (now - last.current < 800) return;
    last.current = now;
    fnRef.current();
  };
  useIonViewWillEnter(run);
  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
