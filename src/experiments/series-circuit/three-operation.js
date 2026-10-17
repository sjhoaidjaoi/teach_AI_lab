/*
 * 串联电路 —— 3D 可操作实验台（B 区 3D 视图）。
 *
 * 【原则】电流、电压、亮度、通断诊断全部由 rules.js 的 analyzeCircuit
 * 规则引擎计算，本文件只负责把规则引擎的结果渲染成三维实验台，
 * 并把学生的接线 / 开关操作写回 state，不做任何科学计算。
 *
 * 交互：
 * - 点击接线柱 A → 点击接线柱 B：连接一根导线
 * - 点击已连接的导线：拆除该导线
 * - 点击开关（或工具栏按钮）：闭合 / 断开
 * - 拖动旋转视角，滚轮缩放
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  TERMINALS,
  TERMINAL_LABELS,
  VOLTAGE_OPTIONS,
  RESISTANCE_OPTIONS,
  INITIAL_STATE,
  analyzeCircuit,
} from "./rules.js";
import { AMMETER_POINTS } from "./simulator.js";

/* 接线柱空间坐标（与 3D 实验室演示场景一致，y 为离地高度） */
const TERMINAL_POINTS = {
  [TERMINALS.BATTERY_POS]: new THREE.Vector3(0.9, 0.45, 2.2),
  [TERMINALS.BATTERY_NEG]: new THREE.Vector3(-0.9, 0.45, 2.2),
  [TERMINALS.SWITCH_1]: new THREE.Vector3(-2.7, 0.45, 1.1),
  [TERMINALS.SWITCH_2]: new THREE.Vector3(-2.7, 0.45, -1.1),
  [TERMINALS.BULB1_A]: new THREE.Vector3(-1.1, 0.45, -2.2),
  [TERMINALS.BULB1_B]: new THREE.Vector3(1.1, 0.45, -2.2),
  [TERMINALS.BULB2_A]: new THREE.Vector3(2.7, 0.45, -1.1),
  [TERMINALS.BULB2_B]: new THREE.Vector3(2.7, 0.45, 1.1),
};

/* 接线柱上方的 3D 短标签 */
const TERMINAL_TAGS = {
  [TERMINALS.BATTERY_POS]: "+",
  [TERMINALS.BATTERY_NEG]: "−",
  [TERMINALS.SWITCH_1]: "S₁",
  [TERMINALS.SWITCH_2]: "S₂",
  [TERMINALS.BULB1_A]: "L₁-A",
  [TERMINALS.BULB1_B]: "L₁-B",
  [TERMINALS.BULB2_A]: "L₂-A",
  [TERMINALS.BULB2_B]: "L₂-B",
};

const WIRE_DEFAULT = "#94a3b8";
const WIRE_PATH = "#3b82f6";
const WIRE_SHORT = "#dc2626";
const TERMINAL_DEFAULT = "#8ea3bd";
const TERMINAL_SELECTED = "#22d3ee";
const TERMINAL_UNWIRED = "#f59e0b";
const TERMINAL_HOVER = "#eaf2ff";

const BRIGHTNESS_LABELS = ["不发光", "灯丝微红", "较亮", "很亮"];

function cloneState(source) {
  return {
    ...source,
    wires: source.wires.map((wire) => [...wire]),
  };
}

function wireKey(a, b) {
  return [a, b].slice().sort().join("~");
}

function wireExists(wires, a, b) {
  return wires.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** 判断某条导线是否位于规则引擎给出的节点路径上。 */
function wireOnPath(wire, path) {
  if (!path) return false;
  return path.some((node, index) => {
    const next = path[index + 1];
    if (!next) return false;
    return (
      (node === wire[0] && next === wire[1]) ||
      (node === wire[1] && next === wire[0])
    );
  });
}

/** 画布文字贴图（接线柱标签 / 器材铭牌 / 电流表读数）。 */
function makeTextSprite(color = "#dbe7ff", scale = [1.5, 0.375]) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function update(text) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!text) {
      texture.needsUpdate = true;
      return;
    }
    ctx.font =
      "700 56px 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = Math.min(
      canvas.width - 12,
      ctx.measureText(text).width + 56
    );
    ctx.fillStyle = "rgba(6, 12, 26, 0.74)";
    roundRect((canvas.width - width) / 2, 20, width, 88, 24);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
    texture.needsUpdate = true;
  }

  sprite.scale.set(scale[0], scale[1], 1);
  return { sprite, update };
}

export function createThreeOperation(rootEl, api = {}, initialState = null) {
  let state = initialState
    ? cloneState(initialState)
    : cloneState(INITIAL_STATE);
  let selectedTerminal = null;
  let analysis = analyzeCircuit(state);

  /* ---------------- Three.js 基础 ---------------- */

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b1220");

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  const DEFAULT_CAMERA_POS = new THREE.Vector3(5.4, 4.8, 6.6);
  const DEFAULT_TARGET = new THREE.Vector3(0, 0.4, 0);
  camera.position.copy(DEFAULT_CAMERA_POS);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 3;
  controls.maxDistance = 16;
  controls.target.copy(DEFAULT_TARGET);
  controls.update();

  scene.add(new THREE.AmbientLight("#ffffff", 0.9));
  const keyLight = new THREE.DirectionalLight("#ffffff", 2.2);
  keyLight.position.set(5, 8, 4);
  scene.add(keyLight);

  const grid = new THREE.GridHelper(24, 24, "#1f2a3d", "#141d2e");
  scene.add(grid);

  /* ---------------- 器材 ---------------- */

  /* 电源（前侧） */
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

  const batteryLabel = makeTextSprite("#fca5a5", [1.15, 0.29]);
  batteryLabel.sprite.position.set(0, 1.16, 2.2);
  scene.add(batteryLabel.sprite);

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
  /* 开关点击热区（比演示场景小一圈，避免挡住 s1/s2 接线柱） */
  const switchHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.9, 1.5),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  switchHit.position.y = 0.6;
  switchHit.userData.isSwitch = true;
  switchGroup.add(switchHit);
  scene.add(switchGroup);

  const switchLabel = makeTextSprite("#cbd5e1", [1.15, 0.29]);
  switchLabel.sprite.position.set(-2.7, 1.32, 0);
  scene.add(switchLabel.sprite);

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
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 24), glassMaterial);
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

  const bulb1Label = makeTextSprite("#fde68a", [1.05, 0.26]);
  bulb1Label.sprite.position.set(0, 1.78, -2.2);
  scene.add(bulb1Label.sprite);
  const bulb2Label = makeTextSprite("#fde68a", [1.05, 0.26]);
  bulb2Label.sprite.position.set(2.7, 1.78, 0);
  scene.add(bulb2Label.sprite);

  /* ---------------- 接线柱 ---------------- */

  const terminalGeometry = new THREE.SphereGeometry(0.075, 14, 14);
  const terminalHitGeometry = new THREE.SphereGeometry(0.22, 10, 10);
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });

  const terminalMeshes = {}; // id -> 可见小球（独立材质，便于着色）
  const terminalHitMeshes = {}; // id -> 不可见点击热区

  Object.entries(TERMINAL_POINTS).forEach(([id, point]) => {
    const mark = new THREE.Mesh(
      terminalGeometry,
      new THREE.MeshBasicMaterial({ color: TERMINAL_DEFAULT })
    );
    mark.position.copy(point);
    mark.userData.baseColor = TERMINAL_DEFAULT;
    scene.add(mark);
    terminalMeshes[id] = mark;

    const hit = new THREE.Mesh(terminalHitGeometry, hitMaterial);
    hit.position.copy(point);
    hit.userData.terminal = id;
    scene.add(hit);
    terminalHitMeshes[id] = hit;

    const tag = makeTextSprite("#9fb1cc", [0.62, 0.155]);
    tag.update(TERMINAL_TAGS[id]);
    tag.sprite.position.copy(point).add(new THREE.Vector3(0, 0.34, 0));
    scene.add(tag.sprite);
  });

  /* ---------------- 导线（随 state 动态增删） ---------------- */

  const wiresGroup = new THREE.Group();
  scene.add(wiresGroup);
  let wireEntries = []; // { a, b, tube, hit }

  function rebuildWireMeshes() {
    const nextKeys = new Set(state.wires.map(([a, b]) => wireKey(a, b)));

    wireEntries = wireEntries.filter((entry) => {
      if (nextKeys.has(wireKey(entry.a, entry.b))) return true;
      wiresGroup.remove(entry.tube);
      wiresGroup.remove(entry.hit);
      entry.tube.geometry.dispose();
      entry.tube.material.dispose();
      entry.hit.geometry.dispose();
      if (hovered && hovered.object === entry.hit) hovered = null;
      return false;
    });

    const existing = new Set(wireEntries.map((entry) => wireKey(entry.a, entry.b)));
    state.wires.forEach(([a, b]) => {
      const key = wireKey(a, b);
      if (existing.has(key)) return;

      const start = TERMINAL_POINTS[a];
      const end = TERMINAL_POINTS[b];
      const direction = new THREE.Vector3().subVectors(end, start);
      const length = Math.max(direction.length(), 0.01);

      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, length, 10),
        new THREE.MeshStandardMaterial({
          color: WIRE_DEFAULT,
          roughness: 0.45,
          metalness: 0.1,
        })
      );
      tube.position.copy(start).addScaledVector(direction, 0.5);
      tube.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().normalize()
      );
      tube.userData.baseColor = WIRE_DEFAULT;
      wiresGroup.add(tube);

      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, length, 8),
        hitMaterial
      );
      hit.position.copy(tube.position);
      hit.quaternion.copy(tube.quaternion);
      hit.userData.wire = [a, b];
      wiresGroup.add(hit);

      wireEntries.push({ a, b, tube, hit });
    });
  }

  function updateWireColors() {
    wireEntries.forEach((entry) => {
      let color = WIRE_DEFAULT;
      if (analysis.code === "short" && wireOnPath([entry.a, entry.b], analysis.path)) {
        color = WIRE_SHORT;
      } else if (analysis.code === "valid" && wireOnPath([entry.a, entry.b], analysis.path)) {
        color = WIRE_PATH;
      }
      entry.tube.userData.baseColor = color;
      if (!isHoveredWire(entry)) entry.tube.material.color.set(color);
    });
  }

  /* ---------------- 电流粒子（沿真实接线回路流动） ---------------- */

  const particleGeometry = new THREE.SphereGeometry(0.075, 12, 12);
  const particleMaterial = new THREE.MeshBasicMaterial({ color: "#fbbf24" });
  const PARTICLE_COUNT = 48;
  const particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const mesh = new THREE.Mesh(particleGeometry, particleMaterial);
    mesh.visible = false;
    scene.add(mesh);
    particles.push({ mesh, offset: i / PARTICLE_COUNT });
  }

  let flowCurve = null;
  let flowLength = 1;
  let flowSignature = "";

  function updateFlowCurve() {
    const path = analysis.path;
    const signature = path ? path.join(">") : "";
    if (signature === flowSignature) return;
    flowSignature = signature;

    if (!path || path.length < 2) {
      flowCurve = null;
      return;
    }

    const points = path.map((id) => TERMINAL_POINTS[id]);
    const curve = new THREE.CurvePath();
    for (let i = 0; i < points.length - 1; i++) {
      curve.add(new THREE.LineCurve3(points[i], points[i + 1]));
    }
    /* 闭合回路最后一段穿过电源内部（负极 → 正极） */
    curve.add(new THREE.LineCurve3(points[points.length - 1], points[0]));
    flowCurve = curve;
    flowLength = curve.getLength();
  }

  /* ---------------- 电流表标记（位置跟随 C 区选择） ---------------- */

  const ammeterGroup = new THREE.Group();
  const ammeterDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 12, 12),
    new THREE.MeshBasicMaterial({ color: "#3b82f6" })
  );
  ammeterGroup.add(ammeterDot);
  const ammeterLabel = makeTextSprite("#93c5fd", [1.05, 0.26]);
  ammeterLabel.sprite.position.y = 0.52;
  ammeterGroup.add(ammeterLabel.sprite);
  ammeterGroup.visible = false;
  scene.add(ammeterGroup);

  function updateAmmeter() {
    const positionId = api.getAmmeterPosition?.();
    const point = AMMETER_POINTS.find((item) => item.id === positionId);
    const mounted =
      point && wireExists(state.wires, point.wire[0], point.wire[1]);

    if (!mounted) {
      ammeterGroup.visible = false;
      return;
    }

    const mid = TERMINAL_POINTS[point.wire[0]]
      .clone()
      .add(TERMINAL_POINTS[point.wire[1]])
      .multiplyScalar(0.5);
    ammeterGroup.position.copy(mid);

    const readable = analysis.ammeterReadable && analysis.metrics;
    ammeterLabel.update(`Ⓐ ${readable ? `${analysis.metrics.current} A` : "—"}`);
    ammeterGroup.visible = true;
  }

  /* ---------------- 状态渲染 ---------------- */

  let unwiredMeshes = [];
  let targetLeverAngle = THREE.MathUtils.degToRad(28);

  function updateTerminals() {
    unwiredMeshes = [];
    Object.entries(terminalMeshes).forEach(([id, mesh]) => {
      const isSelected = selectedTerminal === id;
      const isUnwired = analysis.unwiredTerminals.includes(id);
      let color = TERMINAL_DEFAULT;
      if (isSelected) color = TERMINAL_SELECTED;
      else if (isUnwired) color = TERMINAL_UNWIRED;
      mesh.userData.baseColor = color;
      if (hovered?.userData?.terminal !== id) mesh.material.color.set(color);
      if (isUnwired && !isSelected) unwiredMeshes.push(mesh);
      else mesh.scale.setScalar(1);
    });
  }

  function updateBulbs() {
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
  }

  function updateLabels() {
    batteryLabel.update(`电源 ${state.voltage} V`);
    bulb1Label.update(`L₁ ${state.r1} Ω · ${BRIGHTNESS_LABELS[analysis.metrics?.brightness1 ?? 0]}`);
    bulb2Label.update(`L₂ ${state.r2} Ω · ${BRIGHTNESS_LABELS[analysis.metrics?.brightness2 ?? 0]}`);
    switchLabel.update(`开关（${state.switchClosed ? "闭合" : "断开"}）`);
    targetLeverAngle = state.switchClosed
      ? THREE.MathUtils.degToRad(-24)
      : THREE.MathUtils.degToRad(28);
  }

  function updateSelectionStatus() {
    const statusEl = rootEl.querySelector("#op3d-status");
    if (!statusEl) return;
    if (selectedTerminal) {
      statusEl.textContent = `已选「${TERMINAL_LABELS[selectedTerminal]}」，再点击另一个接线柱完成连接`;
      statusEl.dataset.tone = "active";
    } else {
      statusEl.textContent = "点击一个接线柱开始连接导线";
      statusEl.dataset.tone = "idle";
    }
  }

  function updateSwitchButton() {
    const button = rootEl.querySelector("#op3d-switch");
    if (button) {
      button.textContent = state.switchClosed ? "断开开关" : "闭合开关";
      button.classList.toggle("is-on", state.switchClosed);
    }
  }

  function renderAll() {
    rebuildWireMeshes();
    updateWireColors();
    updateTerminals();
    updateBulbs();
    updateLabels();
    updateAmmeter();
    updateSwitchButton();
    updateFlowCurve();
    updateSelectionStatus();
  }

  function notify(logType, logText) {
    if (logType && logText) api.log?.(logType, logText);
    api.onStateChange?.(cloneState(state), analysis);
  }

  /** 操作后统一入口：重新分析 → 重渲染 → 通知实验台。 */
  function commit(logType, logText) {
    analysis = analyzeCircuit(state);
    renderAll();
    notify(logType, logText);
  }

  /* ---------------- 悬停高亮与拾取 ---------------- */

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered = null; // 当前悬停的"热区"对象（terminal hit / wire hit / switch hit）

  function isHoveredWire(entry) {
    return (
      hovered?.userData?.wire &&
      wireKey(hovered.userData.wire[0], hovered.userData.wire[1]) ===
        wireKey(entry.a, entry.b)
    );
  }

  /* ---------------- 交互：拾取 ---------------- */

  let downPosition = null;

  function pick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const targets = [
      ...Object.values(terminalHitMeshes),
      switchHit,
      ...wireEntries.map((entry) => entry.hit),
    ];
    const hits = raycaster.intersectObjects(targets, false);
    return hits.length ? hits[0].object : null;
  }

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

    const target = pick(event.clientX, event.clientY);
    if (!target) return;

    if (target.userData.terminal) {
      handleTerminalClick(target.userData.terminal);
    } else if (target.userData.wire) {
      handleWireClick(target.userData.wire);
    } else if (target.userData.isSwitch) {
      toggleSwitch();
    }
  }

  function handlePointerMove(event) {
    const target = pick(event.clientX, event.clientY);
    setHovered(target);
  }

  function handlePointerLeave() {
    setHovered(null);
  }

  function setHovered(object) {
    if (hovered === object) return;

    /* 恢复上一个悬停对象 */
    if (hovered) {
      if (hovered.userData?.terminal && terminalMeshes[hovered.userData.terminal]) {
        terminalMeshes[hovered.userData.terminal].material.color.set(
          terminalMeshes[hovered.userData.terminal].userData.baseColor
        );
      } else if (hovered.userData?.wire) {
        const entry = wireEntries.find(
          (item) => wireKey(item.a, item.b) === wireKey(hovered.userData.wire[0], hovered.userData.wire[1])
        );
        if (entry) entry.tube.material.color.set(entry.tube.userData.baseColor);
      }
    }

    hovered = object;
    renderer.domElement.style.cursor = object ? "pointer" : "grab";

    if (!object) return;

    if (object.userData?.terminal && terminalMeshes[object.userData.terminal]) {
      terminalMeshes[object.userData.terminal].material.color.set(TERMINAL_HOVER);
    } else if (object.userData?.wire) {
      const entry = wireEntries.find(
        (item) => wireKey(item.a, item.b) === wireKey(object.userData.wire[0], object.userData.wire[1])
      );
      if (entry) {
        entry.tube.material.color.set(
          new THREE.Color(entry.tube.userData.baseColor).lerp(new THREE.Color("#ffffff"), 0.4)
        );
      }
    }
  }

  /* ---------------- 交互：操作 ---------------- */

  function handleTerminalClick(node) {
    if (!selectedTerminal) {
      selectedTerminal = node;
      updateTerminals();
      updateSelectionStatus();
      return;
    }

    if (selectedTerminal === node) {
      selectedTerminal = null;
      updateTerminals();
      updateSelectionStatus();
      return;
    }

    if (wireExists(state.wires, selectedTerminal, node)) {
      selectedTerminal = null;
      api.showToast?.("这两个接线柱之间已经有导线了");
      updateTerminals();
      updateSelectionStatus();
      return;
    }

    const first = selectedTerminal;
    state.wires.push([first, node]);
    selectedTerminal = null;
    commit("wire", `连接导线：${TERMINAL_LABELS[first]} ↔ ${TERMINAL_LABELS[node]}`);
  }

  function handleWireClick(wire) {
    const [a, b] = wire;
    state.wires = state.wires.filter(
      ([x, y]) => !((x === a && y === b) || (x === b && y === a))
    );
    selectedTerminal = null;
    commit("wire", `拆除导线：${TERMINAL_LABELS[a]} ↔ ${TERMINAL_LABELS[b]}`);
  }

  function toggleSwitch() {
    state.switchClosed = !state.switchClosed;
    commit("switch", state.switchClosed ? "闭合开关" : "断开开关");
  }

  /* ---------------- 工具栏（HTML 覆盖层） ---------------- */

  function mount() {
    rootEl.innerHTML = `
      <div class="vlab-3d-stage">
        <div class="vlab-3d-canvas"></div>
        <div class="vlab-3d-toolbar">
          <label class="circuit-control">
            <span>电源电压</span>
            <select id="op3d-voltage">
              ${VOLTAGE_OPTIONS.map(
                (v) => `
                <option value="${v}" ${state.voltage === v ? "selected" : ""}>
                  ${v} V（${v / 1.5} 节干电池）
                </option>`
              ).join("")}
            </select>
          </label>

          <label class="circuit-control">
            <span>灯泡 L₁ 电阻</span>
            <select id="op3d-r1">
              ${RESISTANCE_OPTIONS.map(
                (r) => `
                <option value="${r}" ${state.r1 === r ? "selected" : ""}>${r} Ω</option>`
              ).join("")}
            </select>
          </label>

          <label class="circuit-control">
            <span>灯泡 L₂ 电阻</span>
            <select id="op3d-r2">
              ${RESISTANCE_OPTIONS.map(
                (r) => `
                <option value="${r}" ${state.r2 === r ? "selected" : ""}>${r} Ω</option>`
              ).join("")}
            </select>
          </label>

          <button type="button" class="button button-secondary" id="op3d-switch">
            ${state.switchClosed ? "断开开关" : "闭合开关"}
          </button>
          <button type="button" class="button button-secondary" id="op3d-clear">清空导线</button>
          <button type="button" class="button button-secondary" id="op3d-view">重置视角</button>
        </div>

        <div class="vlab-3d-status" id="op3d-status" data-tone="idle">
          点击一个接线柱开始连接导线
        </div>
        <p class="vlab-3d-hint">
          点击两个接线柱连接导线 · 点击导线拆除 · 点击开关通断 · 拖动旋转视角
        </p>
      </div>
    `;

    rootEl.querySelector(".vlab-3d-canvas").appendChild(renderer.domElement);

    rootEl.querySelector("#op3d-voltage").addEventListener("change", (event) => {
      state.voltage = Number(event.target.value);
      commit("param", `电源电压调整为 ${state.voltage} V`);
    });
    rootEl.querySelector("#op3d-r1").addEventListener("change", (event) => {
      state.r1 = Number(event.target.value);
      commit("param", `灯泡 L₁ 电阻调整为 ${state.r1} Ω`);
    });
    rootEl.querySelector("#op3d-r2").addEventListener("change", (event) => {
      state.r2 = Number(event.target.value);
      commit("param", `灯泡 L₂ 电阻调整为 ${state.r2} Ω`);
    });
    rootEl.querySelector("#op3d-switch").addEventListener("click", toggleSwitch);
    rootEl.querySelector("#op3d-clear").addEventListener("click", () => {
      if (state.wires.length === 0) return;
      state.wires = [];
      selectedTerminal = null;
      commit("wire", "拆除全部导线，重新开始连接");
    });
    rootEl.querySelector("#op3d-view").addEventListener("click", resetView);

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);

    resizeObserver.observe(rootEl.querySelector(".vlab-3d-stage"));

    analysis = analyzeCircuit(state);
    renderAll();
    notify();
    animate();
  }

  function resetView() {
    camera.position.copy(DEFAULT_CAMERA_POS);
    controls.target.copy(DEFAULT_TARGET);
    controls.update();
  }

  /* ---------------- 动画 ---------------- */

  const clock = new THREE.Clock();
  let animationId = 0;
  let disposed = false;
  let flowDistance = 0;

  function animate() {
    if (disposed) return;
    animationId = requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.05);
    const isShort = analysis.code === "short";
    const current = analysis.metrics?.current ?? 0;

    /* 电流粒子：有效通路时按电流大小流动，短路时红色高速流动 */
    if (flowCurve && (current > 0 || isShort)) {
      const speed = isShort ? 6 : 1.2 + current * 9;
      flowDistance = (flowDistance + speed * delta) % flowLength;
      const color = isShort ? "#f87171" : "#fbbf24";
      particleMaterial.color.set(color);

      particles.forEach((particle) => {
        const t = (flowDistance / flowLength + particle.offset) % 1;
        particle.mesh.visible = true;
        particle.mesh.position.copy(flowCurve.getPointAt(t));
        particle.mesh.position.y += 0.09;
      });
    } else {
      particles.forEach((particle) => {
        particle.mesh.visible = false;
      });
    }

    /* 未接线柱呼吸提示 */
    const pulse = 1 + 0.22 * Math.sin(clock.elapsedTime * 5);
    unwiredMeshes.forEach((mesh) => mesh.scale.setScalar(pulse));

    /* 开关杠杆过渡 */
    leverPivot.rotation.x +=
      (targetLeverAngle - leverPivot.rotation.x) * Math.min(1, delta * 8);

    controls.update();
    renderer.render(scene, camera);
  }

  const resizeObserver = new ResizeObserver(() => {
    const stage = rootEl.querySelector(".vlab-3d-stage");
    if (!stage) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (width <= 0 || height <= 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });

  function getState() {
    return cloneState(state);
  }

  /** 外部状态（如电流表位置）变化后更新标记，不改变电路状态。 */
  function refreshView() {
    updateAmmeter();
  }

  function destroy() {
    disposed = true;
    cancelAnimationFrame(animationId);
    controls.dispose();
    resizeObserver.disconnect();

    renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
    renderer.domElement.removeEventListener("pointerup", handlePointerUp);
    renderer.domElement.removeEventListener("pointermove", handlePointerMove);
    renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);

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
    rootEl.innerHTML = "";

    if (import.meta.env.DEV) window.__series3d = null;
  }

  /* 开发环境测试钩子：端到端测试用，生产构建不包含 */
  if (import.meta.env.DEV) {
    const projectToScreen = (vector3) => {
      const v = vector3.clone().project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return {
        x: rect.left + ((v.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - v.y) / 2) * rect.height,
      };
    };

    window.__series3d = {
      terminal: (id) => projectToScreen(TERMINAL_POINTS[id]),
      switchCenter: () => projectToScreen(new THREE.Vector3(-2.7, 0.8, 0)),
      wires: () =>
        state.wires.map(([a, b]) => ({
          a,
          b,
          mid: projectToScreen(
            TERMINAL_POINTS[a].clone().add(TERMINAL_POINTS[b]).multiplyScalar(0.5)
          ),
        })),
      state: () => cloneState(state),
      canvas: () => renderer.domElement,
    };
  }

  return { mount, destroy, getState, refreshView };
}
