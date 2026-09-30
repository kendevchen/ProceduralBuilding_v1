# 程序化建築共用資源套件 (Procedural Building Assets Kit)

本資料夾彙整了來自開源專案 **[BuildingGeneratorThreeJS](https://github.com/achrefelouafi/BuildingGeneratorThreeJS)**（作者：**Achref El Ouafi / Chiro Studio**，採 **MIT 開源授權**）的核心 3D 資源、Blender 原始工程檔、匯出工具與 TypeScript 生成演算法，便於在其他專案（如 Three.js、React Three Fiber、Babylon.js、Unity 或 Unreal Engine）中直接複用。

---

## 一、 目錄結構總覽

```text
ProceduralBuilding_Assets_Kit/
├── README.md                      # 本說明文件
├── LICENSE                        # MIT 開源授權聲明
│
├── 3d_models/                     # 【3D 模組匯出包】供 Web 或遊戲引擎直接載入
│   ├── kit.glb                    # 包含 190 個精緻零件的高效能 GLB 模型包 (約 20 MB)
│   └── kit_manifest.json          # 零件分類清單與集合對應索引檔
│
├── blender_source/                # 【Blender 原始檔】供 3D 設計師編輯與擴充
│   ├── procedural_building.blend  # 包含完整幾何節點 (Geometry Nodes) 的原始檔 (約 21 MB)
│   └── textures/                  # 建築材質、老舊污漬、窗框與招牌等高解析度貼圖
│
├── tools/                         # 【自動化工具】Blender 背景匯出與除錯腳本
│   ├── export_kit.py              # 從 .blend 自動化解析集合並匯出 kit.glb 的 Python 腳本
│   └── dump_blend.py              # 分析 .blend 內部節點結構與階層工具
│
└── core_logic_reference/          # 【核心演算法參考】TypeScript 移植實作
    ├── generator.ts               # 大樓開間、長寬高、隨機窗型與住戶物件配置演算法
    ├── kit.ts                     # InstancedMesh 載入器、材質管理與批次渲染池
    └── rng.ts                     # 與 Blender 幾何節點 100% 對齊的擬隨機數演算法
```

---

## 二、 核心資產內容說明

### 1. `3d_models/kit.glb`（190 個獨立模組）
此單一檔案打包了整棟大樓所需的所有零組件，透過名稱索引（命名格式為 `COL[集合名稱][索引]` 與 `OBJ[物件名稱]`），主要分類包含：
* **一樓商鋪系統（Ground Floor Shops）**：
  * `storefront`：包含「包子」、「茶葉」、「烟酒」、「手機維修」等不同風格的落地櫥窗與門楣。
  * `shutter`：不同開合程度的防盜金屬鐵捲門。
  * `store_sign`、`store_sign_hanging`：騎樓懸掛與門頭發光招牌。
  * `storeinside`：店鋪內部陳設與貨架展示幾何體。
* **標準層外牆與窗戶（Facade & Windows）**：
  * `wall.001`、`side_wall`、`corner`：水泥外牆、側牆防火牆與轉角包邊柱。
  * `steel window`、`wood window`：鋼窗、木窗與百葉窗變體。
  * `window guard.001`：老舊港式公寓防盜鐵窗花（Burglar bars）。
* **住戶生活氣息加建物（Residents' Additions）**：
  * `ac.001`、`AC WIRE.001`：冷氣室外機與懸掛冷媒排水管。
  * `cloth lines.001`、`cloth lines WITH CLOTHES.001`：外推式曬衣竿與五顏六色的晾曬衣物。
  * `CURTAINS.001`：窗簾。
* **頂樓設施與地標（Rooftop System）**：
  * `old store_sign`：頂樓大型紅色發光「**幸福公寓**」霓虹字與鋼骨架。
  * `watertank`：不銹鋼圓筒水塔與支架。
  * `roof`、`roofcorner`、`guardrail`：天台女兒牆與通風設備。
* **街道與環境物件（Street Props）**：
  * `lightsground`：復古弧形街燈。
  * `prop_groud`、`prop_store`：消防栓、人行道收邊石等。

---

## 三、 如何在其他專案中使用？

### 方案 A：在其他 Three.js / Web 專案中載入
1. 將 `3d_models/kit.glb` 複製到您專案的公開靜態目錄（如 `public/assets/kit.glb`）。
2. 使用 `three/examples/jsm/loaders/GLTFLoader` 載入：
   ```typescript
   import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

   const loader = new GLTFLoader();
   loader.load('/assets/kit.glb', (gltf) => {
     // 遍歷所有子物件，按名稱建立 InstancedMesh 或是單獨擺放
     gltf.scene.traverse((child) => {
       if (child.isMesh) {
         console.log('取得模組:', child.name, child.geometry);
       }
     });
   });
   ```
3. 參考 `core_logic_reference/` 內的程式碼：
   - 複製 `rng.ts`：確保隨機分發窗戶與冷氣時具有確定性種子（Seed）。
   - 參考 `generator.ts`：直接借鑑其開間排版與矩陣計算邏輯。

---

### 方案 B：在 Blender 5.1.1 中編輯模型並重新匯出
如果您需要修改 3D 造型、增加新的店鋪招牌或調整材質：
1. 使用 **Blender 5.1.1** 打開 `blender_source/procedural_building.blend`。
2. 在對應的集合（如 `storefront`、`ac.001`、`store_sign`）中新增或修改模型。
3. 編輯完成並存檔後，在終端機中執行自動化匯出指令（需替換您的 Blender 執行檔路徑）：
   ```bash
   /Applications/Blender.app/Contents/MacOS/Blender --background blender_source/procedural_building.blend --python tools/export_kit.py -- 3d_models/kit.glb 3d_models/kit_manifest.json
   ```
4. 腳本會在數秒內將所有集合重新打包並產生全新的 `kit.glb` 與 `kit_manifest.json`！

---

## 四、 開源授權條款（License）

本套件之模型、程式碼與幾何節點架構源自 **Achref El Ouafi (Chiro Studio)** 之開源專案，依據 **MIT License** 釋出：
* 您可以自由地在商業專案、個人專案、遊戲開發或研究中免費使用、修改與重新分發。
* 使用時請保留原始作者之版權與許可聲明。
