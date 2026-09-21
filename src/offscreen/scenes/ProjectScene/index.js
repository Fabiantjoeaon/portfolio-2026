import SkySphereScene from "../SkySphereScene.js";
import { params } from "@/offscreen/params";

/**
 * Destination scene when a project tile is clicked (routes to
 * /project/[slug]). Not part of the auto-cycling sequence — the
 * TransitionManager pins it until the project is closed.
 *
 * The shared SkySphereScene backdrop acts as a skybox; the persistent
 * screen (project hero video) floats in front.
 */
export default class ProjectScene extends SkySphereScene {
  constructor(config = {}) {
    super(config, { name: "ProjectScene", paramGroup: params.ProjectScene });
  }
}
