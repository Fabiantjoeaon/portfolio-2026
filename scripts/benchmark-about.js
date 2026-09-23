// Run from DevTools on /about?debug while the page is fully open:
// await (await import('/scripts/benchmark-about.js')).benchmarkAbout()
import dispatcher from "../src/shared/dispatcher.js";
import { benchmarkScene } from "./benchmark-scenes.js";

export async function benchmarkAbout(options = {}) {
  const site = dispatcher.instances.find(instance => instance.aboutScene?._batch?.geometry.instanceCount);
  const manager = site?.sceneManager;
  if (!manager || manager.isTransitioning || manager.activePrevId !== site.aboutSceneId) {
    throw new Error("Open /about?debug and wait for the page transition to finish.");
  }
  return { ...await benchmarkScene(options), glyphs: site.aboutScene._batch.geometry.instanceCount };
}
