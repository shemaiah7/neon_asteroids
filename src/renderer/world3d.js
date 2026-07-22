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
    float core = smoothstep(0.78, 0.0, d) * (0.38 + pulse * 0.12);
    float violet = smoothstep(1.0, 0.2, d) * 0.18;
    vec3 col = vec3(0.03, 0.04, 0.11);
    col += vec3(0.18, 0.38, 0.72) * core;
    col += vec3(0.42, 0.16, 0.62) * violet;
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

function polygonEdgeVerts(pointData, radius, frontZ, backZ, stride = 2) {
  const verts = [];
  for (let i = 0; i < pointData.length; i += stride) {
    const { a, m } = pointData[i];
    const x = Math.cos(a) * radius * m;
    const y = Math.sin(a) * radius * m;
    verts.push(x, y, frontZ, x, y, backZ);
  }
  return verts;
}

function disposeObject3D(obj) {
  obj.traverse((node) => {
    node.geometry?.dispose();
    const disposeMaterial = (material) => {
      material?.map?.dispose?.();
      material?.dispose?.();
    };
    if (Array.isArray(node.material)) node.material.forEach(disposeMaterial);
    else disposeMaterial(node.material);
  });
}

function createAsteroidMesh(asteroid) {
  const isExplosive = asteroid.type === "explosive";
  const fillColor = isExplosive ? 0x7a2410 : 0x183e76;
  const strokeColor = isExplosive ? 0xff5018 : 0x96d2ff;
  const depth = asteroid.r * (isExplosive ? 0.72 : 0.58);

  const shape = polygonShape(asteroid.points, asteroid.r);
  const rockGeometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: Math.max(1.6, asteroid.r * 0.055),
    bevelThickness: Math.max(1.4, asteroid.r * 0.05),
    bevelSegments: 1,
    curveSegments: 1,
  });
  rockGeometry.translate(0, 0, -depth * 0.5);

  const body = new THREE.Mesh(
    rockGeometry,
    new THREE.MeshStandardMaterial({
      color: fillColor,
      emissive: isExplosive ? 0x6b1805 : 0x061a32,
      emissiveIntensity: isExplosive ? 1.3 : 0.85,
      transparent: true,
      opacity: isExplosive ? 0.76 : 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      roughness: 0.42,
      metalness: 0.18,
      side: THREE.DoubleSide,
    }),
  );
  const lineMaterial = new THREE.LineBasicMaterial({
      color: strokeColor,
      transparent: true,
      opacity: isExplosive ? 1 : 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
  });
  const rearLineMaterial = lineMaterial.clone();
  rearLineMaterial.opacity = isExplosive ? 0.58 : 0.42;
  const ribMaterial = lineMaterial.clone();
  ribMaterial.opacity = isExplosive ? 0.36 : 0.25;

  const frontOutline = new THREE.Line(
    polygonOutline(asteroid.points, asteroid.r),
    lineMaterial,
  );
  frontOutline.position.z = depth * 0.5 + 0.08;

  const backOutline = new THREE.Line(
    polygonOutline(asteroid.points, asteroid.r),
    rearLineMaterial,
  );
  backOutline.position.z = -depth * 0.5 - 0.08;

  const ribs = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        polygonEdgeVerts(asteroid.points, asteroid.r, depth * 0.5, -depth * 0.5),
        3,
      ),
    ),
    ribMaterial,
  );

  const bodyGroup = new THREE.Group();
  bodyGroup.rotation.x = isExplosive ? -0.52 : -0.4;
  bodyGroup.rotation.y = rand(-0.22, 0.22);
  bodyGroup.add(body);
  bodyGroup.add(backOutline);
  bodyGroup.add(ribs);
  bodyGroup.add(frontOutline);

  const group = new THREE.Group();
  group.add(bodyGroup);
  group.userData.body = body;
  group.userData.bodyGroup = bodyGroup;
  group.userData.frontOutline = frontOutline;
  group.userData.backOutline = backOutline;
  group.userData.ribs = ribs;
  group.userData.source = asteroid;
  return group;
}

function updateAsteroidMesh(mesh, asteroid) {
  mesh.position.set(asteroid.pos.x, asteroid.pos.y, 0.5);
  mesh.rotation.z = asteroid.rot;
  const pulse = asteroid.type === "explosive" ? 0.72 + Math.sin(performance.now() * 0.01) * 0.28 : 1;
  if (mesh.userData.body?.material) {
    mesh.userData.body.material.emissiveIntensity = asteroid.type === "explosive" ? 1.2 + pulse * 0.8 : 0.85;
  }
  if (mesh.userData.frontOutline?.material && asteroid.type === "explosive") {
    mesh.userData.frontOutline.material.opacity = 0.78 + pulse * 0.22;
  }
}

function createShipGroup() {
  const hullShape = new THREE.Shape();
  hullShape.moveTo(18, 0);
  hullShape.lineTo(-12, -10);
  hullShape.lineTo(-8, 0);
  hullShape.lineTo(-12, 10);
  hullShape.closePath();

  const hullDepth = 8;
  const hullGeometry = new THREE.ExtrudeGeometry(hullShape, {
    depth: hullDepth,
    bevelEnabled: true,
    bevelSize: 1.2,
    bevelThickness: 1,
    bevelSegments: 1,
  });
  hullGeometry.translate(0, 0, -hullDepth * 0.5);

  const hullFill = new THREE.Mesh(
    hullGeometry,
    new THREE.MeshStandardMaterial({
      color: 0x0f3a68,
      emissive: 0x0adfff,
      emissiveIntensity: 0.32,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      roughness: 0.28,
      metalness: 0.55,
      side: THREE.DoubleSide,
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
  hullOutline.position.z = hullDepth * 0.5 + 0.1;

  const rearOutline = new THREE.Line(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(hullVerts, 3)),
    new THREE.LineBasicMaterial({
      color: 0x4bbcff,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  rearOutline.position.z = -hullDepth * 0.5 - 0.1;

  const ribVerts = [
    18, 0, hullDepth * 0.5, 18, 0, -hullDepth * 0.5,
    -12, -10, hullDepth * 0.5, -12, -10, -hullDepth * 0.5,
    -8, 0, hullDepth * 0.5, -8, 0, -hullDepth * 0.5,
    -12, 10, hullDepth * 0.5, -12, 10, -hullDepth * 0.5,
  ];
  const hullRibs = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(ribVerts, 3)),
    neonLineMaterial(0x58d8ff, 0.32),
  );

  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(4.2, 16, 8),
    new THREE.MeshStandardMaterial({
      color: 0xb8f8ff,
      emissive: 0x40eaff,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      roughness: 0.18,
      metalness: 0.15,
    }),
  );
  cockpit.position.set(1.5, 0, hullDepth * 0.55);

  const bodyGroup = new THREE.Group();
  bodyGroup.rotation.x = -0.45;
  bodyGroup.rotation.y = 0.22;
  bodyGroup.add(hullFill);
  bodyGroup.add(rearOutline);
  bodyGroup.add(hullRibs);
  bodyGroup.add(hullOutline);
  bodyGroup.add(cockpit);

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
  group.add(bodyGroup);
  group.add(thrustFill);
  group.add(thrustOutline);
  group.add(shieldGlow);
  group.add(shieldRing);
  group.userData = {
    hullFill,
    hullOutline,
    rearOutline,
    hullRibs,
    cockpit,
    bodyGroup,
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

function hudFillMaterial(color, opacity = 0.85) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
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
  const isOrb = bullet.type === "orb";
  const tier = Math.max(1, Math.min(3, bullet.tier || 1));
  return {
    stroke: isOrb ? 0x78ffe8 : isEnemy ? 0xff9696 : (isPierce ? 0xffc864 : 0xa0f0ff),
    fill: isOrb ? 0xecfffb : isEnemy ? 0xffc8c8 : (isPierce ? 0xffe6c8 : 0xdcfaff),
    strokeOpacity: isOrb ? 0.96 : Math.min(1, (isPierce ? 0.86 : 0.78) + tier * 0.05),
    lineWidth: isOrb ? 1.8 : (isPierce ? 1.15 : 0.75) + tier * 0.18,
    radius: bullet.r * (isOrb ? 1.15 : 1 + (tier - 1) * 0.08),
    isOrb,
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
    new THREE.CircleGeometry(1, style.isOrb ? 28 : 10),
    neonFillMaterial(style.fill, 0.95),
  );
  const orbRing = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 1, 32),
    neonFillMaterial(style.stroke, 0.86),
  );
  orbRing.visible = style.isOrb;
  const group = new THREE.Group();
  group.add(trail);
  group.add(head);
  group.add(orbRing);
  group.userData = { trail, head, orbRing, source: bullet };
  return group;
}

function updateBulletMesh(mesh, bullet) {
  const style = bulletStyle(bullet);
  mesh.userData.trail.material.color.setHex(style.stroke);
  mesh.userData.trail.material.opacity = style.strokeOpacity;
  mesh.userData.head.material.color.setHex(style.fill);
  mesh.userData.head.material.opacity = style.isOrb ? 0.78 : 0.95;
  mesh.userData.orbRing.visible = style.isOrb;
  mesh.userData.orbRing.material.color.setHex(style.stroke);
  mesh.userData.orbRing.material.opacity = style.isOrb ? 0.9 : 0;

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
  mesh.userData.orbRing.position.set(bullet.pos.x, bullet.pos.y, 1.62);
  mesh.userData.orbRing.scale.set(style.radius * 1.18, style.radius * 1.18, 1);
  mesh.userData.orbRing.rotation.z += 0.08;
}

function createParticleMesh(particle) {
  const group = new THREE.Group();
  const streak = new THREE.Line(
    new THREE.BufferGeometry(),
    neonLineMaterial(0xffffff, 0.7),
  );
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 14),
    neonFillMaterial(0xffffff, 0.55),
  );
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(1, 10),
    neonFillMaterial(0xffffff, 1),
  );
  group.add(streak);
  group.add(glow);
  group.add(core);
  group.userData = { streak, glow, core, source: particle };
  return group;
}

function updateParticleMesh(mesh, particle) {
  const t = Math.max(0, particle.life / particle.maxLife);
  const fade = Math.min(1, 1.2 * t);
  const { color, opacity } = parseRgba(particle.color);
  const coreSize = particle.size * (0.85 + 1.0 * (1 - t));
  const glowSize = coreSize * 3.5;
  const trailScale = 0.045 + 0.025 * (1 - t);

  mesh.userData.core.material.color.setHex(color);
  mesh.userData.core.material.opacity = fade * opacity;
  mesh.userData.glow.material.color.setHex(color);
  mesh.userData.glow.material.opacity = fade * opacity * 0.65;
  mesh.userData.streak.material.color.setHex(color);
  mesh.userData.streak.material.opacity = fade * opacity * 0.75;
  mesh.userData.streak.geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [0, 0, 0, -particle.vel.x * trailScale, -particle.vel.y * trailScale, 0],
      3,
    ),
  );

  mesh.position.set(particle.pos.x, particle.pos.y, 2.6);
  mesh.userData.core.scale.set(coreSize, coreSize, 1);
  mesh.userData.glow.scale.set(glowSize, glowSize, 1);
}

function createExplosionMesh(effect) {
  const group = new THREE.Group();
  const flash = new THREE.Mesh(
    new THREE.CircleGeometry(1, 36),
    neonFillMaterial(0xffffff, 0.8),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1, 2, 96),
    neonFillMaterial(0xffffff, 0.9),
  );
  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(1, 2, 96),
    neonFillMaterial(0xffffff, 0.34),
  );
  group.add(flash);
  group.add(outerRing);
  group.add(ring);
  group.userData = { flash, ring, outerRing, source: effect };
  return group;
}

function updateExplosionMesh(mesh, effect) {
  const t = clamp(effect.life / effect.maxLife, 0, 1);
  const progress = 1 - t;
  const { color, opacity } = parseRgba(effect.color);
  const radius = effect.radius + effect.speed * progress;
  const ringWidth = Math.max(4, 16 * t * effect.intensity);
  const outerWidth = Math.max(2, 7 * t * effect.intensity);

  mesh.position.set(effect.x, effect.y, 3.15);
  mesh.userData.flash.material.color.setHex(color);
  mesh.userData.flash.material.opacity = 0.42 * t * opacity;
  mesh.userData.flash.scale.setScalar(Math.max(1, radius * (0.22 + progress * 0.3)));

  mesh.userData.ring.geometry.dispose();
  mesh.userData.ring.geometry = new THREE.RingGeometry(
    Math.max(0.001, radius - ringWidth),
    radius + ringWidth,
    96,
  );
  mesh.userData.ring.material.color.setHex(color);
  mesh.userData.ring.material.opacity = 0.9 * t * opacity;

  mesh.userData.outerRing.geometry.dispose();
  mesh.userData.outerRing.geometry = new THREE.RingGeometry(
    Math.max(0.001, radius * 1.46 - outerWidth),
    radius * 1.46 + outerWidth,
    96,
  );
  mesh.userData.outerRing.material.color.setHex(color);
  mesh.userData.outerRing.material.opacity = 0.34 * t * opacity;
}

function powerUpStyle(type) {
  if (type === "bomb") return { color: 0xff4400, glow: 0xff7a20, label: "B" };
  if (type === "spread") return { color: 0xff00ff, glow: 0xff66ff, label: "S" };
  if (type === "rapid") return { color: 0x00ff88, glow: 0x66ffbb, label: "R" };
  if (type === "pierce") return { color: 0xffcc00, glow: 0xffe680, label: "P" };
  return { color: 0x00ccff, glow: 0x70e8ff, label: "O" };
}

function makePowerUpLabel(label, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 64, 64);
  ctx.font = "700 38px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowBlur = 10;
  ctx.shadowColor = color;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createPowerUpMesh(powerup) {
  const style = powerUpStyle(powerup.type);
  const group = new THREE.Group();

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(16, 32),
    neonFillMaterial(style.glow, 0.16),
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(11, 1.4, 8, 48),
    neonFillMaterial(style.color, 0.82),
  );
  const diamondVerts = [
    0, -14, 0,
    9, 0, 0,
    0, 14, 0,
    -9, 0, 0,
    0, -14, 0,
  ];
  const diamond = new THREE.Line(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(diamondVerts, 3)),
    neonLineMaterial(style.color, 0.9),
  );
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(5, 0),
    new THREE.MeshStandardMaterial({
      color: style.color,
      emissive: style.glow,
      emissiveIntensity: powerup.type === "bomb" ? 1.6 : 1.15,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      roughness: 0.24,
      metalness: 0.28,
    }),
  );
  core.position.z = 2;

  const texture = makePowerUpLabel(style.label, `#${style.color.toString(16).padStart(6, "0")}`);
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  label.scale.set(18, 18, 1);
  label.position.z = 5;

  group.add(glow);
  group.add(ring);
  group.add(diamond);
  group.add(core);
  group.add(label);
  group.userData = { glow, ring, diamond, core, label, source: powerup };
  return group;
}

function updatePowerUpMesh(mesh, powerup, time) {
  const style = powerUpStyle(powerup.type);
  const pulse = 1 + Math.sin(time * 6 + powerup.angle) * 0.16;
  const fade = clamp(powerup.life / 1.5, 0.28, 1);
  mesh.position.set(powerup.pos.x, powerup.pos.y, 2.9);
  mesh.scale.setScalar(pulse);
  mesh.userData.ring.rotation.z = time * 1.7 + powerup.angle;
  mesh.userData.diamond.rotation.z = -time * 2.1 - powerup.angle;
  mesh.userData.core.rotation.set(time * 1.2, time * 1.8, -time * 1.4);
  mesh.userData.ring.material.color.setHex(style.color);
  mesh.userData.diamond.material.color.setHex(style.color);
  mesh.userData.core.material.color.setHex(style.color);
  mesh.userData.core.material.emissive.setHex(style.glow);
  mesh.userData.glow.material.color.setHex(style.glow);
  mesh.userData.glow.material.opacity = (powerup.type === "bomb" ? 0.24 : 0.16) * fade;
  mesh.userData.ring.material.opacity = 0.82 * fade;
  mesh.userData.diamond.material.opacity = 0.9 * fade;
  mesh.userData.core.material.opacity = 0.8 * fade;
  mesh.userData.label.material.opacity = 0.96 * fade;
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
  const fillColor = isBig ? 0x7c2416 : 0x8a1830;
  const strokeColor = isBig ? 0xff6432 : 0xff3260;
  const coreColor = isBig ? 0xffdc8c : 0xffb4c8;
  const depth = r * (isBig ? 0.55 : 0.42);

  const hullGeo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: Math.max(1, r * 0.08),
    bevelThickness: Math.max(0.8, r * 0.06),
    bevelSegments: 1,
    curveSegments: 8,
  });
  hullGeo.translate(0, 0, -depth * 0.5);
  const fill = new THREE.Mesh(
    hullGeo,
    new THREE.MeshStandardMaterial({
      color: fillColor,
      emissive: isBig ? 0x4c1008 : 0x5c071c,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      roughness: 0.32,
      metalness: 0.38,
      side: THREE.DoubleSide,
    }),
  );
  const outlinePts = shape.getPoints(24).flatMap((p) => [p.x, p.y, 0]);
  outlinePts.push(outlinePts[0], outlinePts[1], outlinePts[2]);
  const outline = new THREE.Line(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(outlinePts, 3)),
    neonLineMaterial(strokeColor, 0.92),
  );
  outline.position.z = depth * 0.5 + 0.08;
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
  ring.position.z = depth * 0.62;
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(r * (isBig ? 0.26 : 0.24), 20, 10),
    new THREE.MeshStandardMaterial({
      color: coreColor,
      emissive: coreColor,
      emissiveIntensity: 1.1,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      roughness: 0.18,
      metalness: 0.2,
    }),
  );
  core.position.set(0, isBig ? -r * 0.3 : -r * 0.15, depth * 0.78);

  const lightMeshes = [];
  const lightCount = isBig ? 5 : 3;
  for (let i = 0; i < lightCount; i++) {
    const lx = -r * 0.68 + (r * 1.36 / Math.max(1, lightCount - 1)) * i;
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(isBig ? 1.6 : 1.1, 8, 6),
      neonFillMaterial(0xffd080, 0.85),
    );
    light.position.set(lx, isBig ? 0 : -r * 0.06, depth * 0.72);
    lightMeshes.push(light);
  }

  const bodyGroup = new THREE.Group();
  bodyGroup.rotation.x = isBig ? -0.58 : -0.48;
  bodyGroup.rotation.y = isBig ? 0.18 : -0.2;
  bodyGroup.add(fill);
  bodyGroup.add(outline);
  bodyGroup.add(ring);
  bodyGroup.add(core);
  for (const light of lightMeshes) bodyGroup.add(light);

  const barW = r * (isBig ? 3.0 : 2.7);
  const barH = isBig ? 7 : 5;
  const barY = r + 16;
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(barW, barH), hudFillMaterial(0x5a0710, 0.92));
  const barFill = new THREE.Mesh(new THREE.PlaneGeometry(barW, barH), hudFillMaterial(0x70ff8a, 0.96));
  const barOutline = new THREE.Line(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [-barW / 2, -barH / 2, 0, barW / 2, -barH / 2, 0, barW / 2, barH / 2, 0, -barW / 2, barH / 2, 0, -barW / 2, -barH / 2, 0],
        3,
      ),
    ),
    neonLineMaterial(0xfff0dc, 0.9),
  );
  barBg.position.set(0, barY, 0);
  barFill.position.set(0, barY, 0.02);
  barOutline.position.set(0, barY, 0.04);

  const group = new THREE.Group();
  group.add(bodyGroup);
  group.add(barBg);
  group.add(barFill);
  group.add(barOutline);
  group.userData = {
    fill,
    outline,
    ring,
    core,
    lightMeshes,
    bodyGroup,
    barBg,
    barFill,
    barOutline,
    source: enemy,
    isBig,
    barW,
    barY,
  };
  return group;
}

function updateEnemyMesh(mesh, enemy, time) {
  mesh.position.set(enemy.pos.x, enemy.pos.y, 1.4);
  const pulse = Math.sin(time * 3 + enemy.pulsePhase) * 0.5 + 0.5;
  const fastPulse = Math.sin(time * 8) * 0.5 + 0.5;
  const isFlashing = enemy.flashTimer > 0;
  const hpPct = clamp(enemy.life / Math.max(1, enemy.maxLife || 1), 0, 1);

  mesh.userData.bodyGroup.rotation.z = Math.sin(time * (mesh.userData.isBig ? 0.8 : 1.8) + enemy.pulsePhase) * 0.08;
  mesh.userData.ring.rotation.z = time * (mesh.userData.isBig ? 0.8 : 3);
  mesh.userData.fill.material.color.setHex(isFlashing ? 0xffffff : (mesh.userData.isBig ? 0x7c2416 : 0x8a1830));
  mesh.userData.fill.material.emissiveIntensity = isFlashing ? 2.2 : 0.9 + pulse * 0.35;
  mesh.userData.core.material.opacity = 0.5 + fastPulse * 0.45;
  mesh.userData.core.material.emissiveIntensity = isFlashing ? 2.5 : 1.0 + fastPulse * 0.35;
  mesh.userData.core.scale.setScalar(1 + pulse * 0.2);
  mesh.userData.outline.material.color.setHex(isFlashing ? 0xffffff : (mesh.userData.isBig ? 0xff6432 : 0xff3260));
  mesh.userData.outline.material.opacity = 0.65 + pulse * 0.3;
  for (let i = 0; i < mesh.userData.lightMeshes.length; i++) {
    const light = mesh.userData.lightMeshes[i];
    light.material.opacity = 0.45 + (Math.sin(time * 7 + i * 1.4) * 0.5 + 0.5) * 0.55;
    light.scale.setScalar(isFlashing ? 1.5 : 1);
  }

  mesh.userData.barBg.visible = enemy.maxLife > 1;
  mesh.userData.barFill.visible = enemy.maxLife > 1;
  mesh.userData.barOutline.visible = enemy.maxLife > 1;
  mesh.userData.barFill.scale.set(hpPct, 1, 1);
  mesh.userData.barFill.position.x = -mesh.userData.barW / 2 + (mesh.userData.barW * hpPct) / 2;
  mesh.userData.barFill.material.color.setHex(hpPct > 0.45 ? 0x7dff78 : 0xff783c);
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

function createSnakeSegmentMesh() {
  const group = new THREE.Group();
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 12),
    new THREE.MeshStandardMaterial({
      color: 0x17dcc5,
      emissive: 0x45ffe8,
      emissiveIntensity: 1.1,
      transparent: true,
      opacity: 0.46,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      roughness: 0.2,
      metalness: 0.24,
    }),
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.07, 6, 36),
    neonFillMaterial(0x8dfff0, 0.82),
  );
  ring.rotation.x = -0.62;
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 16, 8),
    neonFillMaterial(0xf5fffb, 0.92),
  );
  core.position.z = 0.34;
  group.add(glow);
  group.add(ring);
  group.add(core);
  group.userData = { glow, ring, core };
  return group;
}

function createSnakeBossMesh(boss) {
  const root = new THREE.Group();
  const barW = 120;
  const barH = 8;
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(barW, barH), hudFillMaterial(0x00433f, 0.9));
  const barFill = new THREE.Mesh(new THREE.PlaneGeometry(barW, barH), hudFillMaterial(0x78ffe8, 0.96));
  const barOutline = new THREE.Line(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [-barW / 2, -barH / 2, 0, barW / 2, -barH / 2, 0, barW / 2, barH / 2, 0, -barW / 2, barH / 2, 0, -barW / 2, -barH / 2, 0],
        3,
      ),
    ),
    neonLineMaterial(0xd8fffb, 0.85),
  );
  root.add(barBg);
  root.add(barFill);
  root.add(barOutline);
  root.userData = {
    source: boss,
    isSnake: true,
    segmentMeshes: [],
    barBg,
    barFill,
    barOutline,
    barW,
    barH,
  };
  return root;
}

function updateSnakeBossMesh(mesh, boss, time) {
  const segments = boss.segments || [];
  const segmentMeshes = mesh.userData.segmentMeshes;
  while (segmentMeshes.length > segments.length) {
    const child = segmentMeshes.pop();
    mesh.remove(child);
    disposeObject3D(child);
  }
  while (segmentMeshes.length < segments.length) {
    const child = createSnakeSegmentMesh();
    segmentMeshes.push(child);
    mesh.add(child);
  }

  const flashing = boss.flashTimer > 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const child = segmentMeshes[i];
    const pulse = 1 + Math.sin(time * 5 + i * 0.75) * 0.08;
    child.position.set(seg.x, seg.y, seg.head ? 2.05 : 1.8);
    child.scale.set(seg.r * pulse, seg.r * pulse, seg.r * (seg.head ? 0.58 : 0.42));
    child.userData.glow.material.color.setHex(flashing ? 0xffffff : seg.head ? 0x20ffe0 : 0x17bfae);
    child.userData.glow.material.emissive.setHex(flashing ? 0xffffff : 0x45ffe8);
    child.userData.glow.material.emissiveIntensity = flashing ? 1.9 : seg.head ? 1.35 : 0.95;
    child.userData.glow.material.opacity = seg.head ? 0.58 : 0.38;
    child.userData.ring.material.color.setHex(flashing ? 0xffffff : 0x8dfff0);
    child.userData.ring.material.opacity = seg.head ? 0.92 : 0.62;
    child.userData.ring.rotation.z = -boss.angle + time * (seg.head ? 1.6 : 0.7);
    child.userData.core.visible = seg.head;
  }

  const hpPct = clamp(boss.life / Math.max(1, boss.maxLife), 0, 1);
  const barY = boss.pos.y + boss.r + 18;
  mesh.userData.barBg.position.set(boss.pos.x, barY, 2.7);
  mesh.userData.barFill.position.set(boss.pos.x - mesh.userData.barW / 2 + (mesh.userData.barW * hpPct) / 2, barY, 2.72);
  mesh.userData.barFill.scale.set(hpPct, 1, 1);
  mesh.userData.barOutline.position.set(boss.pos.x, barY, 2.74);
}

function createBossMesh(boss) {
  if (boss.type === "snake") return createSnakeBossMesh(boss);

  const r = boss.r;
  const bodyGroup = new THREE.Group();

  const outerShape = octagonShape(r, 0);
  const bossDepth = r * 0.48;
  const outerGeo = new THREE.ExtrudeGeometry(outerShape, {
    depth: bossDepth,
    bevelEnabled: true,
    bevelSize: r * 0.045,
    bevelThickness: r * 0.035,
    bevelSegments: 1,
  });
  outerGeo.translate(0, 0, -bossDepth * 0.5);
  const outerFill = new THREE.Mesh(
    outerGeo,
    new THREE.MeshStandardMaterial({
      color: 0x3a061f,
      emissive: 0xff1178,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      roughness: 0.3,
      metalness: 0.5,
      side: THREE.DoubleSide,
    }),
  );
  const outerPts = outerShape.getPoints(8).flatMap((p) => [p.x, p.y, 0]);
  outerPts.push(outerPts[0], outerPts[1], outerPts[2]);
  const outerOutline = new THREE.Line(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(outerPts, 3)),
    neonLineMaterial(0xff3399, 1),
  );
  outerOutline.position.z = bossDepth * 0.5 + 0.1;

  const innerShape = octagonShape(r * 0.5, TAU / 16);
  const innerPts = innerShape.getPoints(8).flatMap((p) => [p.x, p.y, 0]);
  innerPts.push(innerPts[0], innerPts[1], innerPts[2]);
  const innerOutline = new THREE.Line(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(innerPts, 3)),
    neonLineMaterial(0xff3399, 0.85),
  );
  innerOutline.position.z = bossDepth * 0.55;

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(r * 0.24, 24, 12),
    new THREE.MeshStandardMaterial({
      color: 0xff77cc,
      emissive: 0xff2299,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      roughness: 0.16,
      metalness: 0.2,
    }),
  );
  core.position.z = bossDepth * 0.72;

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(r * 0.72, 1.5, 6, 64),
    neonFillMaterial(0xff55aa, 0.34),
  );
  halo.position.z = bossDepth * 0.68;

  bodyGroup.rotation.x = -0.5;
  bodyGroup.rotation.y = 0.16;
  bodyGroup.add(outerFill);
  bodyGroup.add(outerOutline);
  bodyGroup.add(innerOutline);
  bodyGroup.add(core);
  bodyGroup.add(halo);

  const barW = 128;
  const barH = 9;
  const barY = r + 15;
  const barBg = new THREE.Mesh(
    new THREE.PlaneGeometry(barW, barH),
    hudFillMaterial(0x6a0615, 0.92),
  );
  const barFill = new THREE.Mesh(
    new THREE.PlaneGeometry(barW, barH),
    hudFillMaterial(0x7dff78, 0.96),
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
    core,
    halo,
    barFill,
    source: boss,
    barW,
    barY,
  };
  return root;
}

function updateBossMesh(mesh, boss) {
  if (mesh.userData.isSnake) {
    updateSnakeBossMesh(mesh, boss, performance.now() / 1000);
    return;
  }

  mesh.position.set(boss.pos.x, boss.pos.y, 1.1);
  mesh.userData.bodyGroup.rotation.z = boss.angle;

  const isFlashing = boss.flashTimer > 0;
  const phase = boss.phase;
  const phaseColor = phase === 3 ? 0xff1144 : phase === 2 ? 0xff55aa : 0xff3399;
  const flashColor = 0xffb8e8;

  mesh.userData.outerFill.material.color.setHex(isFlashing ? 0x7a1848 : 0x3a061f);
  mesh.userData.outerFill.material.emissive.setHex(isFlashing ? flashColor : phaseColor);
  mesh.userData.outerFill.material.emissiveIntensity = isFlashing ? 1.35 : 0.7 + phase * 0.22;
  mesh.userData.outerOutline.material.color.setHex(isFlashing ? flashColor : phaseColor);
  mesh.userData.innerOutline.material.color.setHex(isFlashing ? flashColor : phaseColor);
  mesh.userData.core.material.color.setHex(isFlashing ? flashColor : phaseColor);
  mesh.userData.core.material.emissive.setHex(isFlashing ? flashColor : phaseColor);
  mesh.userData.core.material.emissiveIntensity = isFlashing ? 1.7 : 1.0 + Math.sin(performance.now() * 0.012) * 0.25;
  mesh.userData.halo.material.color.setHex(phaseColor);
  mesh.userData.halo.material.opacity = 0.24 + phase * 0.08;
  mesh.userData.halo.rotation.z = -boss.angle * 1.6;

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
    this.scene.add(new THREE.AmbientLight(0x88bfff, 0.42));
    const keyLight = new THREE.DirectionalLight(0x9ee8ff, 1.2);
    keyLight.position.set(-0.25, -0.55, 1);
    this.scene.add(keyLight);
    const warmLight = new THREE.DirectionalLight(0xff7a35, 0.8);
    warmLight.position.set(0.75, 0.35, 0.9);
    this.scene.add(warmLight);

    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -20, 20);
    this.camera.position.z = 10;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !lowQuality,
        alpha: false,
        powerPreference: lowQuality ? "low-power" : "high-performance",
      });
      const dpr = Math.min(lowQuality ? 1 : 2, window.devicePixelRatio || 1);
      this.renderer.setPixelRatio(dpr);
      this.renderer.setClearColor(0x070714, 1);
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
    this.powerUpMeshes = [];
    this.particleMeshes = [];
    this.explosionMeshes = [];
    this.bossMeshes = [];
    this.shipGroup = createShipGroup();
    this.worldGroup.add(this.shipGroup);
    this.shockwaveMesh = new THREE.Mesh(
      new THREE.RingGeometry(0, 10, 72),
      new THREE.MeshBasicMaterial({
        color: 0xff781e,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.shockwaveMesh.visible = false;
    this.worldGroup.add(this.shockwaveMesh);

    this.overlayGroup = new THREE.Group();
    this.pauseOverlayMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    this.pauseOverlayMesh.visible = false;
    this.pauseOverlayMesh.userData = { w: 0, h: 0 };
    this.overlayGroup.add(this.pauseOverlayMesh);
    this.root.add(this.overlayGroup);

    this.composer = null;

    if (!lowQuality) this._initPostProcessing();
  }

  _initPostProcessing() {
    const renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.1, 0.55, 0.0);
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
    const density = this.lowQuality ? 1 / 14000 : 1 / 8000;
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
          { share: 0.55, z: 1, size: 2.2, opacity: 0.55, color: 0x9ac8ff },
          { share: 0.3, z: 2, size: 3.0, opacity: 0.7, color: 0xb8e0ff },
          { share: 0.15, z: 3, size: 4.0, opacity: 0.85, color: 0xe8f8ff },
        ]
      : [
          { share: 0.5, z: 1, size: 2.0, opacity: 0.5, color: 0x8ac0ff },
          { share: 0.32, z: 2, size: 3.2, opacity: 0.72, color: 0xa8d8ff },
          { share: 0.18, z: 3, size: 4.8, opacity: 0.95, color: 0xf0fcff },
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

  _syncPowerUps(powerups) {
    syncEntityPool(
      this.powerUpMeshes,
      powerups,
      this.worldGroup,
      createPowerUpMesh,
      (mesh, powerup) => updatePowerUpMesh(mesh, powerup, this.time),
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

  _syncExplosions(explosions) {
    syncEntityPool(
      this.explosionMeshes,
      explosions,
      this.worldGroup,
      createExplosionMesh,
      updateExplosionMesh,
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

  _syncPauseOverlay(mode, w, h) {
    const active = mode === "paused";
    this.pauseOverlayMesh.visible = active;
    if (!active) return;

    this.pauseOverlayMesh.position.set(w * 0.5, h * 0.5, 5);
    if (this.pauseOverlayMesh.userData.w !== w || this.pauseOverlayMesh.userData.h !== h) {
      this.pauseOverlayMesh.geometry.dispose();
      this.pauseOverlayMesh.geometry = new THREE.PlaneGeometry(w, h);
      this.pauseOverlayMesh.userData.w = w;
      this.pauseOverlayMesh.userData.h = h;
    }
  }

  _syncShockwave(timer, w, h) {
    if (!this.shockwaveMesh) return;
    if (timer <= 0) {
      this.shockwaveMesh.visible = false;
      return;
    }

    this.shockwaveMesh.visible = true;
    const progress = 1 - timer;
    const radius = progress * Math.max(w, h);
    const lineWidth = 30 * timer;
    const inner = Math.max(0.001, radius - lineWidth * 0.5);
    const outer = radius + lineWidth * 0.5;

    this.shockwaveMesh.geometry.dispose();
    this.shockwaveMesh.geometry = new THREE.RingGeometry(inner, outer, 72);
    this.shockwaveMesh.position.set(w * 0.5, h * 0.5, 2.8);
    this.shockwaveMesh.material.opacity = timer;
  }

  _syncShip(ship) {
    const {
      hullFill,
      hullOutline,
      rearOutline,
      hullRibs,
      cockpit,
      bodyGroup,
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
    hullFill.material.opacity = 0.72 * invulnAlpha;
    hullFill.material.emissiveIntensity = 0.32 + (ship.thrusting ? 0.28 : 0);
    hullOutline.material.opacity = 0.9 * invulnAlpha;
    rearOutline.material.opacity = 0.42 * invulnAlpha;
    hullRibs.material.opacity = 0.32 * invulnAlpha;
    cockpit.material.opacity = 0.7 * invulnAlpha;
    cockpit.material.emissiveIntensity = 0.75 + Math.sin(this.time * 8) * 0.18;
    bodyGroup.rotation.x = -0.45 + clamp(ship.vel.y / 1800, -0.16, 0.16);
    bodyGroup.rotation.y = 0.22 + clamp(ship.vel.x / 2200, -0.1, 0.1);

    const thrusting = ship.thrusting;
    thrustFill.visible = thrusting;
    thrustOutline.visible = thrusting;
    if (thrusting) updateThrustMeshes(thrustFill, thrustOutline);

    const shieldActive = ship.invuln > 1.0 || ship.shieldActive;
    shieldRing.visible = shieldActive;
    shieldGlow.visible = shieldActive;
    if (shieldActive) {
      const pulse = 0.6 + Math.sin(this.time * 8) * 0.4;
      const shieldR = ship.r + (ship.shieldActive ? 24 : 12) + Math.sin(this.time * 6) * (ship.shieldActive ? 7 : 3);
      const scale = shieldR / 25.5;
      const shieldColor = ship.shieldActive ? 0x7ee8ff : 0xffe632;
      shieldRing.scale.set(scale, scale, 1);
      shieldGlow.scale.set(scale, scale, 1);
      shieldRing.material.color.setHex(shieldColor);
      shieldGlow.material.color.setHex(ship.shieldActive ? 0x55dfff : 0xffdc00);
      shieldRing.material.opacity = pulse * (ship.shieldActive ? 0.95 : 0.8);
      shieldGlow.material.opacity = pulse * (ship.shieldActive ? 0.16 : 0.08);
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
    powerups = [],
    particles = [],
    explosions = [],
    bosses = [],
    shockwaveTimer = 0,
    mode = "menu",
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
    this._syncPowerUps(powerups);
    this._syncParticles(particles);
    this._syncExplosions(explosions);
    this._syncBosses(bosses);
    if (ship) this._syncShip(ship);
    this._syncShockwave(shockwaveTimer, w, h);
    this._syncPauseOverlay(mode, w, h);

    const shake = trauma * trauma * 3;
    const angle = rand(0, TAU);
    this.root.position.set(Math.cos(angle) * shake, Math.sin(angle) * shake, 0);

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}

/** @deprecated Use World3D */
export { World3D as Background3D };
