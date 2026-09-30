import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BuildingConfig } from './Config';

interface PartData {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

export class BuildingGenerator {
  private scene: THREE.Scene;
  private kitParts: Map<string, PartData> = new Map();
  private instancedMeshes: Map<string, THREE.InstancedMesh> = new Map();
  private instanceCounts: Map<string, number> = new Map();
  private maxInstances = 2000;
  private buildingGroup = new THREE.Group();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.buildingGroup);
  }

  /**
   * 載入 Blender 匯出的 GLB 模組庫
   */
  public async loadKit(url: string): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);

    // 遍歷 GLTF 場景，擷取具名的 Mesh 零件
    gltf.scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        // 如果名稱包含後綴（如 Cube.001），透過其 parent 或自訂名稱提取
        const name = mesh.name || mesh.parent?.name || 'Unknown';
        
        // 確保材質啟用正確的陰影與渲染選項
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => this.tuneMaterial(m));
        } else {
          this.tuneMaterial(mesh.material);
        }

        // 以乾淨的名稱儲存
        const cleanName = this.normalizeName(name);
        if (cleanName && !this.kitParts.has(cleanName)) {
          this.kitParts.set(cleanName, {
            geometry: mesh.geometry.clone(),
            material: Array.isArray(mesh.material) 
              ? mesh.material.map(m => m.clone()) 
              : mesh.material.clone()
          });
        }
      }
    });

    console.log('[BuildingGenerator] 已載入零件清單:', Array.from(this.kitParts.keys()));
    this.initInstancedMeshes();
  }

  private normalizeName(rawName: string): string | null {
    const knownKeys = [
      'Wall_Solid',
      'Wall_Window',
      'Shop_Door',
      'Shop_Window',
      'Pillar_Corner_Ground',
      'Pillar_Corner',
      'Floor_Slab',
      'Roof_Trim'
    ];
    for (const key of knownKeys) {
      if (rawName.includes(key)) return key;
    }
    return null;
  }

  private tuneMaterial(mat: THREE.Material): void {
    if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
      const std = mat as THREE.MeshStandardMaterial;
      if (std.name.includes('Glass')) {
        std.transparent = true;
        std.opacity = 0.5;
        std.roughness = 0.05;
        std.metalness = 0.9;
      }
      if (std.name.includes('Sign')) {
        std.emissive = new THREE.Color(0x334466);
        std.emissiveIntensity = 0.8;
      }
    }
  }

  /**
   * 初始化所有 InstancedMesh 池
   */
  private initInstancedMeshes(): void {
    // 清除舊有的
    this.buildingGroup.clear();
    this.instancedMeshes.clear();

    for (const [name, part] of this.kitParts.entries()) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, this.maxInstances);
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      this.instancedMeshes.set(name, im);
      this.buildingGroup.add(im);
    }
  }

  /**
   * 簡單的擬隨機數產生器 (以 seed 為基底)
   */
  private pseudoRandom(seed: number, index: number): number {
    const x = Math.sin(seed * 999 + index * 777) * 10000;
    return x - Math.floor(x);
  }

  /**
   * 根據設定配置大樓幾何矩陣
   */
  public generate(config: BuildingConfig): void {
    // 重設計數
    for (const name of this.instancedMeshes.keys()) {
      this.instanceCounts.set(name, 0);
    }

    const {
      width,
      depth,
      floors,
      groundFloorHeight,
      floorHeight,
      bayWidth,
      cornerMargin,
      seed
    } = config.building;

    // 計算正面 (X 方向) 與側面 (Z 方向) 開間數量
    const nx = Math.max(1, Math.round((width - cornerMargin * 2) / bayWidth));
    const nz = Math.max(1, Math.round((depth - cornerMargin * 2) / bayWidth));

    const actualSpanX = nx * bayWidth;
    const actualSpanZ = nz * bayWidth;
    const halfX = actualSpanX / 2;
    const halfZ = actualSpanZ / 2;

    const dummy = new THREE.Object3D();
    let elemIndex = 0;

    const addInstance = (partName: string, pos: THREE.Vector3, rotY: number = 0, scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1)) => {
      const im = this.instancedMeshes.get(partName);
      if (!im) return;
      const count = this.instanceCounts.get(partName) || 0;
      if (count >= this.maxInstances) return;

      dummy.position.copy(pos);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.copy(scale);
      dummy.updateMatrix();

      im.setMatrixAt(count, dummy.matrix);
      this.instanceCounts.set(partName, count + 1);
    };

    // ==========================================
    // 1. 一樓 (Ground Floor) 商業店面
    // ==========================================
    const groundY = 0;

    // 一樓四角柱
    addInstance('Pillar_Corner_Ground', new THREE.Vector3(-halfX, groundY, -halfZ));
    addInstance('Pillar_Corner_Ground', new THREE.Vector3(halfX, groundY, -halfZ));
    addInstance('Pillar_Corner_Ground', new THREE.Vector3(halfX, groundY, halfZ));
    addInstance('Pillar_Corner_Ground', new THREE.Vector3(-halfX, groundY, halfZ));

    // 正面 (南側, Face +Z)
    for (let i = 0; i < nx; i++) {
      elemIndex++;
      const x = -halfX + (i + 0.5) * bayWidth;
      const isDoor = (i === Math.floor(nx / 2)) || (this.pseudoRandom(seed, elemIndex) < 0.25);
      const part = isDoor ? 'Shop_Door' : 'Shop_Window';
      addInstance(part, new THREE.Vector3(x, groundY, halfZ), 0);
    }

    // 背面 (北側, Face -Z)
    for (let i = 0; i < nx; i++) {
      elemIndex++;
      const x = halfX - (i + 0.5) * bayWidth;
      const isDoor = this.pseudoRandom(seed, elemIndex) < 0.2;
      const part = isDoor ? 'Shop_Door' : 'Shop_Window';
      addInstance(part, new THREE.Vector3(x, groundY, -halfZ), Math.PI);
    }

    // 右面 (東側, Face +X)
    for (let j = 0; j < nz; j++) {
      elemIndex++;
      const z = -halfZ + (j + 0.5) * bayWidth;
      const isDoor = this.pseudoRandom(seed, elemIndex) < 0.2;
      const part = isDoor ? 'Shop_Door' : 'Shop_Window';
      addInstance(part, new THREE.Vector3(halfX, groundY, z), -Math.PI / 2);
    }

    // 左面 (西側, Face -X)
    for (let j = 0; j < nz; j++) {
      elemIndex++;
      const z = halfZ - (j + 0.5) * bayWidth;
      const isDoor = this.pseudoRandom(seed, elemIndex) < 0.2;
      const part = isDoor ? 'Shop_Door' : 'Shop_Window';
      addInstance(part, new THREE.Vector3(-halfX, groundY, z), Math.PI / 2);
    }

    // ==========================================
    // 2. 標準樓層 (Upper Floors)
    // ==========================================
    for (let f = 1; f < floors; f++) {
      const currentY = groundFloorHeight + (f - 1) * floorHeight;

      // 轉角柱
      addInstance('Pillar_Corner', new THREE.Vector3(-halfX, currentY, -halfZ));
      addInstance('Pillar_Corner', new THREE.Vector3(halfX, currentY, -halfZ));
      addInstance('Pillar_Corner', new THREE.Vector3(halfX, currentY, halfZ));
      addInstance('Pillar_Corner', new THREE.Vector3(-halfX, currentY, halfZ));

      // 正面 (南, Face +Z)
      for (let i = 0; i < nx; i++) {
        elemIndex++;
        const x = -halfX + (i + 0.5) * bayWidth;
        const useWin = this.pseudoRandom(seed, elemIndex) < config.windows.windowRatio;
        addInstance(useWin ? 'Wall_Window' : 'Wall_Solid', new THREE.Vector3(x, currentY, halfZ), 0);
      }

      // 背面 (北, Face -Z)
      for (let i = 0; i < nx; i++) {
        elemIndex++;
        const x = halfX - (i + 0.5) * bayWidth;
        const useWin = this.pseudoRandom(seed, elemIndex) < (config.windows.windowRatio * 0.7);
        addInstance(useWin ? 'Wall_Window' : 'Wall_Solid', new THREE.Vector3(x, currentY, -halfZ), Math.PI);
      }

      // 右面 (東, Face +X)
      for (let j = 0; j < nz; j++) {
        elemIndex++;
        const z = -halfZ + (j + 0.5) * bayWidth;
        const useWin = this.pseudoRandom(seed, elemIndex) < config.windows.windowRatio;
        addInstance(useWin ? 'Wall_Window' : 'Wall_Solid', new THREE.Vector3(halfX, currentY, z), -Math.PI / 2);
      }

      // 左面 (西, Face -X)
      for (let j = 0; j < nz; j++) {
        elemIndex++;
        const z = halfZ - (j + 0.5) * bayWidth;
        const useWin = this.pseudoRandom(seed, elemIndex) < config.windows.windowRatio;
        addInstance(useWin ? 'Wall_Window' : 'Wall_Solid', new THREE.Vector3(-halfX, currentY, z), Math.PI / 2);
      }
    }

    // ==========================================
    // 3. 頂樓天台與女兒牆 (Roof & Parapets)
    // ==========================================
    const roofY = groundFloorHeight + (floors - 1) * floorHeight;

    // 天台地板鋪設
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x = -halfX + (i + 0.5) * bayWidth;
        const z = -halfZ + (j + 0.5) * bayWidth;
        addInstance('Floor_Slab', new THREE.Vector3(x, roofY, z));
      }
    }

    // 女兒牆 (四周圍繞)
    for (let i = 0; i < nx; i++) {
      const x = -halfX + (i + 0.5) * bayWidth;
      addInstance('Roof_Trim', new THREE.Vector3(x, roofY, halfZ), 0);
      addInstance('Roof_Trim', new THREE.Vector3(x, roofY, -halfZ), Math.PI);
    }
    for (let j = 0; j < nz; j++) {
      const z = -halfZ + (j + 0.5) * bayWidth;
      addInstance('Roof_Trim', new THREE.Vector3(halfX, roofY, z), -Math.PI / 2);
      addInstance('Roof_Trim', new THREE.Vector3(-halfX, roofY, z), Math.PI / 2);
    }

    // ==========================================
    // 4. 更新 GPU 矩陣與顯示數量
    // ==========================================
    for (const [name, im] of this.instancedMeshes.entries()) {
      const count = this.instanceCounts.get(name) || 0;
      im.count = count;
      im.instanceMatrix.needsUpdate = true;
    }
  }
}
