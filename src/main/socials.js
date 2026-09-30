// Placeholder profiles: replace before publishing.
const SOCIALS = [
  ["LI", "https://www.linkedin.com/in/your-profile/"],
  ["X", "https://x.com/your_handle"],
  ["IG", "https://www.instagram.com/your_handle/"],
];

export const socialsMarkup = (className) => `
  <ul class="${className}" aria-label="Social profiles">
    ${SOCIALS.map(([label, href]) => `<li><a href="${href}" target="_blank" rel="noopener noreferrer"><span data-mono>${label}</span> <span aria-hidden="true">↗</span></a></li>`).join("")}
  </ul>`;
