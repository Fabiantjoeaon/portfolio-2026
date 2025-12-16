import * as THREE from "three/webgpu";
import { NodeMaterial } from "three/webgpu";
import {
  attribute,
  positionLocal,
  positionWorld,
  normalWorld,
  normalView,
  cameraPosition,
  uniform,
  vec3,
  vec4,
  float,
  mul,
  add,
  sub,
  dot,
  normalize,
  max,
  pow,
  mix,
  screenUV,
  texture,
  Fn,
} from "three/tsl";

/**
 * Creates a rounded rectangle shape
 * @param {number} width - Width of rectangle
 * @param {number} height - Height of rectangle
 * @param {number} radius - Corner radius
 * @returns {THREE.Shape}
 */
function createRoundedRectShape(width, height, radius) {
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);

  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(hw, hh - r);
  shape.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-hw + r, hh);
  shape.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-hw, -hh + r);
  shape.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);

  return shape;
}

/**
 * Creates the geometry for a single tile (rounded rectangle with depth)
 * @param {number} size - Size of the tile (width = height)
 * @param {number} radius - Corner radius
 * @param {number} depth - Extrusion depth (z-axis thickness)
 * @param {number} segments - Curve segments for corners
 * @param {Object} bevelOptions - Bevel configuration
 * @returns {THREE.ExtrudeGeometry}
 */
export function createTileGeometry(
  size = 1,
  radius = 0.1,
  depth = 0.1,
  segments = 4,
  bevelOptions = {}
) {
  const shape = createRoundedRectShape(size, size, radius);

  const extrudeSettings = {
    depth: depth,
    bevelEnabled: bevelOptions.enabled ?? true,
    bevelThickness: bevelOptions.thickness ?? depth * 0.15,
    bevelSize: bevelOptions.size ?? depth * 0.1,
    bevelOffset: bevelOptions.offset ?? 0,
    bevelSegments: bevelOptions.segments ?? 2,
    curveSegments: segments,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // Center the geometry along z-axis so it extrudes equally front/back
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Creates a TSL NodeMaterial for the grid tiles with glass refraction effect
 * Accepts instance attributes for position, offset, scale, and color
 * Samples BOTH background and scene textures for layered refraction:
 * - Background: the animated gradient plane behind the tiles
 * - Scene: the active scene content (meadow, etc.)
 * Scene is composited over background based on scene alpha.
 * @param {Object} options - Material options
 * @returns {NodeMaterial}
 */
export function createTileMaterial(options = {}) {
  const material = new NodeMaterial();

  // Uniforms for global control
  const baseColorUniform = uniform(new THREE.Color(options.color || 0xffffff));
  const opacityUniform = uniform(options.opacity ?? 1.0);

  const refractionStrength = uniform(options.refractionStrength ?? 0.02);
  const fresnelPower = uniform(options.fresnelPower ?? 3.0);
  const tintStrength = uniform(options.tintStrength ?? 0.15);

  // Color textures
  const sceneTextureNode = texture(); // Active scene (e.g., meadow)
  const screenTextureNode = texture(); // Persistent screen plane

  // Depth textures for proper compositing
  const sceneDepthNode = texture();
  const screenDepthNode = texture();

  // Instance attributes - these will be set by the InstancedMesh
  // instancePosition: base grid position (vec3)
  const instancePosition = attribute("instancePosition", "vec3");
  // instanceOffset: computed offset from compute shader (vec3)
  const instanceOffset = attribute("instanceOffset", "vec3");
  // instanceScale: computed scale from compute shader (float)
  const instanceScale = attribute("instanceScale", "float");
  // instanceColor: per-tile color tint (vec4) - for extensibility
  const instanceColor = attribute("instanceColor", "vec4");

  // Vertex position: scale local position, then add base position and offset
  const scaledPos = mul(positionLocal, instanceScale);
  const finalPos = add(add(scaledPos, instancePosition), instanceOffset);
  material.positionNode = finalPos;

  // Fragment: glass effect with refraction and fresnel
  material.colorNode = Fn(() => {
    // Get view-space normal for distortion
    const normal = normalView;

    // Calculate screen UV with normal-based distortion for refraction
    const distortion = normal.xy.mul(refractionStrength);
    const refractedUV = screenUV.add(distortion);

    // Sample screen texture (gradient plane behind tiles)
    const screenSample = screenTextureNode.sample(refractedUV);
    const screenColor = screenSample.rgb;

    // Sample scene texture (active scene content)
    const sceneSample = sceneTextureNode.sample(refractedUV);
    const sceneColor = sceneSample.rgb;

    // Get screen alpha for transparency blending
    const screenAlpha = screenSample.a;

    // Sample depth textures (lower value = closer to camera)
    const sceneDepth = sceneDepthNode.sample(refractedUV).x;
    const screenDepth = screenDepthNode.sample(refractedUV).x;

    // Depth-based compositing with alpha support:
    // 1. If screen is in front (screenDepth < sceneDepth), blend screen over scene using screen's alpha
    // 2. If scene is in front, just show scene
    const screenInFront = screenDepth.lessThan(sceneDepth).toFloat();

    // When screen is in front: blend screen over scene based on screen alpha
    // When scene is in front: just show scene (screenInFront = 0)
    const blendFactor = screenInFront.mul(screenAlpha);
    const compositedColor = mix(sceneColor, screenColor, blendFactor);

    // Calculate fresnel for edge highlights (glass rim effect)
    const viewDir = normalize(sub(cameraPosition, positionWorld));
    const NdotV = max(dot(normalWorld, viewDir), float(0.0));
    const fresnel = pow(sub(float(1.0), NdotV), fresnelPower);

    // Base tint color from instance and base color
    const tintColor = mul(vec3(baseColorUniform), instanceColor.xyz);

    // Blend composited color with tint
    const tintedScene = mix(compositedColor, tintColor, tintStrength);

    // Add fresnel rim highlight
    const rimColor = vec3(1.0, 1.0, 1.0);
    const finalColor = mix(tintedScene, rimColor, mul(fresnel, float(0.3)));

    // Final alpha from opacity uniform and instance color
    const finalAlpha = mul(opacityUniform, instanceColor.w);

    return vec4(finalColor, finalAlpha);
  })();

  // Material settings
  material.transparent = true;
  material.side = THREE.DoubleSide;
  material.depthWrite = options.depthWrite ?? true;

  // Store uniforms and texture nodes for external access
  material.uniforms = {
    baseColor: baseColorUniform,
    opacity: opacityUniform,
    refractionStrength,
    fresnelPower,
    tintStrength,
  };

  // Store texture nodes separately for updating
  material._sceneTextureNode = sceneTextureNode;
  material._screenTextureNode = screenTextureNode;
  material._sceneDepthNode = sceneDepthNode;
  material._screenDepthNode = screenDepthNode;

  return material;
}

