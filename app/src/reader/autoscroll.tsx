import type { RefObject } from "preact";
import { useEffect, useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import { saveSetting, settings } from "../settings";
import { IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";

export const SPEED_STEPS = 10;

/** CSS pixels a second for each speed step: slow enough to study at 1 (8), a quick skim at 10 (150). */
export const pixelsPerSecond = (speed: number) => Math.round(6 * 1.38 ** Math.min(SPEED_STEPS, Math.max(1, speed)));

/**
 * Moves the pages up by themselves, for reading with free hands. The reader
 * can still scroll: the movement goes on from wherever the page is. It stops
 * at the end of the book, and keeps the screen awake while it runs.
 */
export function useAutoScroll(scroller: RefObject<HTMLElement>) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const el = scroller.current;
    if (!running || !el) return;
    let stopped = false;
    let lock: { release(): Promise<void> } | null = null;
    (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock
      ?.request("screen").then((l) => { if (stopped) l.release(); else lock = l; }).catch(() => {});
    el.classList.add("is-autoscrolling");
    let at = el.scrollTop;
    let last = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const seconds = Math.min(0.1, (now - last) / 1000); // a tab that slept does not jump ahead
      last = now;
      // The reader moved the page: go on from there.
      if (Math.abs(el.scrollTop - at) > 2) at = el.scrollTop;
      at += pixelsPerSecond(settings.autoScrollSpeed.value) * seconds;
      el.scrollTop = at;
      if (at >= el.scrollHeight - el.clientHeight) return setRunning(false); // the end of the book
      frame = requestAnimationFrame(step);
    });
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      el.classList.remove("is-autoscrolling");
      lock?.release().catch(() => {});
    };
  }, [running]);

  const setSpeed = (speed: number) => saveSetting("autoScrollSpeed", Math.min(SPEED_STEPS, Math.max(1, speed)));
  return {
    open,
    running,
    start: () => { setOpen(true); setRunning(true); },
    toggle: () => setRunning((on) => !on),
    stop: () => { setRunning(false); setOpen(false); },
    faster: () => setSpeed(settings.autoScrollSpeed.value + 1),
    slower: () => setSpeed(settings.autoScrollSpeed.value - 1),
  };
}

export function AutoScrollBar({ auto }: { auto: ReturnType<typeof useAutoScroll> }) {
  if (!auto.open) return null;
  const speed = settings.autoScrollSpeed.value;
  return (
    <div class="read-bar auto-bar" role="region" aria-label={t("Auto-scroll")}>
      <IconButton label={t("Slower")} icon="minus" disabled={speed <= 1} onClick={auto.slower} />
      <span class="auto-speed" role="status" aria-label={t("Speed {n} of {max}", { n: speed, max: SPEED_STEPS })} dir="ltr">{speed}</span>
      <IconButton label={t("Faster")} icon="plus" disabled={speed >= SPEED_STEPS} onClick={auto.faster} />
      <button type="button" class="read-play" aria-label={t(auto.running ? "Pause auto-scroll" : "Continue auto-scroll")} onClick={auto.toggle}>
        <Icon name={auto.running ? "pause" : "play"} size={22} />
      </button>
      <IconButton label={t("Stop auto-scroll")} icon="close" onClick={auto.stop} />
    </div>
  );
}
