import {
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshStandardNodeMaterial,
  NearestFilter,
  NoColorSpace,
  Vector3,
  Vector4,
} from "three/webgpu";
import {
  Fn,
  If,
  attribute,
  cameraViewMatrix,
  cos,
  exp,
  faceDirection,
  float,
  floor,
  fract,
  instancedBufferAttribute,
  mix,
  modelNormalMatrix,
  positionLocal,
  sin,
  smoothstep,
  step,
  texture,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import { PointerRaycaster } from "../../input/PointerRaycaster.js";
import { PointerStroke } from "../../input/PointerStroke.js";
import { audio } from "@/audio/audio.js";

const MAX_ROSES = 64;
const ROSE_COLOR_COUNT = 5;
const FRAME_COUNT = 170;
const TEXTURE_HEIGHT = 340;
const IMPACT_COUNT = 8;
const tempHit = new Vector3();

function makeInstancedGeometry(source) {
  const geometry = new InstancedBufferGeometry();
  geometry.index = source.index;
  for (const [name, value] of Object.entries(source.attributes))
    geometry.setAttribute(name, value);
  geometry.instanceCount = 0;
  return geometry;
}

function createRoseMaterial({ vatTexture, colorTexture, remap, attributes, controls, screenLight }) {
  const material = new MeshStandardNodeMaterial({ side: DoubleSide });
  const vat = texture(vatTexture);
  const palette = texture(colorTexture);
  const lookup = attribute("uv1", "vec2").x;
  const birth = instancedBufferAttribute(attributes.birth);
  const offset = instancedBufferAttribute(attributes.offset);
  const variation = instancedBufferAttribute(attributes.variation);
  const colorChoice = instancedBufferAttribute(attributes.colorChoice);
  const age = controls.clock.sub(birth).max(0);
  const collapse = smoothstep(
    controls.lifetime,
    controls.lifetime.add(controls.degrowDuration),
    age,
  );
  // Grow once, hold, then continue into OpenVAT's collapsed loop seam.
  const growthFrame = age.mul(controls.vatFps).min(controls.vatEndFrame);
  const collapseFrame = mix(controls.vatEndFrame, float(FRAME_COUNT - 2), collapse);
  const animationFrame = mix(growthFrame, collapseFrame, step(controls.lifetime, age));
  const frame = floor(animationFrame);
  const blend = fract(animationFrame);
  // OpenVAT stores positions in the first half reached from VAT_UV.y and
  // object-space normals in the corresponding row half a texture lower.
  const frameV = float(0.9985294).sub(frame.div(TEXTURE_HEIGHT));
  const nextV = float(0.9985294).sub(frame.add(1).min(FRAME_COUNT - 1).div(TEXTURE_HEIGHT));
  const positionSample = mix(
    vat.sample(vec2(lookup, frameV)).rgb,
    vat.sample(vec2(lookup, nextV)).rgb,
    blend,
  );
  const normalSample = mix(
    vat.sample(vec2(lookup, frameV.sub(0.5))).rgb,
    vat.sample(vec2(lookup, nextV.sub(0.5))).rgb,
    blend,
  );
  const decoded = mix(uniform(new Vector3(...remap.Min)), uniform(new Vector3(...remap.Max)), positionSample);
  // Blender Z-up to Three.js Y-up. The tiny edited base mesh is retained so
  // the formerly collapsed FBX topology remains rasterizable.
  const sourcePosition = positionLocal.add(vec3(decoded.x, decoded.z, decoded.y.negate()));
  const angle = variation.x;
  const scale = variation.y;
  const leanX = variation.z;
  const leanZ = variation.w;
  const leanedX = sourcePosition.x.mul(cos(leanZ)).sub(sourcePosition.y.mul(sin(leanZ)));
  const leanedY = sourcePosition.x.mul(sin(leanZ)).add(sourcePosition.y.mul(cos(leanZ)));
  const leanedPosition = vec3(
    leanedX,
    leanedY.mul(cos(leanX)).sub(sourcePosition.z.mul(sin(leanX))),
    leanedY.mul(sin(leanX)).add(sourcePosition.z.mul(cos(leanX))),
  );
  const rotatedPosition = vec3(
    leanedPosition.x.mul(cos(angle)).sub(leanedPosition.z.mul(sin(angle))),
    leanedPosition.y,
    leanedPosition.x.mul(sin(angle)).add(leanedPosition.z.mul(cos(angle))),
  ).mul(scale);
  const emergence = smoothstep(0, controls.growDuration, age);
  const verticalOffset = emergence.oneMinus().add(collapse).mul(controls.emergenceDepth);
  material.positionNode = rotatedPosition
    .add(vec3(offset.x, controls.waterY.sub(verticalOffset), offset.y));

  const sourceNormal = vec3(
    normalSample.x.mul(2).sub(1),
    normalSample.z.mul(2).sub(1),
    normalSample.y.mul(2).sub(1).negate(),
  ).normalize();
  const leanedNormalX = sourceNormal.x.mul(cos(leanZ)).sub(sourceNormal.y.mul(sin(leanZ)));
  const leanedNormalY = sourceNormal.x.mul(sin(leanZ)).add(sourceNormal.y.mul(cos(leanZ)));
  const leanedNormal = vec3(
    leanedNormalX,
    leanedNormalY.mul(cos(leanX)).sub(sourceNormal.z.mul(sin(leanX))),
    leanedNormalY.mul(sin(leanX)).add(sourceNormal.z.mul(cos(leanX))),
  );
  const localNormal = vec3(
    leanedNormal.x.mul(cos(angle)).sub(leanedNormal.z.mul(sin(angle))),
    leanedNormal.y,
    leanedNormal.x.mul(sin(angle)).add(leanedNormal.z.mul(cos(angle))),
  ).normalize();
  const worldNormal = modelNormalMatrix.mul(localNormal).normalize();
  material.normalNode = worldNormal.transformDirection(cameraViewMatrix);
  let roseColor = controls.roseColor1;
  for (let index = 1; index < ROSE_COLOR_COUNT; index++) {
    roseColor = mix(
      roseColor,
      controls[`roseColor${index + 1}`],
      step(index - 0.5, colorChoice),
    );
  }
  const atlasColor = palette.sample(uv()).rgb;
  // The runtime mesh assigns petals to UV (0.616, 0.116); stems, leaves,
  // and sepals occupy regions above V=0.7. UVs remain stable throughout VAT
  // growth/collapse, unlike animated height (which also crosses the stem).
  const brightness = atlasColor.r.max(atlasColor.g).max(atlasColor.b);
  const detail = brightness.mul(0.35).add(0.65);
  const stemColor = vec3(0.12, 0.46, 0.2).mul(detail);
  const petalColor = roseColor.mul(detail);
  const bloomMask = step(0.25, uv().y).oneMinus();
  const baseColor = mix(stemColor, petalColor, bloomMask);
  material.colorNode = baseColor;
  material.roughnessNode = controls.roughness;
  // The custom area-light contribution also needs the back-face correction
  // that the standard material applies to these double-sided petals.
  const screenLightNormal = mix(worldNormal.mul(faceDirection), vec3(0, 1, 0), controls.lightSmoothing).normalize();
  screenLight?.applyTo(material, {
    baseColor,
    roughness: controls.roughness.max(controls.lightSoftness),
    normalNode: screenLightNormal,
    intensityScale: controls.lightStrength,
  });
  return material;
}

/** Mouse-projected, fixed-pool VAT roses and water-shader impact events. */
export class RoseTrail extends Group {
  constructor({ asset, vatTexture, colorTexture, remapInfo, settings, screenLight }) {
    super();
    this.name = "VAT rose trail";
    this.settings = settings;
    this.screenLight = screenLight;
    this.projector = new PointerRaycaster();
    this.camera = null;
    this.stroke = new PointerStroke({ speedScale: 40 });
    this.interactionEnabled = true;
    this._onStrokeSample = (point, direction) => {
      if (this._spawn(point, this._time, direction.x, direction.z))
        audio.trigger("meadow", { type: "flowerSpawn", intensity: this.stroke.intensity });
    };
    this._activeCount = 0;

    const source = asset.scene.getObjectByProperty("isMesh", true)?.geometry;
    if (!source?.attributes.uv1) throw new Error("Rose VAT runtime mesh is missing TEXCOORD_1.");
    vatTexture.minFilter = vatTexture.magFilter = NearestFilter;
    vatTexture.wrapS = vatTexture.wrapT = ClampToEdgeWrapping;
    vatTexture.colorSpace = NoColorSpace;
    vatTexture.flipY = false;
    vatTexture.needsUpdate = true;
    colorTexture.minFilter = colorTexture.magFilter = NearestFilter;
    colorTexture.needsUpdate = true;

    const offsets = new Float32Array(MAX_ROSES * 2);
    const births = new Float32Array(MAX_ROSES);
    const variations = new Float32Array(MAX_ROSES * 4);
    const colorChoices = new Float32Array(MAX_ROSES);
    for (let index = 0; index < MAX_ROSES; index++) {
      offsets[index * 2] = 100000;
      offsets[index * 2 + 1] = 100000;
      births[index] = -10000;
      variations[index * 4 + 1] = 1;
    }
    this.attributes = {
      offset: new InstancedBufferAttribute(offsets, 2).setUsage(DynamicDrawUsage),
      birth: new InstancedBufferAttribute(births, 1).setUsage(DynamicDrawUsage),
      variation: new InstancedBufferAttribute(variations, 4).setUsage(DynamicDrawUsage),
      colorChoice: new InstancedBufferAttribute(colorChoices, 1).setUsage(DynamicDrawUsage),
    };
    this.controls = {
      clock: uniform(0),
      waterY: uniform(settings.waterY),
      vatFps: uniform(settings.roseVatFps),
      vatEndFrame: uniform(settings.roseVatEndFrame),
      growDuration: uniform(settings.roseGrowDuration),
      lifetime: uniform(settings.roseLifetime),
      degrowDuration: uniform(settings.roseDegrowDuration),
      emergenceDepth: uniform(settings.roseEmergenceDepth),
      roughness: uniform(settings.roseRoughness),
      lightStrength: uniform(settings.roseLightStrength),
      lightSmoothing: uniform(settings.roseLightSmoothing),
      lightSoftness: uniform(settings.roseLightSoftness),
      roseColor1: uniform(new Color(settings.roseColor1)),
      roseColor2: uniform(new Color(settings.roseColor2)),
      roseColor3: uniform(new Color(settings.roseColor3)),
      roseColor4: uniform(new Color(settings.roseColor4)),
      roseColor5: uniform(new Color(settings.roseColor5)),
      rippleRadius: uniform(settings.roseRippleRadius),
      rippleLifetime: uniform(settings.roseRippleLifetime),
      rippleStrength: uniform(settings.roseRippleStrength),
      rippleFoam: uniform(settings.roseRippleFoam),
      rippleDelay: uniform(settings.roseRippleDelay),
    };
    this.impactEvents = Array.from(
      { length: IMPACT_COUNT },
      () => new Vector4(100000, 100000, -10000, 1),
    );
    this.impactEventNode = uniformArray(this.impactEvents, "vec4");
    this._impactCursor = 0;
    const geometry = makeInstancedGeometry(source);
    geometry.setAttribute("roseOffset", this.attributes.offset);
    geometry.setAttribute("roseBirth", this.attributes.birth);
    geometry.setAttribute("roseVariation", this.attributes.variation);
    geometry.setAttribute("roseColorChoice", this.attributes.colorChoice);
    const remap = remapInfo["os-remap"];
    const material = createRoseMaterial({
      vatTexture, colorTexture, remap, attributes: this.attributes,
      controls: this.controls, screenLight,
    });
    this.roses = new Mesh(geometry, material);
    this.roses.name = "Animated VAT roses";
    this.roses.frustumCulled = false;
    this.add(this.roses);
  }

  configure(settings) {
    this.settings = settings;
    this.controls.waterY.value = settings.waterY;
  }

  setCamera(camera) { this.camera = camera; }

  _insideExpandedRect(x, z, minX, maxX, minZ, maxZ, radius) {
    const dx = Math.max(minX - x, 0, x - maxX);
    const dz = Math.max(minZ - z, 0, z - maxZ);
    return dx * dx + dz * dz < radius * radius;
  }

  _isExcluded(x, z) {
    const p = this.settings;
    const wallRadius = p.roseWallExclusionRadius;
    if (this._insideExpandedRect(
      x,
      z,
      p.wallX - p.wallWidth * 0.5,
      p.wallX + p.wallWidth * 0.5,
      p.wallZ - p.wallDepth * 0.5,
      p.wallZ + p.wallDepth * 0.5,
      wallRadius,
    )) return true;

    const corners = this.screenLight?.corners;
    if (!corners) return false;
    const values = [corners.p0.value, corners.p1.value, corners.p2.value, corners.p3.value];
    const minX = Math.min(...values.map((value) => value.x));
    const maxX = Math.max(...values.map((value) => value.x));
    const minZ = Math.min(...values.map((value) => value.z));
    const maxZ = Math.max(...values.map((value) => value.z));
    return this._insideExpandedRect(
      x,
      z,
      minX,
      maxX,
      minZ,
      maxZ,
      p.roseScreenExclusionRadius,
    );
  }

  _availableSlot(time) {
    this._retireExpired(time);
    if (this._activeCount < MAX_ROSES) return this._activeCount;

    // Keep the trail responsive at capacity. Recycle the oldest live rose;
    // its new birth time restarts VAT growth and the matching water impact.
    const births = this.attributes.birth.array;
    let oldest = 0;
    for (let index = 1; index < this._activeCount; index++) {
      if (births[index] < births[oldest]) oldest = index;
    }
    return oldest;
  }

  _retireExpired(time) {
    const births = this.attributes.birth.array;
    const duration = this.controls.lifetime.value + this.controls.degrowDuration.value;
    let count = 0;
    for (let index = 0; index < this._activeCount; index++) {
      // Retain every growth/hold/degrowth frame. Only fully collapsed roses
      // leave the draw; keep survivors dense without changing their identity.
      if (time - births[index] < duration) {
        if (count !== index) {
          for (const attribute of Object.values(this.attributes)) {
            const size = attribute.itemSize;
            attribute.array.copyWithin(count * size, index * size, (index + 1) * size);
          }
        }
        count++;
      }
    }
    if (count === this._activeCount) return;
    this._activeCount = count;
    this.roses.geometry.instanceCount = count;
    for (const attribute of Object.values(this.attributes)) attribute.needsUpdate = true;
  }

  _spawn(point, time, directionX = 0, directionZ = 0) {
    const scaleRange = this.settings.roseScaleMax - this.settings.roseScaleMin;
    const scatter = this.settings.roseScatter;
    const side = (Math.random() * 2 - 1) * scatter;
    const forward = (Math.random() * 2 - 1) * scatter * 0.35;
    let length = Math.hypot(directionX, directionZ);
    if (length < 1e-5) {
      const angle = Math.random() * Math.PI * 2;
      directionX = Math.cos(angle);
      directionZ = Math.sin(angle);
      length = 1;
    }
    directionX /= length;
    directionZ /= length;
    const spawnX = point.x + directionX * forward - directionZ * side;
    const spawnZ = point.z + directionZ * forward + directionX * side;
    if (this._isExcluded(spawnX, spawnZ)) return false;
    const index = this._availableSlot(time);
    if (index < 0) return false;
    const scale = this.settings.roseScaleMin + Math.random() * scaleRange;
    const maxLean = this.settings.roseLeanMax * Math.PI / 180;
    this.attributes.offset.setXY(index, spawnX, spawnZ);
    this.attributes.birth.setX(index, time);
    this.attributes.colorChoice.setX(
      index,
      Math.floor(Math.random() * ROSE_COLOR_COUNT),
    );
    this.attributes.variation.setXYZW(
      index,
      Math.random() * Math.PI * 2,
      scale,
      (Math.random() * 2 - 1) * maxLean,
      (Math.random() * 2 - 1) * maxLean,
    );
    for (const value of Object.values(this.attributes)) value.needsUpdate = true;
    const impact = this.impactEvents[this._impactCursor++ % IMPACT_COUNT];
    const impactTime = time + this.controls.growDuration.value * this.controls.rippleDelay.value;
    impact.set(spawnX, spawnZ, impactTime, 0.85 + Math.random() * 0.3);
    this._activeCount = Math.max(this._activeCount, index + 1);
    this.roses.geometry.instanceCount = this._activeCount;
    return true;
  }

  /** Recent emergence events, rendered as bounded analytic water ripples. */
  ripples(worldXZ) {
    const u = this.controls;
    return Fn(() => {
      const result = vec3(0).toVar();
      If(u.rippleStrength.greaterThan(0), () => {
      for (let index = 0; index < IMPACT_COUNT; index++) {
        const event = this.impactEventNode.element(index);
        const age = u.clock.sub(event.z);
        If(age.greaterThanEqual(0).and(age.lessThan(u.rippleLifetime)), () => {
          const progress = age.div(u.rippleLifetime);
          const offset = worldXZ.sub(event.xy);
          const distance = offset.length().max(0.001);
          const radius = progress.mul(u.rippleRadius).mul(event.w);
          const wave = distance.sub(radius);
          const packet = exp(wave.div(0.16).pow(2).negate())
            .mul(progress.oneMinus().pow(2)).mul(smoothstep(0, 0.05, age));
          const slope = cos(wave.mul(28)).mul(packet).mul(u.rippleStrength);
          const impact = exp(distance.mul(distance).mul(-36)).mul(exp(age.mul(-14)));
          result.addAssign(vec3(
            offset.div(distance).mul(slope),
            impact.add(packet.mul(0.16)).mul(u.rippleFoam),
          ));
        });
      }
      });
      return result;
    })();
  }

  update(timeMs) {
    const time = timeMs * 0.001;
    const delta = time - (this._lastTime ?? time);
    this._lastTime = time;
    this.controls.clock.value = time;
    this._retireExpired(time);
    if (!this.interactionEnabled) {
      this.projector.consumeMovement();
      this.stroke.end();
      return;
    }
    if (!this.camera || !this.projector.consumeMovement()) return;
    let hit = this.projector.intersectHorizontal(this.camera, this.settings.waterY, tempHit);
    const halfSize = this.settings.waterSize * 0.5;
    if (hit && (Math.abs(hit.x) > halfSize || Math.abs(hit.z) > halfSize)) hit = null;
    const density = Math.max(this.settings.roseDensity, 0);
    this._time = time;
    this.stroke.update(hit, delta, density > 0 ? 1 / density : 0, this._onStrokeSample);
  }

  setInteractionEnabled(enabled) {
    if (this.interactionEnabled === enabled) return;
    this.interactionEnabled = enabled;
    if (!enabled) this.stroke.end();
    this.projector.consumeMovement();
  }

  dispose() {
    this.roses.geometry.dispose();
    this.roses.material.dispose();
    this.clear();
  }
}
