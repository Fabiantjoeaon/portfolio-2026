import { PROJECTS, findProject } from "./projects.js";

export const SITE = {
  url: "https://fabiantjoeaon.com",
  name: "Fabian Tjoe-A-On",
  title: "Fabian Tjoe-A-On — Creative technologist",
  description:
    "Creative and technical direction, analog heart with exceptional digitalism.",
  shareDescription:
    "Creative and technical direction, analog heart with exceptional digitalism.",
  role: "Creative technologist",
  email: "fabiantjoeaon@gmail.com",
  locale: "en_US",
  themeColor: "#000000",
  image: { path: "/og/home.jpg", width: 1200, height: 630 },
};

export const ogImagePath = (slug) => `/og/${slug}.jpg`;

// Search results truncate around 155 characters, social previews around 125.
const SEARCH_LENGTH = 155;
const SHARE_LENGTH = 125;

function sentencesWithin(text, max) {
  let out = "";
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if ((out ? out.length + 1 : 0) + sentence.length > max) break;
    out = out ? `${out} ${sentence}` : sentence;
  }
  return out;
}

const clip = (text, max) => {
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:—–-]+$/, "")}…`;
};

// Whole sentences beat the client credit, which beats an ellipsis.
function projectDescription(project, max) {
  const body = project.description.trim().replace(/([^.!?])$/, "$1.");
  const agency =
    project.agency && project.agency !== "Independent"
      ? ` with ${project.agency}`
      : "";
  const suffix = `For ${project.client}${agency}, ${project.year}.`;
  const room = max - suffix.length - 1;
  const credited = sentencesWithin(body, room);
  if (credited) return `${credited} ${suffix}`;
  return sentencesWithin(body, max) || `${clip(body, room)} ${suffix}`;
}

/** Title, descriptions, path and share image for a route path. */
export function routeMeta(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/about") {
    return {
      path,
      title: `About — ${SITE.name}`,
      description:
        "Creative and technical direction with an analog heart: real-time 3D, full stack development and sound.",
      shareDescription:
        "Creative and technical direction with an analog heart: real-time 3D, full stack development and sound.",
      image: ogImagePath("about"),
      type: "profile",
    };
  }
  const project = path.startsWith("/project/") && findProject(path.slice(9));
  if (project) {
    return {
      path,
      title: `${project.name} — ${SITE.name}`,
      description: projectDescription(project, SEARCH_LENGTH),
      shareDescription: projectDescription(project, SHARE_LENGTH),
      image: ogImagePath(project.slug),
      type: "article",
      project,
    };
  }
  return {
    path: "/",
    title: SITE.title,
    description: SITE.description,
    shareDescription: SITE.shareDescription,
    image: SITE.image.path,
    type: "website",
  };
}

export const ROUTES = [
  "/",
  "/about",
  ...PROJECTS.map((project) => `/project/${project.slug}`),
];
