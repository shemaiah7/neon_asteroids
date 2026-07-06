import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { rand, TAU } from "../util.js";

const NEBULA_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NEBULA_FRAGMENT = `
  uniform float uTime;
  uniform vec2 uResolution;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    vec2 center = vec2(0.5, 0.42);
    float d = distance(uv, center);
    float pulse = 0.5 + 0.5 * sin(uTime * 0.35);
    float core = smoothstep(0.72, 0.0, d) * (0.16 + pulse * 0.06);
    float violet = smoothstep(0.95, 0.25, d) * 0.07;
    vec3 col = vec3(0.02, 0.03, 0.08);
    col += vec3(0.12, 0.28, 0.55) * core;
    col += vec3(0.28, 0.12, 0.45) * violet;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeStarLayer({ count, w, h, z, size, opacity, color }) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = rand(0, w);
    positions[i * 3 + 1] = rand(0, h);
    positions[i * 3 + 2] = z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    size,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: false,
  });
  const points = new THREE.Points(geo, mat);
  points.userData.parallax = (4 - z) * 0.00004;
  points.userData.positions = positions;
  points.userData.count = count;
  points.userData.w = w;
  points.userData.h = h;
  return points;
}

export class Background3D {
  constructor({ canvas, lowQuality = false }) {
    this.canvas = canvas;
    this.lowQuality = lowQuality;
    this.enabled = false;
    this.time = 0;
    this.bounds = { w: 1, h: 1 };

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070714);

    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -20, 20);
    this.camera.position.z = 10;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !lowQuality,
        alpha: false,
        powerPreference: lowQuality ? "low-power" : "high-performance",
      });
      this.renderer.setPixelRatio(1);
      this.enabled = true;
    } catch {
      return;
    }

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.nebula = null;
    this.starLayers = [];
    this.composer = null;

    if (!lowQuality) {
      this._initPostProcessing();
    }
  }

  _initPostProcessing() {
    const renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      0.42,
      0.35,
      0.15,
    );
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloomPass);
  }

  resize(w, h) {
    if (!this.enabled) return;
    this.bounds.w = w;
    this.bounds.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.left = 0;
    this.camera.right = w;
    this.camera.top = 0;
    this.camera.bottom = h;
    this.camera.updateProjectionMatrix();

    if (this.composer) {
      this.composer.setSize(w, h);
      this.bloomPass.resolution.set(w, h);
    }

    this._rebuildScene(w, h);
  }

  _rebuildScene(w, h) {
    while (this.root.children.length) {
      const child = this.root.children[0];
      child.geometry?.dispose();
      child.material?.dispose();
      this.root.remove(child);
    }
    this.starLayers.length = 0;

    const area = w * h;
    const density = this.lowQuality ? 1 / 42000 : 1 / 28000;
    const total = Math.floor(area * density);

    this.nebula = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: new THREE.Vector2(w, h) },
        },
        vertexShader: NEBULA_VERTEX,
        fragmentShader: NEBULA_FRAGMENT,
        depthWrite: false,
      }),
    );
    this.nebula.position.set(w * 0.5, h * 0.5, -5);
    this.root.add(this.nebula);

    const layers = this.lowQuality
      ? [
          { share: 0.55, z: 1, size: 1.4, opacity: 0.35, color: 0x7ab8ff },
          { share: 0.3, z: 2, size: 1.8, opacity: 0.5, color: 0x9ad0ff },
          { share: 0.15, z: 3, size: 2.4, opacity: 0.65, color: 0xc8e8ff },
        ]
      : [
          { share: 0.5, z: 1, size: 1.2, opacity: 0.3, color: 0x6aa8ff },
          { share: 0.32, z: 2, size: 1.7, opacity: 0.48, color: 0x8cc8ff },
          { share: 0.18, z: 3, size: 2.6, opacity: 0.72, color: 0xd0f0ff },
        ];

    for (const layer of layers) {
      const count = Math.max(8, Math.floor(total * layer.share));
      const stars = makeStarLayer({ count, w, h, ...layer });
      this.starLayers.push(stars);
      this.root.add(stars);
    }
  }

  _driftStars(dt, vel) {
    for (const layer of this.starLayers) {
      const positions = layer.userData.positions;
      const count = layer.userData.count;
      const w = layer.userData.w;
      const h = layer.userData.h;
      const px = -vel.x * layer.userData.parallax * dt * 60;
      const py = -vel.y * layer.userData.parallax * dt * 60;

      for (let i = 0; i < count; i++) {
        let x = positions[i * 3] + px;
        let y = positions[i * 3 + 1] + py;
        if (x < 0) x += w;
        if (x > w) x -= w;
        if (y < 0) y += h;
        if (y > h) y -= h;
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
      }
      layer.geometry.attributes.position.needsUpdate = true;
    }
  }

  render({ w, h, trauma, vel, dt = 1 / 60 }) {
    if (!this.enabled) return;
    if (w !== this.bounds.w || h !== this.bounds.h) this.resize(w, h);

    this.time += dt;
    if (this.nebula?.material?.uniforms) {
      this.nebula.material.uniforms.uTime.value = this.time;
    }

    this._driftStars(dt, vel || { x: 0, y: 0 });

    const shake = trauma * trauma * 3;
    const angle = rand(0, TAU);
    this.root.position.set(
      Math.cos(angle) * shake,
      Math.sin(angle) * shake,
      0,
    );

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}