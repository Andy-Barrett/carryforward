// Notification events are navigation hints, never assignment/access grants.
// The owner of the field view must dispose this binding on logout, account
// change, expiry or navigation. Revalidation must fetch the current session and
// assigned job; it must not substitute a cached job or data from event.detail.
export function bindNativeReminderEvents({ windowTarget, revalidate, open, onError = () => {} }) {
  if (!windowTarget?.addEventListener || !windowTarget?.removeEventListener ||
      typeof revalidate !== 'function' || typeof open !== 'function' || typeof onError !== 'function') {
    throw new TypeError('A window target, revalidation and opening callbacks are required');
  }

  let active = true;
  let generation = 0;
  let pending;
  const current = (token, controller) => active && generation === token && !controller.signal.aborted;

  const receive = event => {
    const detail = event?.detail;
    if (!active || detail?.status !== 'open' || !['shop', 'site'].includes(detail.reason)) return;
    const kind = detail.reason;
    const token = ++generation;
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    void (async () => {
      try {
        // Intentionally pass no reminder ID, job ID or other event payload.
        const context = await revalidate({ signal: controller.signal });
        if (!current(token, controller) || !context || typeof context !== 'object' || Array.isArray(context)) return;
        await open(context, { kind, finish: kind === 'site', signal: controller.signal });
      } catch (error) {
        if (current(token, controller)) {
          // An error reporter must not turn a failed/stale tap into an
          // unhandled rejection. It has no navigation fallback authority.
          try { await onError(error); } catch { /* caller may log locally */ }
        }
      } finally {
        if (pending === controller) pending = undefined;
      }
    })();
  };

  windowTarget.addEventListener('carryforward-reminders', receive);
  const stop = () => {
    if (!active) return;
    active = false;
    generation++;
    pending?.abort();
    pending = undefined;
    windowTarget.removeEventListener('carryforward-reminders', receive);
  };
  return Object.freeze({ stop, dispose: stop });
}
