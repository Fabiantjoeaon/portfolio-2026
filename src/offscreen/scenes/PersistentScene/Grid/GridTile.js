import * as THREE from "three/webgpu";
import { attribute, positionLocal, mul, add } from "three/tsl";
import { MeshTransmissionNodeMaterial } from "@three-blocks/core";

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
 * Creates a glass tile material using MeshTransmissionNodeMaterial.
 * Extended with instanced positioning support for GPU-driven grid.
 *
 * @param {Object} options - Material options
 * @returns {MeshTransmissionNodeMaterial}
 */
export function createTileMaterial(options = {}) {
  // Create transmission material like the demo scene cube
  const material = new MeshTransmissionNodeMaterial({
    ditherStrength: 0,
  });
  material.name = "GridTileTransmission";

  // Instance attributes for GPU-driven grid positioning
  const instancePosition = attribute("instancePosition", "vec3");
  const instanceOffset = attribute("instanceOffset", "vec3");
  const instanceScale = attribute("instanceScale", "float");

  // Override position node for instanced rendering
  const scaledPos = mul(positionLocal, instanceScale);
  const finalPos = add(add(scaledPos, instancePosition), instanceOffset);
  material.positionNode = finalPos;

  // Material settings - BackSide because geometry faces away from camera
  material.side = THREE.BackSide;

  return material;
}
