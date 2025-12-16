import { BufferGeometry, BufferAttribute, Vector3 } from "three/webgpu";

export const fullscreenTriangle = () => {
  let geometry = new BufferGeometry();

  const vertices = new Float32Array([-1, -1, 3, -1, -1, 3]);
  // WebGPU has framebuffer origin at top-left (Y-down), so flip V coordinates
  const uvs = new Float32Array([0, 1, 2, 1, 0, -1]);

  geometry.setAttribute("position", new BufferAttribute(vertices, 2));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));

  // HINT: Fixes bounding sphere error because for some reason
  // the latest version of THREE does not like position attributes
  // with a count of 2 (center.z and radius are NaN in this case)
  geometry.boundingSphere = {
    center: new Vector3(1, 1, 0),
    radius: 0,
  };

  return geometry;
};

export const fsTriangle = fullscreenTriangle();
