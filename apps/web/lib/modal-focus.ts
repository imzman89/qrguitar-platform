export function trapVisibleFocus(container: HTMLElement | null, event: KeyboardEvent) {
  if (event.key !== "Tab" || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
  )).filter(element => {
    if (element.tabIndex < 0 || element.closest('[hidden], [inert], [aria-hidden="true"]') || !element.getClientRects().length) return false;
    if (getComputedStyle(element).visibility === "hidden") return false;
    for (let parent = element.parentElement; parent && parent !== container; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS" && !(parent as HTMLDetailsElement).open && element !== parent.querySelector("summary")) return false;
    }
    return true;
  });
  const first = items[0], last = items[items.length - 1];
  if (!first) { event.preventDefault(); container.focus(); return; }
  if (!items.includes(document.activeElement as HTMLElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
