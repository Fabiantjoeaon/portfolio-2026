// Three r186 releases a pipeline and its shader programs together with the
// last material that uses them. Content that is rebuilt from new materials
// (project galleries) would recompile identical shaders every time; an extra
// use keeps them cached. Relies on Pipelines internals: recheck on upgrades.
export function retainNewPipelines(renderer, known) {
  for (const pipeline of renderer._pipelines.caches.values()) {
    if (known.has(pipeline)) continue;
    pipeline.usedTimes++;
    if (pipeline.isComputePipeline) {
      pipeline.computeProgram.usedTimes++;
    } else {
      pipeline.vertexProgram.usedTimes++;
      pipeline.fragmentProgram.usedTimes++;
    }
  }
}
