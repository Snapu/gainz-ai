<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import * as THREE from "three";
import type { MuscleGroup, VolumeLandmark, MuscleGroupInsight } from "@/services/trainingScience";

const props = defineProps<{
  muscleGroups: Partial<Record<MuscleGroup, MuscleGroupInsight>>;
}>();

const container = ref<HTMLElement | null>(null);
const labels = ref<Array<{ group: MuscleGroup; x: number; y: number; sets: number; color: string }>>([]);

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let mannequin: THREE.Group;
let frameId: number;

// --- Stimulus Mapping ---
function getLandmarkColor(landmark?: VolumeLandmark): number {
  if (!landmark) return 0x1f1f1f; 
  switch (landmark) {
    case "below_MEV": return 0xeab308; 
    case "at_MEV": return 0x10b981;    
    case "at_MAV": return 0x22d3ee;    
    case "above_MRV": return 0xef4444; 
    default: return 0x1f1f1f;
  }
}

const ALL_GROUPS: MuscleGroup[] = [
  "Chest", "Back", "Quads", "Hamstrings", 
  "Shoulders", "Biceps", "Triceps", "Abs", "Calves", "Glutes"
];

const meshes: Partial<Record<MuscleGroup, THREE.Mesh[]>> = {};

// --- Scene Setup ---
function init() {
  if (!container.value) return;

  scene = new THREE.Scene();
  scene.background = null;

  const w = container.value.clientWidth;
  const h = 450; 
  camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 1000);
  camera.position.set(0, 0, 5.5);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.value.appendChild(renderer.domElement);

  // High-End Blueprint Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambient);
  
  const spot = new THREE.SpotLight(0x22d3ee, 4, 15, 0.5, 0.2);
  spot.position.set(5, 5, 10);
  scene.add(spot);

  const backLight = new THREE.SpotLight(0xffffff, 1, 15);
  backLight.position.set(-5, 0, -10);
  scene.add(backLight);

  mannequin = new THREE.Group();
  // Lift to center better vertically (mannequin is ~4 units tall)
  mannequin.position.y = 0.5;
  scene.add(mannequin);

  setupHighFidelityMannequin();
  updateMaterials();
  animate();
}

/** Create refined anatomical segments */
function setupHighFidelityMannequin() {
  const createSegment = (group: MuscleGroup | "Skeleton", geo: THREE.BufferGeometry, pos: THREE.Vector3, rot: THREE.Euler = new THREE.Euler(), scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1)) => {
    const isSkelly = group === "Skeleton";
    const mat = new THREE.MeshPhongMaterial({ 
      color: isSkelly ? 0x111111 : 0x1f1f1f, 
      transparent: true, 
      opacity: isSkelly ? 0.3 : 0.6, 
      shininess: 50,
      flatShading: true
    });
    
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.rotation.copy(rot);
    mesh.scale.copy(scale);
    mannequin.add(mesh);

    // Blueprint wireframe overlay
    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.1 }));
    mesh.add(line);
    
    if (group !== "Skeleton") {
      if (!meshes[group]) meshes[group] = [];
      meshes[group]!.push(mesh);
    }
  };

  // --- ANATOMICAL RATIOS (Scaled to ~4 units total height) ---
  
  // Head & Neck
  createSegment("Skeleton", new THREE.SphereGeometry(0.2, 12, 12), new THREE.Vector3(0, 1.8, 0));
  createSegment("Skeleton", new THREE.CylinderGeometry(0.08, 0.1, 0.2), new THREE.Vector3(0, 1.6, 0));

  // CHEST (Split into 2 segments: Upper/Mid)
  createSegment("Chest", new THREE.BoxGeometry(0.4, 0.3, 0.15), new THREE.Vector3(0.25, 1.4, 0.18), new THREE.Euler(0, 0.1, 0));
  createSegment("Chest", new THREE.BoxGeometry(0.4, 0.3, 0.15), new THREE.Vector3(-0.25, 1.4, 0.18), new THREE.Euler(0, -0.1, 0));
  createSegment("Chest", new THREE.BoxGeometry(0.4, 0.3, 0.12), new THREE.Vector3(0.25, 1.15, 0.18), new THREE.Euler(0, 0.1, -0.1));
  createSegment("Chest", new THREE.BoxGeometry(0.4, 0.3, 0.12), new THREE.Vector3(-0.25, 1.15, 0.18), new THREE.Euler(0, -0.1, 0.1));

  // BACK (Lats & Traps)
  createSegment("Back", new THREE.BoxGeometry(0.45, 0.8, 0.15), new THREE.Vector3(0.3, 1.1, -0.15), new THREE.Euler(0, -0.2, 0.1));
  createSegment("Back", new THREE.BoxGeometry(0.45, 0.8, 0.15), new THREE.Vector3(-0.3, 1.1, -0.15), new THREE.Euler(0, 0.2, -0.1));
  createSegment("Back", new THREE.BoxGeometry(0.4, 0.4, 0.1), new THREE.Vector3(0, 1.5, -0.15));

  // ABS (Segmented Look)
  for (let i = 0; i < 3; i++) {
    createSegment("Abs", new THREE.BoxGeometry(0.2, 0.15, 0.1), new THREE.Vector3(0.12, 0.95 - (i * 0.18), 0.15));
    createSegment("Abs", new THREE.BoxGeometry(0.2, 0.15, 0.1), new THREE.Vector3(-0.12, 0.95 - (i * 0.18), 0.15));
  }

  // SHOULDERS (3-head deltoid focus)
  const deltGeo = new THREE.SphereGeometry(0.18, 12, 12);
  createSegment("Shoulders", deltGeo, new THREE.Vector3(0.65, 1.55, 0));
  createSegment("Shoulders", deltGeo, new THREE.Vector3(-0.65, 1.55, 0));
  createSegment("Shoulders", deltGeo, new THREE.Vector3(0.65, 1.55, 0.1), new THREE.Euler(0.5, 0, 0)); // Front delt
  createSegment("Shoulders", deltGeo, new THREE.Vector3(-0.65, 1.55, 0.1), new THREE.Euler(0.5, 0, 0));

  // ARMS (Biceps & Triceps separated by cylinder/capsule orientation)
  const armGeo = new THREE.CapsuleGeometry(0.11, 0.4, 4, 8);
  createSegment("Biceps", armGeo, new THREE.Vector3(0.75, 1.15, 0.1), new THREE.Euler(0.2, 0, 0.1));
  createSegment("Biceps", armGeo, new THREE.Vector3(-0.75, 1.15, 0.1), new THREE.Euler(0.2, 0, -0.1));
  createSegment("Triceps", armGeo, new THREE.Vector3(0.78, 1.1, -0.1), new THREE.Euler(-0.2, 0, 0.1));
  createSegment("Triceps", armGeo, new THREE.Vector3(-0.78, 1.1, -0.1), new THREE.Euler(-0.2, 0, -0.1));
  
  // Forearms (Skeleton)
  createSegment("Skeleton", new THREE.CylinderGeometry(0.08, 0.06, 0.6), new THREE.Vector3(0.85, 0.6, 0.15), new THREE.Euler(0.3, 0, 0.2));
  createSegment("Skeleton", new THREE.CylinderGeometry(0.08, 0.06, 0.6), new THREE.Vector3(-0.85, 0.6, 0.15), new THREE.Euler(0.3, 0, -0.2));

  // GLUTES (Posterior emphasis)
  const gluteGeo = new THREE.BoxGeometry(0.4, 0.4, 0.3);
  createSegment("Glutes", gluteGeo, new THREE.Vector3(0.22, 0.45, -0.15), new THREE.Euler(0, -0.2, 0));
  createSegment("Glutes", gluteGeo, new THREE.Vector3(-0.22, 0.45, -0.15), new THREE.Euler(0, 0.2, 0));

  // LEGS (Quads & Hamstrings refined)
  const legGeo = new THREE.CylinderGeometry(0.22, 0.15, 0.9);
  createSegment("Quads", legGeo, new THREE.Vector3(0.28, -0.1, 0.15), new THREE.Euler(0.1, -0.1, 0.05));
  createSegment("Quads", legGeo, new THREE.Vector3(-0.28, -0.1, 0.15), new THREE.Euler(0.1, 0.1, -0.05));
  createSegment("Hamstrings", legGeo, new THREE.Vector3(0.28, -0.1, -0.15), new THREE.Euler(-0.1, -0.1, 0.05));
  createSegment("Hamstrings", legGeo, new THREE.Vector3(-0.28, -0.1, -0.15), new THREE.Euler(-0.1, 0.1, -0.05));

  // CALVES (Tear-drop focus)
  const calfGeo = new THREE.CapsuleGeometry(0.13, 0.5, 4, 8);
  createSegment("Calves", calfGeo, new THREE.Vector3(0.32, -0.9, -0.1));
  createSegment("Calves", calfGeo, new THREE.Vector3(-0.32, -0.9, -0.1));
  
  // Feet
  createSegment("Skeleton", new THREE.BoxGeometry(0.18, 0.08, 0.4), new THREE.Vector3(0.32, -1.4, 0.1));
  createSegment("Skeleton", new THREE.BoxGeometry(0.18, 0.08, 0.4), new THREE.Vector3(-0.32, -1.4, 0.1));
}

function updateMaterials() {
  for (const group of ALL_GROUPS) {
    const status = props.muscleGroups[group];
    const color = getLandmarkColor(status?.landmark);
    const groupMeshes = meshes[group] || [];
    
    for (const mesh of groupMeshes) {
      const mat = mesh.material as THREE.MeshPhongMaterial;
      mat.color.setHex(color);
      
      if (status?.landmark === "at_MAV" || status?.landmark === "above_MRV") {
         mat.emissive.setHex(color);
         mat.emissiveIntensity = 0.6;
         mat.opacity = 0.85;
      } else if (status && status.sets > 0) {
         mat.emissive.setHex(color);
         mat.emissiveIntensity = 0.2;
         mat.opacity = 0.6;
      } else {
         mat.emissive.setHex(0x000000);
         mat.opacity = 0.4;
      }
    }
  }
}

function updateLabels() {
  const newLabels: typeof labels.value = [];
  if (!container.value) return;
  const w = container.value.clientWidth;
  const h = 450;

  for (const group of ALL_GROUPS) {
    const grpMeshes = meshes[group];
    if (!grpMeshes || grpMeshes.length === 0) continue;

    const firstMesh = grpMeshes[0];
    if (!firstMesh) continue;

    const pos = new THREE.Vector3().setFromMatrixPosition(firstMesh.matrixWorld);
    pos.project(camera);

    const x = (pos.x * 0.5 + 0.5) * w;
    const y = (-pos.y * 0.5 + 0.5) * h;

    if (pos.z < 1) {
      const status = props.muscleGroups[group];
      if (status && status.sets > 0) {
        newLabels.push({
          group, x, y, sets: status.sets,
          color: `#${getLandmarkColor(status.landmark).toString(16).padStart(6, '0')}`
        });
      }
    }
  }
  labels.value = newLabels;
}

function animate() {
  frameId = requestAnimationFrame(animate);
  if (mannequin) mannequin.rotation.y += 0.004; // Even slower, smoother rotation
  renderer.render(scene, camera);
  updateLabels();
}

onMounted(() => {
  init();
});

onUnmounted(() => {
  cancelAnimationFrame(frameId);
  renderer.dispose();
  scene.clear();
});

watch(() => props.muscleGroups, () => updateMaterials(), { deep: true });
</script>

<template>
  <div class="relative w-full h-[450px] select-none overflow-hidden touch-none" ref="container">
    
    <!-- 3D labels with Blueprint Styling -->
    <div 
      v-for="label in labels" 
      :key="label.group"
      class="absolute pointer-events-none transform -translate-x-1/2 -translate-y-1/2 transition-labels z-20"
      :style="{ left: `${label.x}px`, top: `${label.y}px` }"
    >
      <div 
        class="flex flex-col items-center gap-0.5 px-2 py-1 rounded-sm border border-white/5 bg-black/60 backdrop-blur-md shadow-2xl relative"
        :style="{ borderColor: `${label.color}44` }"
      >
        <!-- Data Glow -->
        <div class="absolute inset-x-0 -bottom-px h-px bg-linear-to-r from-transparent via-current to-transparent opacity-50" :style="{ color: label.color }"></div>
        
        <span class="text-[7px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 leading-none">
          {{ label.group }}
        </span>
        <span class="text-[11px] font-mono font-bold leading-none tracking-tighter" :style="{ color: label.color }">
          {{ label.sets }} <span class="text-[7px] opacity-20 font-sans">sets</span>
        </span>
      </div>
    </div>

    <!-- Background Blueprint Grid (Optional Visual Polish) -->
    <div class="absolute inset-0 opacity-10 pointer-events-none z-0">
       <div class="w-full h-full bg-[radial-gradient(circle_at_center,_#22d3ee22_0%,_transparent_70%)]"></div>
    </div>

    <!-- Rotation Status Subtitle -->
    <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-10 pointer-events-none z-10">
       <div class="flex gap-1">
          <div v-for="i in 3" :key="i" class="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" :style="{ animationDelay: `${i * 200}ms` }"></div>
       </div>
       <span class="text-[7px] font-black uppercase tracking-[0.6em]">Anatomical Mapping Active</span>
    </div>
  </div>
</template>

<style scoped>
.transition-labels {
  transition-property: left, top;
  transition-duration: 20ms;
  transition-timing-function: linear;
}

/* Add a scan-line effect for that HUD feel */
.relative::after {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.02), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.02));
  background-size: 100% 2px, 3px 100%;
  pointer-events: none;
  opacity: 0.1;
  z-index: 5;
}
</style>
