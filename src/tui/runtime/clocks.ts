import { ACTIVITY_SPINNER_INTERVAL_MS } from "../widgets/activity-indicator";
import {
  COMPOSER_PLACEHOLDER_INTERVAL_MS,
  type ComposerPlaceholderMode,
} from "../widgets/composer-placeholder";

export interface RuntimeClockSnapshot {
  activityFrame?: number;
  activityElapsedMs?: number;
  placeholderFrame: number;
}

export interface RuntimeClocks {
  sync(): void;
  snapshot(): RuntimeClockSnapshot;
  markActivityStarted(now?: number): void;
  restartActivity(now?: number): void;
  finishActivity(): void;
  dispose(): void;
}

export interface RuntimeClockOptions {
  isClosing(): boolean;
  isActivityActive(): boolean;
  placeholderMode(): ComposerPlaceholderMode;
  onTick(): void;
}

export function createRuntimeClocks(options: RuntimeClockOptions): RuntimeClocks {
  let activityFrame = 0;
  let activityStartedAtMs: number | undefined;
  let activityTimer: ReturnType<typeof setInterval> | undefined;
  let placeholderFrame = 0;
  let placeholderMode: ComposerPlaceholderMode = options.placeholderMode();
  let placeholderTimer: ReturnType<typeof setInterval> | undefined;

  const stopActivityTimer = () => {
    if (!activityTimer) return;
    clearInterval(activityTimer);
    activityTimer = undefined;
    activityFrame = 0;
  };

  const stopPlaceholderTimer = () => {
    if (!placeholderTimer) return;
    clearInterval(placeholderTimer);
    placeholderTimer = undefined;
  };

  const syncActivityTimer = () => {
    if (!options.isActivityActive()) {
      stopActivityTimer();
      return;
    }
    if (activityTimer) return;

    activityTimer = setInterval(() => {
      if (options.isClosing() || !options.isActivityActive()) {
        stopActivityTimer();
        return;
      }
      activityFrame = (activityFrame + 1) % Number.MAX_SAFE_INTEGER;
      options.onTick();
    }, ACTIVITY_SPINNER_INTERVAL_MS);
  };

  const syncPlaceholderMode = () => {
    const nextMode = options.placeholderMode();
    const changed = nextMode !== placeholderMode;
    if (changed) {
      placeholderMode = nextMode;
      placeholderFrame = 0;
    }
    return { mode: nextMode, changed };
  };

  const syncPlaceholderTimer = () => {
    const { mode } = syncPlaceholderMode();
    if (mode === "hidden") {
      stopPlaceholderTimer();
      return;
    }
    if (placeholderTimer) return;

    placeholderTimer = setInterval(() => {
      const next = syncPlaceholderMode();
      if (options.isClosing() || next.mode === "hidden") {
        stopPlaceholderTimer();
        return;
      }
      if (next.changed) {
        options.onTick();
        return;
      }
      placeholderFrame += 1;
      options.onTick();
    }, COMPOSER_PLACEHOLDER_INTERVAL_MS);
  };

  return {
    sync: () => {
      syncActivityTimer();
      syncPlaceholderTimer();
    },
    snapshot: () => ({
      activityFrame: options.isActivityActive() ? activityFrame : undefined,
      activityElapsedMs: options.isActivityActive() && activityStartedAtMs !== undefined
        ? Date.now() - activityStartedAtMs
        : undefined,
      placeholderFrame,
    }),
    markActivityStarted: (now = Date.now()) => {
      activityStartedAtMs ??= now;
    },
    restartActivity: (now = Date.now()) => {
      activityStartedAtMs = now;
      activityFrame = 0;
    },
    finishActivity: () => {
      activityStartedAtMs = undefined;
      activityFrame = 0;
      stopActivityTimer();
    },
    dispose: () => {
      stopActivityTimer();
      stopPlaceholderTimer();
    },
  };
}
