import { PROJECTS, findProject } from "./projects.js";

export const SITE = {
  url: "https://fabiantjoeaon.com",
  name: "Fabian Tjoe-A-On",
  title: "Fabian Tjoe-A-On — Creative developer",
  description:
    "Creative developer and technical director building award-winning real-time 3D, WebGPU and WebGL experiences for Spotify, Google, Dior, Audemars Piguet and The Wall Street Journal.",
  role: "Creative developer",
  email: "fabiantjoeaon@gmail.com",
  locale: "en_US",
  themeColor: "#000000",
  image: { path: "/og/home.jpg", width: 1200, height: 630 },
};

export const ogImagePath = (slug) => `/og/${slug}.jpg`;

/** Title, description, path and share image for a route path. */
export function routeMeta(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/about") {
    return {
      path,
      title: `About — ${SITE.name}`,
      description:
        "Creative and technical direction with an analog heart: real-time 3D, shaders, component systems and sound. Recognised by Awwwards, FWA, CSSDA and GSAP.",
      image: ogImagePath("about"),
      type: "profile",
    };
  }
  const project = path.startsWith("/project/") && findProject(path.slice(9));
  if (project) {
    return {
      path,
      title: `${project.name} — ${SITE.name}`,
      description: `${project.description.trim().replace(/\.$/, "")}. For ${project.client}${project.agency && project.agency !== "Independent" ? ` with ${project.agency}` : ""}, ${project.year}.`,
      image: ogImagePath(project.slug),
      type: "article",
      project,
    };
  }
  return { path: "/", title: SITE.title, description: SITE.description, image: SITE.image.path, type: "website" };
}

export const ROUTES = ["/", "/about", ...PROJECTS.map((project) => `/project/${project.slug}`)];
