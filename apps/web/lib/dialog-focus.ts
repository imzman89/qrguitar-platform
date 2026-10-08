/** Focus only controls participating in the visible dialog's keyboard order. */
export function dialogControls(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>('a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]'))
    .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[hidden], [inert], [aria-hidden="true"]') && element.getClientRects().length > 0);
}

export function focusDialog(panel: HTMLElement | null) {
  if (panel) (dialogControls(panel)[0] || panel).focus();
}

export function trapDialogTab(event: KeyboardEvent, panel: HTMLElement) {
  const controls = dialogControls(panel);
  const active = panel.ownerDocument.activeElement;
  if (!controls.length) {
    event.preventDefault(); panel.focus(); return;
  }
  const first = controls[0], last = controls[controls.length - 1];
  if (!controls.includes(active as HTMLElement) || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
    event.preventDefault(); (event.shiftKey ? last : first).focus();
  }
}
