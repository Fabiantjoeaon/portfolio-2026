/** Apply before SplitText so the brackets participate in the same reveal. */
export function formatMonoLabels(root) {
  for (const element of root.querySelectorAll('[data-mono], .description-label, .section-index, .section-label > [data-reveal], .award-count, .service-category')) {
    const label = element.textContent.trim().replace(/^\[\s*|\s*\]$/g, '');
    element.textContent = `[ ${label.toUpperCase()} ]`;
  }
}
