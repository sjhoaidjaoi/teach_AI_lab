import * as THREE from "three";
import { OrbitControls } from
  "three/addons/controls/OrbitControls.js";
const PLANETS = [
  {
    name: "水星",
    englishName: "Mercury",
    radius: 0.16,
    orbit: 2.2,
    color: "#a9a9a9",
    speed: 0.85,
    fact: "水星是距离太阳最近的行星，也是太阳系八大行星中最小的一颗。",
    diameter: "约 4,879 千米",
    day: "自转一周约 58.6 个地球日",
    year: "公转一周约 88 个地球日",
  },
  {
    name: "金星",
    englishName: "Venus",
    radius: 0.24,
    orbit: 3.1,
    color: "#e7c28d",
    speed: 0.62,
    fact: "金星拥有非常浓厚的大气层，强烈的温室效应使其表面温度极高。",
    diameter: "约 12,104 千米",
    day: "自转一周约 243 个地球日",
    year: "公转一周约 225 个地球日",
  },
  {
    name: "地球",
    englishName: "Earth",
    radius: 0.26,
    orbit: 4.1,
    color: "#2f80ed",
    speed: 0.48,
    fact: "地球拥有适合已知生命生存的环境，表面大部分被液态水覆盖。",
    diameter: "约 12,742 千米",
    day: "自转一周约 23 小时 56 分",
    year: "公转一周约 365.25 天",
  },
  {
    name: "火星",
    englishName: "Mars",
    radius: 0.21,
    orbit: 5.1,
    color: "#d65b45",
    speed: 0.39,
    fact: "火星表面富含氧化铁，因此呈现出明显的红色，是行星探测的重要目标。",
    diameter: "约 6,779 千米",
    day: "自转一周约 24 小时 37 分",
    year: "公转一周约 687 个地球日",
  },
  {
    name: "木星",
    englishName: "Jupiter",
    radius: 0.60,
    orbit: 6.6,
    color: "#d4a373",
    speed: 0.24,
    fact: "木星是太阳系中体积最大的行星，拥有强大的磁场和众多卫星。",
    diameter: "约 139,820 千米",
    day: "自转一周约 9 小时 56 分",
    year: "公转一周约 11.86 个地球年",
  },
  {
    name: "土星",
    englishName: "Saturn",
    radius: 0.50,
    orbit: 8.1,
    color: "#ead6a7",
    speed: 0.18,
    fact: "土星以醒目的环系统著称，其环主要由冰粒、岩石碎片和尘埃组成。",
    diameter: "约 116,460 千米",
    day: "自转一周约 10.7 小时",
    year: "公转一周约 29.4 个地球年",
  },
  {
    name: "天王星",
    englishName: "Uranus",
    radius: 0.36,
    orbit: 9.6,
    color: "#80d4d9",
    speed: 0.13,
    fact: "天王星的自转轴倾斜角很大，因此它的季节变化具有鲜明特点。",
    diameter: "约 50,724 千米",
    day: "自转一周约 17.2 小时（逆行）",
    year: "公转一周约 84 个地球年",
  },
  {
    name: "海王星",
    englishName: "Neptune",
    radius: 0.34,
    orbit: 11.0,
    color: "#4169e1",
    speed: 0.10,
    fact: "海王星是距离太阳最远的八大行星，拥有非常活跃的大气天气现象。",
    diameter: "约 49,244 千米",
    day: "自转一周约 16 小时",
    year: "公转一周约 165 个地球年",
  },
];
export function createScienceScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#050b18");
  const camera = new THREE.PerspectiveCamera(
    55,
    container.clientWidth / container.clientHeight,
    0.1,
    300
  );
  camera.position.set(0, 14, 22);
  camera.lookAt(0, 0, 0);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const controls = new OrbitControls(
  camera,
  renderer.domElement
);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = true;
controls.enableZoom = true;
controls.enableRotate = true;
controls.minDistance = 5;
controls.maxDistance = 45;
controls.target.set(0, 0, 0);
controls.update();
  // 环境光
  scene.add(new THREE.AmbientLight("#ffffff", 0.8));
  // 太阳
  const sunGeometry = new THREE.SphereGeometry(1, 48, 48);
  const sunMaterial = new THREE.MeshBasicMaterial({
    color: "#ffb52e",
  });
  const sun = new THREE.Mesh(sunGeometry, sunMaterial);
  scene.add(sun);
  sun.userData.planetInfo = {
  name: "太阳",
  englishName: "Sun",
  fact: "太阳是一颗恒星，通过核聚变释放能量，为地球提供光和热。",
  diameter: "约 139 万千米",
  day: "赤道附近自转约 25 天",
  year: "不适用：太阳不是围绕自身公转的行星",
};
  // 太阳周围的柔和光晕
  const glowMaterial = new THREE.SpriteMaterial({
    map: createGlowTexture(),
    color: "#ff9f1c",
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glow = new THREE.Sprite(glowMaterial);
  glow.scale.set(4.5, 4.5, 1);
  scene.add(glow);
  // 点光源让行星具有受光后的明暗变化
  const sunlight = new THREE.PointLight("#ffffff", 140, 0, 1.5);
  scene.add(sunlight);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let selectedObject = null;
  const planetObjects = [];
  // 创建八大行星
  for (const data of PLANETS) {
    // 轨道线
    const points = [];
    for (let i = 0; i <= 160; i++) {
      const angle = (i / 160) * Math.PI * 2;
      points.push(
        new THREE.Vector3(
          Math.cos(angle) * data.orbit,
          0,
          Math.sin(angle) * data.orbit
        )
      );
    }
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const orbitMaterial = new THREE.LineBasicMaterial({
      color: "#34435d",
      transparent: true,
      opacity: 0.7,
    });
    const orbitLine = new THREE.LineLoop(
      orbitGeometry,
      orbitMaterial
    );
    scene.add(orbitLine);
    // 公转中心
    const pivot = new THREE.Group();
    scene.add(pivot);
    // 行星本体
    const geometry = new THREE.SphereGeometry(
      data.radius,
      32,
      32
    );
    const material = new THREE.MeshStandardMaterial({
      color: data.color,
      roughness: 0.85,
      metalness: 0,
    });
    const planet = new THREE.Mesh(geometry, material);
    planet.position.x = data.orbit;
    pivot.add(planet);
    planet.userData.planetInfo = data;
    planetObjects.push({
      ...data,
      pivot,
      planet,
      orbitLine,
      initialAngle: Math.random() * Math.PI * 2,
    });
  }
  
  function updatePlanetPanel(info) {
    const nameElement = document.querySelector("#planet-name");
    const englishElement = document.querySelector("#planet-english-name");
    const factElement = document.querySelector("#planet-fact");
    const diameterElement = document.querySelector("#planet-diameter");
    const dayElement = document.querySelector("#planet-day");
    const yearElement = document.querySelector("#planet-year");
    if (!nameElement || !info) return;
    nameElement.textContent = info.name;
    englishElement.textContent = info.englishName || "";
    factElement.textContent = info.fact || "暂无介绍。";
    diameterElement.textContent = info.diameter || "暂无数据";
    dayElement.textContent = info.day || "暂无数据";
    yearElement.textContent = info.year || "暂无数据";
  }
  const clickableObjects = [
    sun,
    ...planetObjects.map((item) => item.planet),
  ];
  let pointerDownPosition = null;
  function handlePointerDown(event) {
    pointerDownPosition = {
      x: event.clientX,
      y: event.clientY,
    };
  }
  function handlePointerUp(event) {
    if (!pointerDownPosition) return;
    const distance = Math.hypot(
      event.clientX - pointerDownPosition.x,
      event.clientY - pointerDownPosition.y
    );
    pointerDownPosition = null;
    // 拖动距离太大，就认为用户在旋转或平移场景
    if (distance > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x =
      ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y =
      -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObjects(
      clickableObjects,
      false
    );
    if (intersections.length === 0) return;
    const object = intersections[0].object;
    const info = object.userData.planetInfo;
    if (!info) return;
    if (selectedObject && selectedObject !== object) {
      selectedObject.scale.setScalar(1);
    }
    selectedObject = object;
    selectedObject.scale.setScalar(1.18);
    updatePlanetPanel(info);
  }
  renderer.domElement.addEventListener(
    "pointerdown",
    handlePointerDown
  );
  renderer.domElement.addEventListener(
    "pointerup",
    handlePointerUp
  );
  // 星空背景
  const starPositions = [];
  for (let i = 0; i < 1800; i++) {
    starPositions.push(
      (Math.random() - 0.5) * 100,
      (Math.random() - 0.5) * 70,
      (Math.random() - 0.5) * 100
    );
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(starPositions, 3)
  );
  const starMaterial = new THREE.PointsMaterial({
    color: "#ffffff",
    size: 0.07,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);
  // 动画
  const clock = new THREE.Clock();
  let animationId = 0;
  let disposed = false;
  let isAnimationPlaying = true;
  let animationSpeed = 1;
  function animate() {
    if (disposed) return;
    animationId = requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);
    if (isAnimationPlaying) {
      const elapsed = delta * animationSpeed;
      sun.rotation.y += elapsed * 0.15;
      for (const item of planetObjects) {
        item.pivot.rotation.y += elapsed * item.speed * 0.25;
        item.planet.rotation.y += elapsed * 0.4;
      }
    }
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // ResizeObserver 替代旧的 window resize
  const resizeObserver = new ResizeObserver(() => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
  resizeObserver.observe(container);

  // 按钮控制代码
  const toggleButton = document.querySelector("#toggle-animation");
  const speedInput = document.querySelector("#animation-speed");
  const speedValue = document.querySelector("#speed-value");
  const resetButton = document.querySelector("#reset-view");
  const focusButton = document.querySelector("#focus-planet");
  function handleToggleAnimation() {
    isAnimationPlaying = !isAnimationPlaying;
    if (toggleButton) {
      toggleButton.textContent = isAnimationPlaying
        ? "暂停动画"
        : "继续动画";
    }
  }
  function handleSpeedChange() {
    if (!speedInput) return;
    animationSpeed = Number(speedInput.value);
    if (speedValue) {
      speedValue.textContent = `${animationSpeed.toFixed(1)}×`;
    }
  }
  function handleResetView() {
    camera.position.set(0, 14, 22);
    controls.target.set(0, 0, 0);
    controls.update();
    if (selectedObject) {
      selectedObject.scale.setScalar(1);
      selectedObject = null;
    }
  }
  function handleFocusPlanet() {
    if (!selectedObject) {
      alert("请先点击一颗行星或太阳。");
      return;
    }
    // 计算所选天体在世界坐标系中的位置
    const targetPosition = new THREE.Vector3();
    selectedObject.getWorldPosition(targetPosition);
    // 保持当前观察方向，把相机移动到目标附近
    const direction = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .normalize();
    const distance = Math.max(
      selectedObject === sun ? 4 : 2,
      selectedObject.geometry.parameters?.radius * 5 || 4
    );
    camera.position
      .copy(targetPosition)
      .add(direction.multiplyScalar(distance));
    controls.target.copy(targetPosition);
    controls.update();
  }
  toggleButton?.addEventListener(
    "click",
    handleToggleAnimation
  );
  speedInput?.addEventListener(
    "input",
    handleSpeedChange
  );
  resetButton?.addEventListener(
    "click",
    handleResetView
  );
  focusButton?.addEventListener(
    "click",
    handleFocusPlanet
  );

  return function dispose() {
    controls.dispose();
    disposed = true;
    cancelAnimationFrame(animationId);
    renderer.domElement.removeEventListener(
      "pointerdown",
      handlePointerDown
    );
    renderer.domElement.removeEventListener(
      "pointerup",
      handlePointerUp
    );

    // 解绑按钮事件
    toggleButton?.removeEventListener("click", handleToggleAnimation);
    speedInput?.removeEventListener("input", handleSpeedChange);
    resetButton?.removeEventListener("click", handleResetView);
    focusButton?.removeEventListener("click", handleFocusPlanet);

    // 销毁ResizeObserver
    resizeObserver?.disconnect();

    scene.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          if (material.map) material.map.dispose();
          material.dispose();
        }
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}
function createGlowTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - size / 2) / (size / 2);
      const dy = (y - size / 2) / (size / 2);
      const distance = Math.sqrt(dx * dx + dy * dy);
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 180;
      data[index + 2] = 60;
      data[index + 3] = Math.max(
        0,
        Math.min(255, (1 - distance) * 100)
      );
    }
  }
  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat
  );
  texture.needsUpdate = true;
  return texture;
}
