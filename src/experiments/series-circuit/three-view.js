/*
 * 串联电路 3D 演示场景（Three.js）。
 *
 * 【原则】电流、电压、亮度全部由 rules.js 的 analyzeCircuit 规则引擎计算，
 * 本文件只负责把规则引擎的结果可视化为三维场景，不做任何科学计算。
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { analyzeCircuit } from "./rules.js";

/* 规范串联电路的接线柱空间坐标（y 为离地高度） */
const TERMINAL_POINTS = {
  "b+": new THREE.Vector3(0.9, 0.45, 2.2),
  "b-": new THREE.Vector3(-0.9, 0.45, 2.2),
  s1: new THREE.Vector3(-2.7, 0.45, 1.1),
  s2: new THREE.Vector3(-2.7, 0.45, -1.1),
  l1a: new THREE.Vector3(-1.1, 0.45, -2.2),
  l1b: new THREE.Vector3(1.1, 0.45, -2.2),
  l2a: new THREE.Vector3(2.7, 0.45, -1.1),
  l2b: new THREE.Vector3(2.7, 0.45, 1.1),
};

/* 规范串联接法：电源 → 开关 → L₁ → L₂ → 电源 */
const SERIES_WIRES = [
  ["b+", "s1"],
  ["s2", "l1a"],
  ["l1b", "l2a"],
  ["l2b", "b-"],
];

const BRIGHTNESS_LABELS = ["不发光", "灯丝微红", "较亮", "很亮"];

export function mountCircuitScene(container, hooks = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#050b18");

  const camera = new THREE.PerspectiveCamera(
    50,
    container.clientWidth / container.clientHeight,
    0.1,
    200
  );
  camera.position.set(5.2, 4.6, 6.4);
  camera.lookAt(0, 0.4, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 3;
  controls.maxDistance = 18;
  controls.target.set(0, 0.4, 0);
  controls.update();

  scene.add(new THREE.AmbientLight("#ffffff", 0.9));
  const keyLight = new THREE.DirectionalLight("#ffffff", 2.2);
  keyLight.position.set(5, 8, 4);
  scene.add(keyLight);

  /* 地面网格 */
  const grid = new THREE.GridHelper(24, 24, "#1f2a3d", "#141d2e");
  grid.position.y = 0;
  scene.add(grid);

  /* ---------------- 电路元件 ---------------- */

  const clickable = [];

  /* 电池（前侧） */
  const batteryGroup = new THREE.Group();
  batteryGroup.position.set(0, 0, 2.2);
  const batteryBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.5, 0.7),
    new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.5, metalness: 0.3 })
  );
  batteryBody.position.y = 0.45;
  batteryGroup.add(batteryBody);
  const batteryCap = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.14, 0.8),
    new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.4, metalness: 0.6 })
  );
  batteryCap.position.y = 0.76;
  batteryGroup.add(batteryCap);
  const posMark = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 16, 16),
    new THREE.MeshBasicMaterial({ color: "#ef4444" })
  );
  posMark.position.set(0.9, 0.45, 0);
  batteryGroup.add(posMark);
  const negMark = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 16, 16),
    new THREE.MeshBasicMaterial({ color: "#94a3b8" })
  );
  negMark.position.set(-0.9, 0.45, 0);
  batteryGroup.add(negMark);
  scene.add(batteryGroup);

  /* 开关（左侧，可点击） */
  const switchGroup = new THREE.Group();
  switchGroup.position.set(-2.7, 0, 0);
  const switchBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.22, 1.6),
    new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.5, metalness: 0.3 })
  );
  switchBase.position.y = 0.34;
  switchGroup.add(switchBase);
  const leverPivot = new THREE.Group();
  leverPivot.position.set(0, 0.45, 0.8);
  const lever = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.12, 1.5),
    new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.3, metalness: 0.8 })
  );
  lever.position.z = -0.75;
  leverPivot.add(lever);
  switchGroup.add(leverPivot);
  const switchHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.2, 2.0),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  switchHit.position.y = 0.7;
  switchGroup.add(switchHit);
  switchHit.userData.isSwitch = true;
  clickable.push(switchHit);
  scene.add(switchGroup);

  /* 灯泡 */
  function createBulb(position) {
    const group = new THREE.Group();
    group.position.copy(position);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.34, 0.3, 20),
      new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.4, metalness: 0.6 })
    );
    base.position.y = 0.5;
    group.add(base);

    const glassMaterial = new THREE.MeshStandardMaterial({
      color: "#fde68a",
      emissive: "#fbbf24",
      emissiveIntensity: 0,
      roughness: 0.25,
      transparent: true,
      opacity: 0.92,
    });
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 24, 24),
      glassMaterial
    );
    glass.position.y = 1.05;
    group.add(glass);

    const filament = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 12, 12),
      new THREE.MeshBasicMaterial({ color: "#78350f", transparent: true, opacity: 0.9 })
    );
    filament.position.y = 1.02;
    group.add(filament);

    scene.add(group);
    return { group, glassMaterial, filament };
  }

  const bulb1 = createBulb(new THREE.Vector3(0, 0, -2.2));
  const bulb2 = createBulb(new THREE.Vector3(2.7, 0, 0));

  /* 接线柱标记 */
  Object.entries(TERMINAL_POINTS).forEach(([id, point]) => {
    const mark = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 12),
      new THREE.MeshBasicMaterial({ color: "#64748b" })
    );
    mark.position.copy(point);
    scene.add(mark);
  });

  /* 导线 */
  const wireMaterial = new THREE.MeshStandardMaterial({
    color: "#dc2626",
    roughness: 0.45,
    metalness: 0.1,
  });

  function makeWire(a, b) {
    const start = TERMINAL_POINTS[a];
    const end = TERMINAL_POINTS[b];
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const wire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, length, 10),
      wireMaterial
    );
    wire.position.copy(start).addScaledVector(direction, 0.5);
    wire.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize()
    );
    scene.add(wire);
  }

  SERIES_WIRES.forEach(([a, b]) => makeWire(a, b));

  /* 电流粒子：沿闭合回路的等弧长参数曲线运动 */
  const loopPoints = [
    TERMINAL_POINTS["b+"],
    TERMINAL_POINTS.s1,
    TERMINAL_POINTS.s2,
    TERMINAL_POINTS.l1a,
    TERMINAL_POINTS.l1b,
    TERMINAL_POINTS.l2a,
    TERMINAL_POINTS.l2b,
    TERMINAL_POINTS["b-"],
  ];
  const loopCurve = new THREE.CatmullRomCurve3(loopPoints, true, "catmullrom", 0.15);
  const loopLength = loopCurve.getLength();

  const particleGeometry = new THREE.SphereGeometry(0.075, 12, 12);
  const particleMaterial = new THREE.MeshBasicMaterial({ color: "#fbbf24" });
  const PARTICLE_COUNT = 56;
  const particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const mesh = new THREE.Mesh(particleGeometry, particleMaterial);
    mesh.visible = false;
    scene.add(mesh);
    particles.push({ mesh, offset: i / PARTICLE_COUNT });
  }

  /* 星空背景 */
  const starPositions = [];
  for (let i = 0; i < 900; i++) {
    starPositions.push(
      (Math.random() - 0.5) * 90,
      Math.random() * 45 + 2,
      (Math.random() - 0.5) * 90
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
        size: 0.07,
        transparent: true,
        opacity: 0.75,
      })
    )
  );

  /* ---------------- 状态与规则引擎 ---------------- */

  const state = {
    voltage: 3,
    r1: 10,
    r2: 10,
    switchClosed: false,
    wires: SERIES_WIRES.map(([a, b]) => [a, b]),
  };

  let analysis = analyzeCircuit(state);

  function refresh() {
    analysis = analyzeCircuit(state);

    const statusEl = document.querySelector("#circuit-status");
    const metricsEl = document.querySelector("#circuit-metrics");
    const switchBtn = document.querySelector("#circuit-switch-btn");

    if (switchBtn) {
      switchBtn.textContent = state.switchClosed ? "断开开关" : "闭合开关";
    }

    if (statusEl) {
      const firstError = analysis.errors[0]?.message || "";
      statusEl.textContent = firstError || analysis.statusText;
      statusEl.dataset.tone =
        analysis.code === "valid" ? "ok" : analysis.code === "open-switch" ? "warn" : "bad";
    }

    if (metricsEl) {
      const m = analysis.metrics;
      const rows = m
        ? [
            ["总电阻 R", `${m.totalResistance} Ω`],
            ["电流 I", `${m.current} A`],
            ["L₁ 分压 U₁", `${m.voltage1} V`],
            ["L₂ 分压 U₂", `${m.voltage2} V`],
            ["L₁ 亮度", BRIGHTNESS_LABELS[m.brightness1]],
            ["L₂ 亮度", BRIGHTNESS_LABELS[m.brightness2]],
          ]
        : [["电流 I", "—（电路未接通）"]];
      metricsEl.innerHTML = rows
        .map(
          ([label, value]) => `
        <div class="lab-metric-row">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>`
        )
        .join("");
      if (m && m.current > 0) {
        hooks.completeTask?.("observe");
      }
    }

    if (state.switchClosed) {
      hooks.completeTask?.("switch");
    }

    /* 灯泡亮度 */
    const b1 = analysis.metrics?.brightness1 ?? 0;
    const b2 = analysis.metrics?.brightness2 ?? 0;
    bulb1.glassMaterial.emissiveIntensity = b1 * 0.55;
    bulb2.glassMaterial.emissiveIntensity = b2 * 0.55;
    bulb1.filament.material.color.set(
      b1 >= 2 ? "#fbbf24" : b1 === 1 ? "#b45309" : "#78350f"
    );
    bulb2.filament.material.color.set(
      b2 >= 2 ? "#fbbf24" : b2 === 1 ? "#b45309" : "#78350f"
    );

    /* 开关角度（目标值，动画中过渡） */
    targetLeverAngle = state.switchClosed
      ? THREE.MathUtils.degToRad(-24)
      : THREE.MathUtils.degToRad(28);
  }

  let targetLeverAngle = THREE.MathUtils.degToRad(28);

  /* ---------------- 交互 ---------------- */

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downPosition = null;

  function handlePointerDown(event) {
    downPosition = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event) {
    if (!downPosition) return;
    const moved = Math.hypot(
      event.clientX - downPosition.x,
      event.clientY - downPosition.y
    );
    downPosition = null;
    if (moved > 5) return;

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObjects(clickable, false);
    if (hits.length === 0) return;
    if (hits[0].object.userData.isSwitch) {
      state.switchClosed = !state.switchClosed;
      refresh();
    }
  }

  renderer.domElement.addEventListener("pointerdown", handlePointerDown);
  renderer.domElement.addEventListener("pointerup", handlePointerUp);

  const voltageSelect = document.querySelector("#circuit-voltage");
  const r1Select = document.querySelector("#circuit-r1");
  const r2Select = document.querySelector("#circuit-r2");
  const switchBtn = document.querySelector("#circuit-switch-btn");

  function handleVoltageChange() {
    state.voltage = Number(voltageSelect?.value) || 3;
    hooks.completeTask?.("params");
    refresh();
  }
  function handleR1Change() {
    state.r1 = Number(r1Select?.value) || 10;
    hooks.completeTask?.("params");
    refresh();
  }
  function handleR2Change() {
    state.r2 = Number(r2Select?.value) || 10;
    hooks.completeTask?.("params");
    refresh();
  }
  function handleSwitchToggle() {
    state.switchClosed = !state.switchClosed;
    refresh();
  }

  voltageSelect?.addEventListener("change", handleVoltageChange);
  r1Select?.addEventListener("change", handleR1Change);
  r2Select?.addEventListener("change", handleR2Change);
  switchBtn?.addEventListener("click", handleSwitchToggle);

  /* ---------------- 动画 ---------------- */

  const clock = new THREE.Clock();
  let animationId = 0;
  let disposed = false;
  let flowDistance = 0;

  function animate() {
    if (disposed) return;
    animationId = requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.05);
    const current = analysis.metrics?.current ?? 0;

    /* 电流粒子：有电流时沿回路流动，速度正比于电流大小 */
    if (current > 0) {
      const unitsPerSecond = 1.2 + current * 9;
      flowDistance = (flowDistance + unitsPerSecond * delta) % loopLength;

      particles.forEach((particle) => {
        let t = (flowDistance / loopLength + particle.offset) % 1;
        particle.mesh.visible = true;
        particle.mesh.position.copy(loopCurve.getPointAt(t));
        particle.mesh.position.y += 0.09;
      });
    } else {
      particles.forEach((particle) => {
        particle.mesh.visible = false;
      });
    }

    /* 开关杠杆过渡 */
    leverPivot.rotation.x +=
      (targetLeverAngle - leverPivot.rotation.x) * Math.min(1, delta * 8);

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

    renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
    renderer.domElement.removeEventListener("pointerup", handlePointerUp);
    voltageSelect?.removeEventListener("change", handleVoltageChange);
    r1Select?.removeEventListener("change", handleR1Change);
    r2Select?.removeEventListener("change", handleR2Change);
    switchBtn?.removeEventListener("click", handleSwitchToggle);

    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}
