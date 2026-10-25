import { el, icon } from './ui';

export const EXAM_GOOD_LUCK_SCHEDULE = {
  start: '2026-10-25T00:01:00+05:30',
  end: '2026-10-25T14:00:00+05:30',
} as const;

const START_MS = Date.parse(EXAM_GOOD_LUCK_SCHEDULE.start);
const END_MS = Date.parse(EXAM_GOOD_LUCK_SCHEDULE.end);
const DISMISSED_KEY = 'german-i-study-desk:exam-good-luck-dismissed:2026-10-25';
const CHECK_INTERVAL_MS = 60_000;

let initialized = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let dialog: HTMLDialogElement | null = null;
let previouslyFocused: HTMLElement | null = null;

export function isExamGoodLuckWindow(nowMs: number): boolean {
  return nowMs >= START_MS && nowMs < END_MS;
}

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function dismiss(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, 'true');
  } catch {
    // A storage failure must not prevent the user from closing the dialog.
  }
  closeDialog();
}

function closeDialog(): void {
  if (!dialog) return;
  if (dialog.open) dialog.close();
  dialog.removeAttribute('aria-hidden');
  if (previouslyFocused?.isConnected) previouslyFocused.focus();
  previouslyFocused = null;
}

function showDialog(): void {
  if (!dialog || dialog.open || isDismissed()) return;
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.showModal();
  dialog.querySelector<HTMLButtonElement>('[data-exam-good-luck-close]')?.focus();
}

function checkSchedule(): void {
  const now = Date.now();
  if (now >= END_MS) {
    closeDialog();
    if (timer) clearTimeout(timer);
    timer = null;
    return;
  }

  if (isExamGoodLuckWindow(now) && !isDismissed()) showDialog();

  const nextBoundary = now < START_MS ? START_MS : END_MS;
  const delay = Math.max(0, Math.min(nextBoundary - now, CHECK_INTERVAL_MS));
  if (timer) clearTimeout(timer);
  timer = setTimeout(checkSchedule, delay);
}

function createDialog(): HTMLDialogElement {
  const titleId = 'exam-good-luck-title';
  const messageId = 'exam-good-luck-message';
  const node = el('dialog', {
    class: 'exam-good-luck-dialog',
    'aria-labelledby': titleId,
    'aria-describedby': messageId,
  }) as HTMLDialogElement;
  const closeButton = el('button', {
    class: 'exam-good-luck-close',
    type: 'button',
    'aria-label': 'Close good-luck message',
    'data-exam-good-luck-close': true,
  }, ['Close']);
  const closeIconButton = el('button', {
    class: 'exam-good-luck-icon-close',
    type: 'button',
    'aria-label': 'Close good-luck message',
    'data-exam-good-luck-close': true,
  }, [icon({ name: 'close', size: 18 })]);

  node.append(
    el('div', { class: 'exam-good-luck-card' }, [
      closeIconButton,
      el('div', { class: 'exam-good-luck-flag', 'aria-hidden': 'true' }, ['🇩🇪']),
      el('div', { class: 'exam-good-luck-kicker', text: 'NPTEL German I' }),
      el('h2', { id: titleId, text: 'All the Best! 🎯' }),
      el('p', {
        id: messageId,
        text: 'Wishing you the very best for your NPTEL German I exam! Stay calm, trust your preparation, read every question carefully, and give it your best. You’ve got this! 💪📚',
      }),
      el('p', { class: 'exam-good-luck-closing', text: 'Viel Glück! 🇩🇪 — German I Study Desk' }),
      closeButton,
    ]),
  );

  closeButton.addEventListener('click', dismiss);
  node.addEventListener('cancel', (event) => {
    event.preventDefault();
    dismiss();
  });
  node.addEventListener('click', (event) => {
    if (event.target === node) dismiss();
  });
  return node;
}

export function initExamGoodLuckPopup(): void {
  if (initialized || typeof window === 'undefined' || typeof document === 'undefined') return;
  initialized = true;

  dialog = createDialog();
  document.body.append(dialog);
  checkSchedule();

  document.addEventListener('visibilitychange', checkSchedule);
  window.addEventListener('focus', checkSchedule);
  window.addEventListener('pageshow', checkSchedule);
}

export function __resetExamGoodLuckPopupForTesting(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  dialog?.remove();
  dialog = null;
  previouslyFocused = null;
  initialized = false;
}
