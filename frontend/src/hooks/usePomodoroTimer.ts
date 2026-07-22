import { useCallback, useEffect, useRef, useState } from 'react';

export type PomodoroPhase = 'idle' | 'work' | 'break' | 'longBreak';

export const POMODORO_SHORT_BREAK_MIN = 5;
export const POMODORO_LONG_BREAK_MIN = 25;
export const POMODORO_CYCLES = 4;

const STORAGE_KEY = 'flowday-pomodoro';

type StoredState = {
  workMinutes: number;
  phase: PomodoroPhase;
  secondsLeft: number;
  running: boolean;
  endsAt: number | null;
  linkedActivityId: number | string | '';
  cycleCount: number;
};

function loadStored(): Partial<StoredState> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<StoredState>;
  } catch {
    return null;
  }
}

function saveStored(state: StoredState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function usePomodoroTimer(initialWorkMinutes: number) {
  const stored = loadStored();
  const [workMinutes, setWorkMinutes] = useState(stored?.workMinutes ?? initialWorkMinutes);
  const [phase, setPhase] = useState<PomodoroPhase>(stored?.phase ?? 'idle');
  const [cycleCount, setCycleCount] = useState(stored?.cycleCount ?? 0);
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (stored?.endsAt && stored.running) {
      return Math.max(0, Math.ceil((stored.endsAt - Date.now()) / 1000));
    }
    return stored?.secondsLeft ?? initialWorkMinutes * 60;
  });
  const [running, setRunning] = useState(() => {
    if (stored?.endsAt && stored.running) {
      return stored.endsAt > Date.now();
    }
    return false;
  });
  const [linkedActivityId, setLinkedActivityId] = useState<number | string | ''>(stored?.linkedActivityId ?? '');

  const endsAtRef = useRef<number | null>(
    stored?.running && stored.endsAt && stored.endsAt > Date.now() ? stored.endsAt : null,
  );
  const phaseRef = useRef(phase);
  const workMinutesRef = useRef(workMinutes);
  const secondsLeftRef = useRef(secondsLeft);
  const runningRef = useRef(running);
  const linkedIdRef = useRef(linkedActivityId);
  const cycleCountRef = useRef(cycleCount);
  const onWorkCompleteRef = useRef<((minutes: number) => void) | null>(null);
  const onBreakCompleteRef = useRef<(() => void) | null>(null);

  phaseRef.current = phase;
  workMinutesRef.current = workMinutes;
  secondsLeftRef.current = secondsLeft;
  runningRef.current = running;
  linkedIdRef.current = linkedActivityId;
  cycleCountRef.current = cycleCount;

  const persist = useCallback((patch: Partial<StoredState>) => {
    saveStored({
      workMinutes: workMinutesRef.current,
      phase: phaseRef.current,
      secondsLeft: secondsLeftRef.current,
      running: runningRef.current,
      endsAt: endsAtRef.current,
      linkedActivityId: linkedIdRef.current,
      cycleCount: cycleCountRef.current,
      ...patch,
    });
  }, []);

  useEffect(() => {
    if (endsAtRef.current && endsAtRef.current > Date.now()) {
      runningRef.current = true;
      setRunning(true);
    }
  }, []);

  useEffect(() => {
    if (!running || !endsAtRef.current) return;

    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAtRef.current! - Date.now()) / 1000));
      setSecondsLeft(left);

      if (left > 0) return;

      endsAtRef.current = null;
      setRunning(false);

      if (phaseRef.current === 'work') {
        const mins = workMinutesRef.current;
        onWorkCompleteRef.current?.(mins);
        const nextCycle = cycleCountRef.current + 1;
        cycleCountRef.current = nextCycle;
        setCycleCount(nextCycle);

        if (nextCycle >= POMODORO_CYCLES) {
          const longSecs = POMODORO_LONG_BREAK_MIN * 60;
          phaseRef.current = 'longBreak';
          setPhase('longBreak');
          setSecondsLeft(longSecs);
          persist({ phase: 'longBreak', secondsLeft: longSecs, running: false, endsAt: null, cycleCount: nextCycle });
        } else {
          const breakSecs = POMODORO_SHORT_BREAK_MIN * 60;
          phaseRef.current = 'break';
          setPhase('break');
          setSecondsLeft(breakSecs);
          persist({ phase: 'break', secondsLeft: breakSecs, running: false, endsAt: null, cycleCount: nextCycle });
        }
        return;
      }

      const wasLongBreak = phaseRef.current === 'longBreak';
      onBreakCompleteRef.current?.();

      if (wasLongBreak) {
        cycleCountRef.current = 0;
        setCycleCount(0);
      }

      phaseRef.current = 'idle';
      setPhase('idle');
      const resetSecs = workMinutesRef.current * 60;
      setSecondsLeft(resetSecs);
      persist({
        phase: 'idle',
        secondsLeft: resetSecs,
        running: false,
        endsAt: null,
        cycleCount: wasLongBreak ? 0 : cycleCountRef.current,
      });
    };

    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [running, persist]);

  useEffect(() => {
    const onVisibility = () => {
      if (!running || !endsAtRef.current) return;
      setSecondsLeft(Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000)));
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [running]);

  function applyWorkDuration(minutes: number) {
    const clamped = Math.max(5, Math.min(120, minutes));
    if (running) return;
    setWorkMinutes(clamped);
    workMinutesRef.current = clamped;
    if (phase === 'idle') {
      setSecondsLeft(clamped * 60);
      persist({ workMinutes: clamped, secondsLeft: clamped * 60 });
    }
  }

  function start() {
    let secs = secondsLeft;
    let nextPhase = phase;

    if (phase === 'idle' || ((phase === 'break' || phase === 'longBreak') && secs <= 0)) {
      nextPhase = 'work';
      secs = workMinutes * 60;
      setPhase('work');
      phaseRef.current = 'work';
      setSecondsLeft(secs);
    }

    endsAtRef.current = Date.now() + secs * 1000;
    setRunning(true);
    persist({
      phase: nextPhase === 'idle' ? 'work' : nextPhase,
      secondsLeft: secs,
      running: true,
      endsAt: endsAtRef.current,
    });
  }

  function pause() {
    let left = secondsLeft;
    if (endsAtRef.current) {
      left = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000));
      setSecondsLeft(left);
    }
    endsAtRef.current = null;
    setRunning(false);
    persist({ running: false, endsAt: null, secondsLeft: left });
  }

  function reset() {
    endsAtRef.current = null;
    setRunning(false);
    phaseRef.current = 'idle';
    setPhase('idle');
    cycleCountRef.current = 0;
    setCycleCount(0);
    const secs = workMinutes * 60;
    setSecondsLeft(secs);
    persist({ phase: 'idle', running: false, endsAt: null, secondsLeft: secs, cycleCount: 0 });
  }

  return {
    workMinutes,
    shortBreakMinutes: POMODORO_SHORT_BREAK_MIN,
    longBreakMinutes: POMODORO_LONG_BREAK_MIN,
    cycleCount,
    cyclesTotal: POMODORO_CYCLES,
    phase,
    secondsLeft,
    running,
    linkedActivityId,
    setLinkedActivityId: (id: number | string | '') => {
      linkedIdRef.current = id;
      setLinkedActivityId(id);
      persist({ linkedActivityId: id });
    },
    applyWorkDuration,
    start,
    pause,
    reset,
    onWorkComplete: (cb: (minutes: number) => void) => {
      onWorkCompleteRef.current = cb;
    },
    onBreakComplete: (cb: () => void) => {
      onBreakCompleteRef.current = cb;
    },
  };
}
