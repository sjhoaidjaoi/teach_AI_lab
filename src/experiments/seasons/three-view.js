/*
 * 地球公转 3D 演示场景（Three.js）。
 *
 * 【原则】太阳直射点纬度、正午太阳高度、昼长全部由 rules.js 的
 * 天文学公式计算（δ = 23.5°·sin θ 等），本文件只负责三维可视化。
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CITIES,
  KEY_POSITIONS,
  AXIAL_TILT,
  solarDeclination,
  noonSunHeight,
  dayLength,
  positionName,
} from "./rules.js";

const ORBIT_RADIUS = 6;
const EARTH_RADIUS = 0.55;

export function mountSeasonsScene(container, hooks = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#050b18");

  const camera = new THREE.PerspectiveCamera(
    50,
    container.clientWidth / container.clientHeight,
    0.1,
    300
  );
  camera.position.set(0, 8.5, 12.5);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 3.5;
  controls.maxDistance = 40;
  controls.target.set(0, 0, 0);
  controls.update();

  scene.add(new THREE.AmbientLight("#ffffff", 0.16));

  /* 平行光模拟太阳照射：光源在太阳、目标跟随地球，昼夜分界清晰 */
  const sunLight = new THREE.DirectionalLight("#ffffff", 2.6);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);

  /* 星空背景 */
  const starPositions = [];
  for (let i = 0; i < 1500; i++) {
    starPositions.push(
      (Math.random() - 0.5) * 120,
      (Math.random() - 0.5) * 80,
      (Math.random() - 0.5) * 120
    );
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(starPositions, 3)
  );
  scene.add(
    new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: "#ffffff",
        size: 0.08,
        transparent: true,
        opacity: 0.8,
      })
    )
  );

  /* ---------------- 太阳 ---------------- */

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 48, 48),
    new THREE.MeshBasicMaterial({ color: "#ffb52e" })
  );
  scene.add(sun);

  const glowTexture = createGlowTexture();
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: "#ff9f1c",
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  glow.scale.set(5.5, 5.5, 1);
  scene.add(glow);

  /* ---------------- 公转轨道 ---------------- */

  const orbitPoints = [];
  for (let i = 0; i <= 180; i++) {
    const angle = (i / 180) * Math.PI * 2;
    orbitPoints.push(
      new THREE.Vector3(
        Math.cos(angle) * ORBIT_RADIUS,
        0,
        -Math.sin(angle) * ORBIT_RADIUS
      )
    );
  }
  const orbitLine = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(orbitPoints),
    new THREE.LineBasicMaterial({ color: "#34435d", transparent: true, opacity: 0.8 })
  );
  scene.add(orbitLine);

  /* 四个节气位置标记 */
  KEY_POSITIONS.forEach((item) => {
    const rad = (item.angle * Math.PI) / 180;
    const mark = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 12),
      new THREE.MeshBasicMaterial({ color: "#64748b" })
    );
    mark.position.set(
      Math.cos(rad) * ORBIT_RADIUS,
      0,
      -Math.sin(rad) * ORBIT_RADIUS
    );
    scene.add(mark);
  });

  /* ---------------- 地球（地轴倾斜 23.5°，方向不变） ---------------- */

  const earthGroup = new THREE.Group(); // 只负责公转位置
  scene.add(earthGroup);
  sunLight.target = earthGroup; // 平行光始终从太阳射向地球

  const tiltGroup = new THREE.Group(); // 负责固定倾角
  tiltGroup.rotation.z = THREE.MathUtils.degToRad(-AXIAL_TILT);
  earthGroup.add(tiltGroup);

  const earthMaterial = new THREE.MeshStandardMaterial({
    color: "#2f80ed",
    roughness: 0.9,
    metalness: 0,
  });
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, 40, 40),
    earthMaterial
  );
  tiltGroup.add(earth);

  /* 地轴 */
  const axisMaterial = new THREE.MeshBasicMaterial({ color: "#94a3b8" });
  const axis = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, EARTH_RADIUS * 3.1, 10),
    axisMaterial
  );
  tiltGroup.add(axis);

  const northCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.18, 12),
    new THREE.MeshBasicMaterial({ color: "#e2e8f0" })
  );
  northCone.position.y = EARTH_RADIUS * 1.62;
  tiltGroup.add(northCone);

  /* 赤道环（帮助看出倾斜） */
  const equator = new THREE.Mesh(
    new THREE.TorusGeometry(EARTH_RADIUS * 1.02, 0.012, 8, 64),
    new THREE.MeshBasicMaterial({ color: "#f87171", transparent: true, opacity: 0.85 })
  );
  equator.rotation.x = Math.PI / 2;
  tiltGroup.add(equator);

  /* 太阳直射点标记（位置每帧按公式计算） */
  const subsolarMark = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 14, 14),
    new THREE.MeshBasicMaterial({ color: "#ef4444" })
  );
  scene.add(subsolarMark);

  /* 太阳到地球的直射光线 */
  const rayGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 0, 0),
  ]);
  const rayLine = new THREE.Line(
    rayGeometry,
    new THREE.LineBasicMaterial({
      color: "#fbbf24",
      transparent: true,
      opacity: 0.35,
    })
  );
  scene.add(rayLine);

  /* ---------------- 状态与面板 ---------------- */

  const state = {
    position: 90, // 轨道位置角（0 春分 / 90 夏至 / 180 秋分 / 270 冬至）
    cityId: "beijing",
    playing: false,
  };

  const positionInput = document.querySelector("#seasons-position");
  const positionNameEl = document.querySelector("#seasons-position-name");
  const citySelect = document.querySelector("#seasons-city");
  const playBtn = document.querySelector("#seasons-play");
  const statusEl = document.querySelector("#seasons-status");
  const metricsEl = document.querySelector("#seasons-metrics");

  if (citySelect) {
    citySelect.innerHTML = CITIES.map(
      (city) =>
        `<option value="${city.id}" ${city.id === state.cityId ? "selected" : ""}>${city.name}（${city.lat > 0 ? "北纬" : "南纬"} ${Math.abs(city.lat)}°）</option>`
    ).join("");
  }

  function refresh() {
    const declination = solarDeclination(state.position);
    const city = CITIES.find((item) => item.id === state.cityId) || CITIES[0];
    const sunHeight = noonSunHeight(city.lat, declination);
    const length = dayLength(city.lat, declination);

    if (positionInput) positionInput.value = String(Math.round(state.position));
    if (positionNameEl) {
      positionNameEl.textContent = positionName(state.position).replace(
        /（.*?）/,
        ""
      );
    }
    if (playBtn) {
      playBtn.textContent = state.playing ? "暂停公转" : "播放公转";
    }
    if (statusEl) {
      statusEl.textContent = `${positionName(state.position)} · 太阳直射${
        declination >= 0 ? "北" : "南"
      }纬 ${Math.abs(declination)}°`;
      statusEl.dataset.tone = "ok";
    }
    if (metricsEl) {
      const rows = [
        ["直射点纬度 δ", `${declination >= 0 ? "+" : "−"}${Math.abs(declination)}°`],
        [`${city.name} 正午太阳高度 H`, `${sunHeight}°`],
        [`${city.name} 昼长`, `${length} 小时`],
      ];
      metricsEl.innerHTML = rows
        .map(
          ([label, value]) => `
        <div class="lab-metric-row">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>`
        )
        .join("");
    }
  }

  function handlePositionInput() {
    state.playing = false;
    state.position = Number(positionInput?.value) || 0;
    hooks.completeTask?.("orbit");
    refresh();
  }
  function handleCityChange() {
    state.cityId = citySelect?.value || "beijing";
    hooks.completeTask?.("city");
    refresh();
  }
  function handlePlayToggle() {
    state.playing = !state.playing;
    if (state.playing) {
      hooks.completeTask?.("play");
    }
    refresh();
  }

  positionInput?.addEventListener("input", handlePositionInput);
  citySelect?.addEventListener("change", handleCityChange);
  playBtn?.addEventListener("click", handlePlayToggle);

  /* ---------------- 动画 ---------------- */

  const clock = new THREE.Clock();
  let animationId = 0;
  let disposed = false;
  const tmpQuat = new THREE.Quaternion();
  const northDir = new THREE.Vector3();
  const sunDir = new THREE.Vector3();
  const tangentDir = new THREE.Vector3();
  const markerDir = new THREE.Vector3();

  function animate() {
    if (disposed) return;
    animationId = requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.05);
    if (state.playing) {
      state.position = (state.position + delta * 40) % 360;
      refresh();
    }

    const rad = (state.position * Math.PI) / 180;
    earthGroup.position.set(
      Math.cos(rad) * ORBIT_RADIUS,
      0,
      -Math.sin(rad) * ORBIT_RADIUS
    );

    /* 地球自转（绕倾斜后的地轴） */
    earth.rotation.y += delta * 0.9;

    /* 太阳直射点：δ = 23.5°·sin θ（规则引擎公式） */
    const declination = solarDeclination(state.position);
    const declinationRad = (declination * Math.PI) / 180;

    northDir.set(0, 1, 0).applyQuaternion(tiltGroup.getWorldQuaternion(tmpQuat));
    sunDir.copy(earthGroup.position).multiplyScalar(-1).normalize();

    tangentDir
      .copy(sunDir)
      .addScaledVector(northDir, -sunDir.dot(northDir))
      .normalize();

    markerDir
      .copy(tangentDir)
      .multiplyScalar(Math.cos(declinationRad))
      .addScaledVector(northDir, Math.sin(declinationRad));

    subsolarMark.position
      .copy(earthGroup.position)
      .addScaledVector(markerDir, EARTH_RADIUS * 1.05);

    /* 直射光线 */
    const rayAttr = rayGeometry.getAttribute("position");
    rayAttr.setXYZ(0, 0, 0, 0);
    rayAttr.setXYZ(
      1,
      subsolarMark.position.x,
      subsolarMark.position.y,
      subsolarMark.position.z
    );
    rayAttr.needsUpdate = true;
    rayGeometry.computeBoundingSphere();

    controls.update();
    renderer.render(scene, camera);
  }

  refresh();
  animate();

  const resizeObserver = new ResizeObserver(() => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
  resizeObserver.observe(container);

  return function dispose() {
    disposed = true;
    cancelAnimationFrame(animationId);
    controls.dispose();
    resizeObserver.disconnect();

    positionInput?.removeEventListener("input", handlePositionInput);
    citySelect?.removeEventListener("change", handleCityChange);
    playBtn?.removeEventListener("click", handlePlayToggle);

    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => {
          if (material.map) material.map.dispose();
          material.dispose();
        });
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255, 190, 80, 0.9)");
  gradient.addColorStop(1, "rgba(255, 190, 80, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
