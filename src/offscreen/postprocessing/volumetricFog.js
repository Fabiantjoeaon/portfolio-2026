import {
  Fn,
  float,
  vec2,
  vec3,
  vec4,
  texture,
  uniform,
  mix,
  exp,
  clamp,
  abs,
  normalize,
  length,
  time,
  select,
  mat2,
} from "three/tsl";
import * as THREE from "three/webgpu";

/**
 * Volumetric fog post-processing effect using exponential height fog.
 * Based on analytical fog formula with 2D noise texture FBM for organic patterns.
 * Much more efficient than raymarching - single pass computation.
 *
 * @param {Node} colorNode - Input color from previous post-processing stage
 * @param {Object} context - Post-processing context
 * @param {Object} fogConfig - Fog configuration object
 * @returns {Node} - Modified color with fog applied
 */
export function volumetricFog(colorNode, context, fogConfig = {}) {
  const {
    uvNode,
    prevDepth,
    nextDepth,
    mixNode,
    cameraNear,
    cameraFar,
    cameraProjectionMatrixInverse,
    cameraMatrixWorld,
  } = context;

  const {
    noiseTexture,
    fogColor = new THREE.Color(0.9, 0.92, 0.95),
    fogColor2 = new THREE.Color(0.85, 0.88, 0.92),
    fogDensity = 0.015,
    fogAlpha = 1.0,
    fogSpeed = 0.02,
    frequency = 0.025,
    heightFactor = 0.0025,
    depthInfluence = 0.7,
    fogMinY = -9.0, // Fog starts at this Y level (GROUND_Y)
  } = fogConfig;

  if (!noiseTexture) {
    return colorNode;
  }

  // Create uniforms
  const uFogColor = uniform(fogColor);
  const uFogColor2 = uniform(fogColor2);
  const uFogDensity = uniform(fogDensity);
  const uFogAlpha = uniform(fogAlpha);
  const uFogSpeed = uniform(fogSpeed);
  const uFrequency = uniform(frequency);
  const uHeightFactor = uniform(heightFactor);
  const uDepthInfluence = uniform(depthInfluence);
  const uFogMinY = uniform(fogMinY);

  // Build the fog shader
  const fogShader = Fn(() => {
    const uv = uvNode;

    // Sample depth from buffer
    const prevDepthSample = texture(prevDepth, uv).x;
    const sceneDepth = nextDepth
      ? mix(prevDepthSample, texture(nextDepth, uv).x, mixNode)
      : prevDepthSample;

    // Linearize depth for distance calculation
    const near = cameraNear;
    const far = cameraFar;
    // Standard perspective depth linearization
    const linearDepth = near
      .mul(far)
      .div(far.sub(sceneDepth.mul(far.sub(near))));

    // Reconstruct world position using ray-based approach
    // 1. Get NDC coordinates
    const ndcX = uv.x.mul(2.0).sub(1.0);
    const ndcY = uv.y.mul(2.0).sub(1.0);

    // 2. Create a clip-space position at the far plane for ray direction
    const clipPos = vec4(ndcX, ndcY, float(1.0), float(1.0));

    // 3. Transform to view space to get ray direction
    const viewPos4 = cameraProjectionMatrixInverse.mul(clipPos);
    const viewRayDir = viewPos4.xyz.div(viewPos4.w).normalize();

    // 4. Transform ray direction to world space (w=0 for direction)
    const worldRayDir = cameraMatrixWorld
      .mul(vec4(viewRayDir, 0.0))
      .xyz.normalize();

    // 5. Camera position in world space
    const camPos = cameraMatrixWorld.mul(vec4(0, 0, 0, 1)).xyz;

    // 6. World position = camera + ray * depth
    // But linearDepth is along view Z, we need distance along the ray
    // viewRayDir.z gives us the cosine of the angle, so:
    // actualDistance = linearDepth / abs(viewRayDir.z)
    const rayDistance = linearDepth.div(abs(viewRayDir.z).max(0.001));
    const worldPos = camPos.add(worldRayDir.mul(rayDistance));

    // Fog origin (camera position)
    const fogOrigin = camPos;
    const fogDirection = normalize(worldPos.sub(fogOrigin));
    const fogDepth = length(worldPos.sub(fogOrigin)).toVar();

    // Sample noise using 2D texture with FBM
    // Rotation matrix for FBM domain warping
    const rot = mat2(0.6, 0.8, -0.8, 0.6);

    // Noise sampling function using world position XZ
    const sampleNoise = Fn(([p]) => {
      return texture(noiseTexture, p.mul(0.065)).x;
    });

    const sampleNoise3 = Fn(([p]) => {
      return texture(noiseTexture, p.mul(0.01)).xyz;
    });

    // Cheap FBM using 2D noise texture
    const cheapFbm = Fn(([inputP]) => {
      const p = inputP.toVar();
      const r = float(0.0).toVar();

      r.addAssign(sampleNoise(p).mul(0.5));
      p.assign(rot.mul(p).mul(1.99));
      r.addAssign(sampleNoise(p).mul(0.25));
      p.assign(rot.mul(p).mul(2.01));
      r.addAssign(sampleNoise(p).mul(0.125));
      p.assign(rot.mul(p).mul(2.04));
      r.addAssign(sampleNoise(p).mul(0.0625));

      return r.div(0.9375);
    });

    // 3-channel FBM for domain warping
    const pFbm = Fn(([inputP]) => {
      const p = inputP.toVar();
      const r = vec3(0.0).toVar();

      r.addAssign(sampleNoise3(p).mul(0.5));
      p.assign(rot.mul(p).mul(1.99));
      r.addAssign(sampleNoise3(p).mul(0.25));
      p.assign(rot.mul(p).mul(2.01));
      r.addAssign(sampleNoise3(p).mul(0.125));
      p.assign(rot.mul(p).mul(2.04));
      r.addAssign(sampleNoise3(p).mul(0.0625));

      return r.div(0.9375);
    });

    // 3D FBM using world position
    const fbm3D = Fn(([pos]) => {
      const st = pos.xz.mul(pos.y.add(1.0)); // Avoid multiply by zero
      const pf = pFbm(st.mul(10.0));
      const v = float(0.2).div(
        cheapFbm(pf.xy.add(vec2(1.0, -1.0).mul(0.05).mul(pos.y)))
      );
      const w = float(0.4).div(cheapFbm(pf.zx));
      const col = vec3(v.mul(w).mul(w), w.mul(v), w.mul(v));
      const normalizedCol = col.div(col.add(1.0));
      return length(normalizedCol);
    });

    // Time-based animation offset
    const timeOffset = time.mul(uFogSpeed);

    // Sample noise at world position with animation
    const noiseSampleCoord = worldPos.mul(uFrequency);
    const animatedCoord = vec3(
      noiseSampleCoord.x.add(timeOffset),
      noiseSampleCoord.y,
      noiseSampleCoord.z.add(timeOffset.mul(0.7))
    );

    const noiseSample = fbm3D(animatedCoord);

    // Apply depth influence - noise affects fog more at closer distances
    const depthBlend = clamp(
      fogDepth.sub(50.0).div(50.0),
      float(1.0).sub(uDepthInfluence),
      float(1.0)
    );
    const modulatedDepth = fogDepth.mul(
      mix(noiseSample, float(1.0), depthBlend)
    );

    // Apply noise to depth squared for more organic falloff
    const noisyDepth = modulatedDepth.mul(modulatedDepth).mul(noiseSample);

    // Only apply fog above the minimum Y level (water surface)
    const heightAboveWater = worldPos.y.sub(uFogMinY);
    const aboveWaterMask = select(
      heightAboveWater.greaterThan(0.0),
      float(1.0),
      float(0.0)
    );

    // Exponential height fog formula
    // fogFactor = heightFactor * exp(-fogOrigin.y * density) * (1 - exp(-depth * dir.y * density)) / dir.y
    const fogDirY = fogDirection.y;
    const originY = fogOrigin.y.sub(uFogMinY); // Relative to fog min

    // Avoid division by zero for horizontal rays
    const safeFogDirY = select(
      abs(fogDirY).lessThan(0.001),
      float(0.001),
      fogDirY
    );

    const expTerm1 = exp(originY.negate().mul(uFogDensity));
    const expTerm2 = float(1.0).sub(
      exp(noisyDepth.negate().mul(safeFogDirY).mul(uFogDensity))
    );
    const fogFactor = uHeightFactor
      .mul(expTerm1)
      .mul(expTerm2)
      .div(safeFogDirY);

    // Clamp fog factor and apply above-water mask
    const clampedFog = clamp(
      fogFactor.mul(aboveWaterMask),
      float(0.0),
      uFogAlpha
    );

    // Blend between two fog colors based on noise
    const finalFogColor = mix(uFogColor, uFogColor2, noiseSample);

    // Apply fog to scene color
    const sceneColor = colorNode.rgb;
    const foggedColor = mix(sceneColor, finalFogColor, clampedFog);

    return vec4(foggedColor, colorNode.a);
  });

  return fogShader();
}

/**
 * Creates a pre-configured volumetric fog effect for use in postprocessingChain.
 *
 * @param {Object} config - Fog configuration
 * @returns {Function} - Post-processing function (colorNode, context) => Node
 */
export function createVolumetricFog(config = {}) {
  return (colorNode, context) => volumetricFog(colorNode, context, config);
}

