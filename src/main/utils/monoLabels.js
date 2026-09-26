export const MONO_SELECTOR = '[data-mono], .description-label, .section-index, .section-label > [data-reveal], .award-count, .service-category';

export function formatMonoLabel(value) {
  const label = String(value).trim().replace(/^\[\s*|\s*\]$/g, '');
  return `[ ${label.toUpperCase()} ]`;
}

/** Normalize and mark every Space Mono label for the shared shuffle lifecycle. */
export function formatMonoLabels(root) {
  for (const element of root.querySelectorAll(MONO_SELECTOR)) {
    element.dataset.mono = '';
    element.textContent = formatMonoLabel(element.textContent);
  }
}
