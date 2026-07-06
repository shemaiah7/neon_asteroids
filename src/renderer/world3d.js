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

function polygonShape(pointData, radius) {
  const shape = new THREE.Shape();
  for (let i = 0; i < pointData.length; i++) {
    const { a, m } = pointData[i];
    const x = Math.cos(a) * radius * m;
    const y = Math.sin(a) * radius * m;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function polygonOutline(pointData, radius) {
  const verts = [];
  for (let i = 0; i < pointData.length; i++) {
    const { a, m } = pointData[i];
    verts.push(Math.cos(a) * radius * m, Math.sin(a) * radius * m, 0);
  }
  const first = pointData[0];
  verts.push(Math.cos(first.a) * radius * first.m, Math.sin(first.a) * radius * first.m, 0);
  return new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(verts, 3),
  );
}

function disposeObject3D(obj) {
  obj.traverse((node) => {
    node.geometry?.dispose();
    if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose());
    else node.material?.dispose();
  });
}

function createAsteroidMesh(asteroid) {
  const isExplosive = asteroid.type === "explosive";
  const fillColor = isExplosive ? 0x501408 : 0x142850;
  const strokeColor = isExplosive ? 0xff5018 : 0x96d2ff;

  const shape = polygonShape(asteroid.points, asteroid.r);
  const fill = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({
      color: fillColor,
      transparent: true,
      opacity: isExplosive ? 0.3 : 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const outline = new THREE.Line(
    polygonOutline(asteroid.points, asteroid.r),
    new THREE.LineBasicMaterial({
      color: strokeColor,
      transparent: true,
      opacity: isExplosive ? 0.8 : 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const group = new THREE.Group();
  group.add(fill);
  group.add(outline);
  group.userData.fill = fill;
  group.userData.outline = outline;
  group.userData.source = asteroid;
  return group;
}

function updateAsteroidMesh(mesh, asteroid) {
  mesh.position.set(asteroid.pos.x, asteroid.pos.y, 0.5);
  mesh.rotation.z = asteroid.rot;
}

function createShipGroup() {
  const hullShape = new THREE.Shape();
  hullShape.moveTo(18, 0);
  hullShape.lineTo(-12, -10);
  hullShape.lineTo(-8, 0);
  hullShape.lineTo(-12, 10);
  hullShape.closePath();

  const hullFill = new THREE.Mesh(
    new THREE.ShapeGeometry(hullShape),
    new THREE.MeshBasicMaterial({
      color: 0x0a1e3c,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const hullVerts = [18, 0, 0, -12, -10, 0, -8, 0, 0, -12, 10, 0, 18, 0, 0];
  const hullOutline = new THREE.Line(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(hullVerts, 3)),
    new THREE.LineBasicMaterial({
      color: 0xaaf5ff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  const thrustFill = new THREE.Mesh(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([], 3)),
    new THREE.MeshBasicMaterial({
      color: 0xd278ff,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const thrustOutline = new THREE.Line(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([], 3)),
    new THREE.LineBasicMaterial({
      color: 0xffc8ff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  thrustFill.visible = false;
  thrustOutline.visible = false;

  const shieldRing = new THREE.Mesh(
    new THREE.RingGeometry(24, 27, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffe632,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const shieldGlow = new THREE.Mesh(
    new THREE.RingGeometry(21, 30, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffdc00,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  shieldRing.visible = false;
  shieldGlow.visible = false;

  const group = new THREE.Group();
  group.add(hullFill);
  group.add(hullOutline);
  group.add(thrustFill);
  group.add(thrustOutline);
  group.add(shieldGlow);
  group.add(shieldRing);
  group.userData = {
    hullFill,
    hullOutline,
    thrustFill,
    thrustOutline,
    shieldRing,
    shieldGlow,
  };
  return group;
}

function updateThrustMeshes(thrustFill, thrustOutline) {
  const flicker = Math.random() * 10;
  const pts = [
    [-9, 0],
    [-18 - flicker, -6],
    [-14 - flicker, 0],
    [-18 - flicker, 6],
  ];

  thrustFill.geometry?.dispose();
  thrustOutline.geometry?.dispose();

  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [pts[0][0], pts[0][1], 0, pts[1][0], pts[1][1], 0, pts[2][0], pts[2][1], 0, pts[3][0], pts[3][1], 0],
      3,
    ),
  );
  fillGeo.setIndex([0, 1, 2, 0, 2, 3]);
  thrustFill.geometry = fillGeo;

  const outlineVerts = [];
  for (const [x, y] of [...pts, pts[0]]) outlineVerts.push(x, y, 0);
  thrustOutline.geometry = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(outlineVerts, 3),
  );
}

export class World3D {
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
    this.bgGroup = new THREE.Group();
    this.worldGroup = new THREE.Group();
    this.root.add(this.bgGroup);
    this.root.add(this.worldGroup);
    this.scene.add(this.root);

    this.nebula = null;
    this.starLayers = [];
    this.asteroidMeshes = [];
    this.shipGroup = createShipGroup();
    this.worldGroup.add(this.shipGroup);
    this.composer = null;

    if (!lowQuality) this._initPostProcessing();
  }

  _initPostProcessing() {
    const renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.38, 0.12);
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

    this._rebuildBackground(w, h);
  }

  _rebuildBackground(w, h) {
    while (this.bgGroup.children.length) {
      const child = this.bgGroup.children[0];
      child.geometry?.dispose();
      child.material?.dispose();
      this.bgGroup.remove(child);
    }
    this.starLayers.length = 0;

    const area = w * h;
    const density = this.lowQuality ? 1 / 42000 : 1 / 28000;
    const total = Math.floor(area * density);

    this.nebula = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: NEBULA_VERTEX,
        fragmentShader: NEBULA_FRAGMENT,
        depthWrite: false,
      }),
    );
    this.nebula.position.set(w * 0.5, h * 0.5, -5);
    this.bgGroup.add(this.nebula);

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
      this.bgGroup.add(stars);
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

  _syncAsteroids(asteroids) {
    while (this.asteroidMeshes.length > asteroids.length) {
      const mesh = this.asteroidMeshes.pop();
      this.worldGroup.remove(mesh);
      disposeObject3D(mesh);
    }

    while (this.asteroidMeshes.length < asteroids.length) {
      const mesh = createAsteroidMesh(asteroids[this.asteroidMeshes.length]);
      this.asteroidMeshes.push(mesh);
      this.worldGroup.add(mesh);
    }

    for (let i = 0; i < asteroids.length; i++) {
      const mesh = this.asteroidMeshes[i];
      const asteroid = asteroids[i];
      if (mesh.userData.source !== asteroid) {
        this.worldGroup.remove(mesh);
        disposeObject3D(mesh);
        const replacement = createAsteroidMesh(asteroid);
        this.asteroidMeshes[i] = replacement;
        this.worldGroup.add(replacement);
        updateAsteroidMesh(replacement, asteroid);
      } else {
        updateAsteroidMesh(mesh, asteroid);
      }
    }
  }

  _syncShip(ship) {
    const {
      hullFill,
      hullOutline,
      thrustFill,
      thrustOutline,
      shieldRing,
      shieldGlow,
    } = this.shipGroup.userData;

    if (ship.dead) {
      this.shipGroup.visible = false;
      return;
    }

    this.shipGroup.visible = true;
    this.shipGroup.position.set(ship.pos.x, ship.pos.y, 2);
    this.shipGroup.rotation.z = ship.angle;

    const invulnAlpha = ship.invuln > 0 ? 0.55 : 1;
    hullFill.material.opacity = 0.22 * invulnAlpha;
    hullOutline.material.opacity = 0.9 * invulnAlpha;

    const thrusting = ship.thrusting;
    thrustFill.visible = thrusting;
    thrustOutline.visible = thrusting;
    if (thrusting) updateThrustMeshes(thrustFill, thrustOutline);

    const shieldActive = ship.invuln > 1.0;
    shieldRing.visible = shieldActive;
    shieldGlow.visible = shieldActive;
    if (shieldActive) {
      const pulse = 0.6 + Math.sin(this.time * 8) * 0.4;
      const shieldR = ship.r + 12 + Math.sin(this.time * 6) * 3;
      const scale = shieldR / 25.5;
      shieldRing.scale.set(scale, scale, 1);
      shieldGlow.scale.set(scale, scale, 1);
      shieldRing.material.opacity = pulse * 0.8;
      shieldGlow.material.opacity = pulse * 0.08;
    }
  }

  render({ w, h, trauma, vel, dt = 1 / 60, ship, asteroids = [] }) {
    if (!this.enabled) return;
    if (w !== this.bounds.w || h !== this.bounds.h) this.resize(w, h);

    this.time += dt;
    if (this.nebula?.material?.uniforms) {
      this.nebula.material.uniforms.uTime.value = this.time;
    }

    this._driftStars(dt, vel || { x: 0, y: 0 });
    this._syncAsteroids(asteroids);
    if (ship) this._syncShip(ship);

    const shake = trauma * trauma * 3;
    const angle = rand(0, TAU);
    this.root.position.set(Math.cos(angle) * shake, Math.sin(angle) * shake, 0);

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}

/** @deprecated Use World3D */
export { World3D as Background3D };