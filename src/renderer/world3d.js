import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { clamp, rand, TAU } from "../util.js";

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

function parseRgba(str) {
  const m = String(str).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return { color: 0xffffff, opacity: 1 };
  return {
    color: (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]),
    opacity: m[4] !== undefined ? Number(m[4]) : 1,
  };
}

function neonLineMaterial(color, opacity = 0.85) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function neonFillMaterial(color, opacity = 0.3) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function syncEntityPool(pool, items, parent, createFn, updateFn) {
  while (pool.length > items.length) {
    const mesh = pool.pop();
    parent.remove(mesh);
    disposeObject3D(mesh);
  }
  while (pool.length < items.length) {
    const mesh = createFn(items[pool.length]);
    pool.push(mesh);
    parent.add(mesh);
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (pool[i].userData.source !== item) {
      parent.remove(pool[i]);
      disposeObject3D(pool[i]);
      const replacement = createFn(item);
      pool[i] = replacement;
      parent.add(replacement);
      updateFn(replacement, item);
    } else {
      updateFn(pool[i], item);
    }
  }
}

function bulletStyle(bullet) {
  const isEnemy = bullet.team === "enemy";
  const isPierce = bullet.type === "pierce";
  return {
    stroke: isEnemy ? 0xff9696 : (isPierce ? 0xffc864 : 0xa0f0ff),
    fill: isEnemy ? 0xffc8c8 : (isPierce ? 0xffe6c8 : 0xdcfaff),
    strokeOpacity: isPierce ? 0.95 : 0.85,
    lineWidth: isPierce ? 1.2 : 0.8,
    radius: bullet.r,
  };
}

function createBulletMesh(bullet) {
  const style = bulletStyle(bullet);
  const trail = new THREE.Line(
    new THREE.BufferGeometry(),
    neonLineMaterial(style.stroke, style.strokeOpacity),
  );
  trail.material.linewidth = style.lineWidth;
  const head = new THREE.Mesh(
    new THREE.CircleGeometry(1, 10),
    neonFillMaterial(style.fill, 0.95),
  );
  const group = new THREE.Group();
  group.add(trail);
  group.add(head);
  group.userData = { trail, head, source: bullet };
  return group;
}

function updateBulletMesh(mesh, bullet) {
  const style = bulletStyle(bullet);
  mesh.userData.trail.material.color.setHex(style.stroke);
  mesh.userData.trail.material.opacity = style.strokeOpacity;
  mesh.userData.head.material.color.setHex(style.fill);

  const verts = [];
  for (const p of bullet.trail) verts.push(p.x, p.y, 1.5);
  verts.push(bullet.pos.x, bullet.pos.y, 1.5);
  mesh.userData.trail.visible = verts.length >= 6;
  if (mesh.userData.trail.visible) {
    mesh.userData.trail.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(verts, 3),
    );
  }
  mesh.userData.head.position.set(bullet.pos.x, bullet.pos.y, 1.6);
  mesh.userData.head.scale.set(style.radius, style.radius, 1);
}

function createParticleMesh(particle) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(1, 8),
    neonFillMaterial(0xffffff, 0.9),
  );
  mesh.userData.source = particle;
  return mesh;
}

function updateParticleMesh(mesh, particle) {
  const t = Math.max(0, particle.life / particle.maxLife);
  const { color, opacity } = parseRgba(particle.color);
  mesh.material.color.setHex(color);
  mesh.material.opacity = 0.9 * t * opacity;
  const size = particle.size * (0.6 + 0.6 * (1 - t));
  mesh.position.set(particle.pos.x, particle.pos.y, 1.85);
  mesh.scale.set(size, size, 1);
}

function buildBigEnemyShape(r) {
  const shape = new THREE.Shape();
  shape.moveTo(-r, 0);
  shape.quadraticCurveTo(-r * 0.6, -r * 0.7, 0, -r * 0.75);
  shape.quadraticCurveTo(r * 0.6, -r * 0.7, r, 0);
  shape.quadraticCurveTo(r * 0.4, r * 0.45, 0, r * 0.5);
  shape.quadraticCurveTo(-r * 0.4, r * 0.45, -r, 0);
  return shape;
}

function buildSmallEnemyShape(r) {
  const shape = new THREE.Shape();
  shape.moveTo(-r * 1.1, 0);
  shape.lineTo(-r * 0.2, -r * 0.65);
  shape.lineTo(r * 0.2, -r * 0.65);
  shape.lineTo(r * 1.1, 0);
  shape.lineTo(r * 0.2, r * 0.45);
  shape.lineTo(-r * 0.2, r * 0.45);
  shape.closePath();
  return shape;
}

function createEnemyMesh(enemy) {
  const isBig = enemy.type === "big";
  const r = enemy.r;
  const shape = isBig ? buildBigEnemyShape(r) : buildSmallEnemyShape(r);
  const fillColor = isBig ? 0x5a1914 : 0x781423;
  const strokeColor = isBig ? 0xff6432 : 0xff3260;
  const coreColor = isBig ? 0xffdc8c : 0xffb4c8;

  const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), neonFillMaterial(fillColor, 0.85));
  const outlinePts = shape.getPoints(24).flatMap((p) => [p.x, p.y, 0]);
  outlinePts.push(outlinePts[0], outlinePts[1], outlinePts[2]);
  const outline = new THREE.Line(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(outlinePts, 3)),
    neonLineMaterial(strokeColor, 0.75),
  );
  const ring = new THREE.Line(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        Array.from({ length: 33 }, (_, i) => {
          const a = (i / 32) * TAU;
          const rr = r * (isBig ? 1.2 : 1.3);
          return [Math.cos(a) * rr, Math.sin(a) * rr, 0];
        }).flat(),
        3,
      ),
    ),
    neonLineMaterial(strokeColor, 0.28),
  );
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(r * 0.22, 12),
    neonFillMaterial(coreColor, 0.85),
  );
  core.position.set(0, isBig ? -r * 0.3 : -r * 0.15, 0.01);

  const group = new THREE.Group();
  group.add(fill);
  group.add(outline);
  group.add(ring);
  group.add(core);
  group.userData = { fill, outline, ring, core, source: enemy, isBig };
  return group;
}

function updateEnemyMesh(mesh, enemy, time) {
  mesh.position.set(enemy.pos.x, enemy.pos.y, 1);
  const pulse = Math.sin(time * 3 + enemy.pulsePhase) * 0.5 + 0.5;
  const fastPulse = Math.sin(time * 8) * 0.5 + 0.5;
  mesh.userData.ring.rotation.z = time * (mesh.userData.isBig ? 0.8 : 3);
  mesh.userData.core.material.opacity = 0.5 + fastPulse * 0.45;
  mesh.userData.core.scale.setScalar(1 + pulse * 0.2);
  mesh.userData.outline.material.opacity = 0.55 + pulse * 0.25;
}

function octagonShape(r, rotation = 0) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (TAU / 8) * i + rotation;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function createBossMesh(boss) {
  const r = boss.r;
  const bodyGroup = new THREE.Group();

  const outerShape = octagonShape(r, 0);
  const outerFill = new THREE.Mesh(
    new THREE.ShapeGeometry(outerShape),
    neonFillMaterial(0x1e0014, 0.8),
  );
  const outerPts = outerShape.getPoints(8).flatMap((p) => [p.x, p.y, 0]);
  outerPts.push(outerPts[0], outerPts[1], outerPts[2]);
  const outerOutline = new THREE.Line(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(outerPts, 3)),
    neonLineMaterial(0xff3399, 1),
  );

  const innerShape = octagonShape(r * 0.5, TAU / 16);
  const innerPts = innerShape.getPoints(8).flatMap((p) => [p.x, p.y, 0]);
  innerPts.push(innerPts[0], innerPts[1], innerPts[2]);
  const innerOutline = new THREE.Line(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(innerPts, 3)),
    neonLineMaterial(0xff3399, 0.85),
  );

  bodyGroup.add(outerFill);
  bodyGroup.add(outerOutline);
  bodyGroup.add(innerOutline);

  const barW = 80;
  const barH = 6;
  const barY = r + 15;
  const barBg = new THREE.Mesh(
    new THREE.PlaneGeometry(barW, barH),
    neonFillMaterial(0xff0000, 0.5),
  );
  const barFill = new THREE.Mesh(
    new THREE.PlaneGeometry(barW, barH),
    neonFillMaterial(0x00ff00, 0.8),
  );
  const barOutline = new THREE.Line(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [-barW / 2, barY - barH / 2, 0, barW / 2, barY - barH / 2, 0, barW / 2, barY + barH / 2, 0, -barW / 2, barY + barH / 2, 0, -barW / 2, barY - barH / 2, 0],
        3,
      ),
    ),
    neonLineMaterial(0xffffff, 0.5),
  );

  barBg.position.set(0, barY, 0.02);
  barFill.position.set(-barW / 2, barY, 0.03);

  const hpGroup = new THREE.Group();
  hpGroup.add(barBg);
  hpGroup.add(barFill);
  hpGroup.add(barOutline);

  const root = new THREE.Group();
  root.add(bodyGroup);
  root.add(hpGroup);
  root.userData = {
    bodyGroup,
    outerFill,
    outerOutline,
    innerOutline,
    barFill,
    source: boss,
    barW,
    barY,
  };
  return root;
}

function updateBossMesh(mesh, boss) {
  mesh.position.set(boss.pos.x, boss.pos.y, 1.1);
  mesh.userData.bodyGroup.rotation.z = boss.angle;

  const isFlashing = boss.flashTimer > 0;
  const phase = boss.phase;
  const phaseColor = phase === 3 ? 0xff1144 : phase === 2 ? 0xff55aa : 0xff3399;

  mesh.userData.outerFill.material.color.setHex(isFlashing ? 0xffffff : 0x1e0014);
  mesh.userData.outerOutline.material.color.setHex(isFlashing ? 0xffffff : phaseColor);
  mesh.userData.innerOutline.material.color.setHex(isFlashing ? 0xffffff : phaseColor);

  const hpPct = clamp(boss.life / boss.maxLife, 0, 1);
  const barW = mesh.userData.barW;
  const barY = mesh.userData.barY;
  mesh.userData.barFill.scale.set(hpPct, 1, 1);
  mesh.userData.barFill.position.set(-barW / 2 + (barW * hpPct) / 2, barY, 0.03);
  mesh.userData.barFill.material.color.setHex(phase === 3 ? 0xff3c3c : 0x00ff00);
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
    this.enemyMeshes = [];
    this.bulletMeshes = [];
    this.particleMeshes = [];
    this.bossMeshes = [];
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

  _syncEnemies(enemies) {
    syncEntityPool(
      this.enemyMeshes,
      enemies,
      this.worldGroup,
      createEnemyMesh,
      (mesh, enemy) => updateEnemyMesh(mesh, enemy, this.time),
    );
  }

  _syncBullets(bullets) {
    syncEntityPool(
      this.bulletMeshes,
      bullets,
      this.worldGroup,
      createBulletMesh,
      updateBulletMesh,
    );
  }

  _syncParticles(particles) {
    syncEntityPool(
      this.particleMeshes,
      particles,
      this.worldGroup,
      createParticleMesh,
      updateParticleMesh,
    );
  }

  _syncBosses(bosses) {
    syncEntityPool(
      this.bossMeshes,
      bosses,
      this.worldGroup,
      createBossMesh,
      updateBossMesh,
    );
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

  render({
    w,
    h,
    trauma,
    vel,
    dt = 1 / 60,
    ship,
    asteroids = [],
    bullets = [],
    enemies = [],
    particles = [],
    bosses = [],
  }) {
    if (!this.enabled) return;
    if (w !== this.bounds.w || h !== this.bounds.h) this.resize(w, h);

    this.time += dt;
    if (this.nebula?.material?.uniforms) {
      this.nebula.material.uniforms.uTime.value = this.time;
    }

    this._driftStars(dt, vel || { x: 0, y: 0 });
    this._syncAsteroids(asteroids);
    this._syncEnemies(enemies);
    this._syncBullets(bullets);
    this._syncParticles(particles);
    this._syncBosses(bosses);
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