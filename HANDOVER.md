# 程序化建築生成器 — 未完成計畫交接文件 (Handover to Next AI Agent)

> **建立日期**：2026-09-30  
> **專案路徑**：`/Users/ken.chen/Desktop/desktop/切圖暫存區/Anti_20260930/`  
> **啟動伺服器**：在 Finder 中對 `啟動建築生成器.command` 按兩下，或執行 `npm run dev`  
> **瀏覽器預覽**：`http://localhost:5173/`  
> **Blender 版本**：5.1.1（路徑：`/Applications/Blender.app/Contents/MacOS/Blender`）  
> **開源授權**：MIT（原專案 `achrefelouafi/BuildingGeneratorThreeJS`）

---

## 一、 專案背景與技術棧

本專案是一套基於 **Three.js + Blender 5.1.1** 的**港式/亞洲程序化建築生成器**，功能參考 [proceduralbuildings.chirostudio.xyz](https://proceduralbuildings.chirostudio.xyz/)。

| 角色 | 技術 |
|:---|:---|
| 3D 模型庫 | 官方開源 `kit.glb`（190 個建築模組）in `public/assets/kit.glb` |
| 前端框架 | Vite + TypeScript（無框架） |
| 3D 渲染 | Three.js (`InstancedMesh` 批次渲染) |
| 控制面板 | Lil-GUI |
| 自動化建模 | Blender 5.1.1 背景無頭模式（`-b -P`）|

---

## 二、 目前已完成的工作

### ✅ 已完成項目

1. **官方旗艦版完整部署**：
   - 已將 `achrefelouafi/BuildingGeneratorThreeJS` 官方開源旗艦版完整複製到本機。
   - 190 個精緻建築零件（鐵窗花、冷氣機、曬衣架、「幸福公寓」霓虹招牌等）均已包含在 `public/assets/kit.glb`（20MB）。
   - 前端可正常啟動並顯示完整港式大樓（已在瀏覽器截圖驗證）。

2. **一鍵雙擊啟動檔（Mac）**：
   - `啟動建築生成器.command`：在 Finder 中雙擊即可自動啟動 Vite 伺服器並開啟瀏覽器。

3. **資源整理套件**：
   - `ProceduralBuilding_Assets_Kit/`：已整理好供其他專案複用的完整資源包，包含 3D 模型、Blender 原始檔、工具腳本與核心演算法參考。

4. **⚡ 效能優化（已修改代碼，TypeScript 編譯通過，但尚未在瀏覽器驗證）**：

   - **`src/main.ts`（第 28 行）**：
     - 已將渲染像素比從 `Math.min(window.devicePixelRatio, 2)` 下修為 `1.0` 作為預設值。
     - 已在 GUI 最頂層新增 `⚡ 效能與畫質 (Performance)` 資料夾，含以下 4 個控制項：
       - `渲染像素比 (Pixel Ratio)`：0.5 ~ 2.0 滑桿，`onChange` 呼叫 `renderer.setPixelRatio(v)` 與 `post.setSize()`。
       - `貼圖解析度 (Texture)`：下拉選單（`Auto / Low 1K / High 2K`），`onChange` 呼叫 `kit.setTextureQuality()`。
       - `後製特效 (PostFX)`：開關，切換 `post.enabled`。
       - `後製抗鋸齒 (MSAA)`：下拉選單（`0 / 1 / 2 / 4`），`onChange` 呼叫 `post.setSamples()`。

   - **`src/postfx.ts`**：
     - 已將 `WebGLRenderTarget` 的 `samples` 從 `4` 下修為 `1`（預設輕量）。
     - 已新增 `public enabled: boolean = true`：當 `enabled = false` 時，直接呼叫 `renderer.render()` 跳過 PostFX。
     - 已新增 `setSamples(samples: number)` 方法：動態更新 MSAA 採樣數並 dispose 舊 target。

   - **`src/kit.ts`**：
     - 已修改 `buildMaterials()` 函式支援 `quality: 'low' | 'high'` 參數。
     - 預設使用 `/textures/low/`（1K 輕量貼圖），高畫質使用 `/textures/high/`（2K 原始貼圖）。
     - 已新增 `public currentQuality: 'low' | 'high' = 'low'` 與 `setTextureQuality(quality)` 方法，可熱更換材質貼圖而無需重新載入 GLB。

   - **`public/textures/`**：
     - 已用 Mac 內建 `sips` 工具自動生成 1K 輕量化版本，存放至 `public/textures/low/`（11 張 1024×1024）。
     - 原始 2K 貼圖備份至 `public/textures/high/`。

---

## 三、 ❌ 尚未驗證與未完成的工作

### 3.1 優先任務：瀏覽器驗證效能優化（最高優先）

**問題背景**：上述所有效能優化代碼的 TypeScript 型別檢查已通過（`npx tsc --noEmit` 返回 exit code 0），但因 Token 用量耗盡，尚未在瀏覽器中實際測試。

**需要驗證的項目**：
- [ ] 重新整理 `http://localhost:5173/`（或重新 `npm run dev`）
- [ ] 確認 GUI 右側面板頂部出現 `⚡ 效能與畫質 (Performance)` 資料夾
- [ ] 確認 `渲染像素比` 滑桿可動，拉到 2.0 時 3D 更清晰（但 GPU 負擔加重）
- [ ] 確認 `貼圖解析度` 切換到 `High (2K - 細緻高清)` 後，建築外牆磚紋等細節明顯提升
- [ ] 確認 `後製特效` 開關可切換，關閉後應更順暢
- [ ] 確認 `後製抗鋸齒 MSAA` 可切換至 4 時，邊緣更平滑

### 3.2 可能的潛在問題（需注意）

1. **`post.setSamples()` 的副作用**：目前 `setSamples` 呼叫了 `this.renderTarget.dispose()` 但沒有重建 target 並重新指定給 composer，這可能造成畫面黑屏。**需要確認或修正**：
   ```typescript
   // src/postfx.ts 的 setSamples 方法可能需要修正為：
   setSamples(samples: number): void {
     if (this.renderTarget.samples === samples) return;
     const size = this.renderer.getDrawingBufferSize(new Vector2());
     this.renderTarget.dispose();
     this.renderTarget = new WebGLRenderTarget(size.x, size.y, {
       type: HalfFloatType,
       samples,
     });
     this.composer.renderTarget1 = this.renderTarget;
     this.composer.renderTarget2 = this.renderTarget.clone();
   }
   ```

2. **`setTextureQuality` 的 `emissive` 屬性缺漏**：`buildMaterials` 中 `floor` 材質有 `emissive: new Color(0xffffff)`，但 `setTextureQuality` 中的替換貼圖並未重設 `emissive`，確認材質能正常發光顯示。

3. **貼圖路徑確認**：確認 `/textures/low/floor_Base_Emissive.png` 存在，因 `floor_Base_Emissive.png` 在原始貼圖中是 `floor_Base_Emissive.png`，與 `floor_Metallic.png` 格式需要一致（1K 版本應已生成，但需確認）。

---

## 四、 修改過的檔案摘要

| 檔案 | 修改內容 | 狀態 |
|:---|:---|:---|
| `src/main.ts` | 像素比預設改為 1.0；GUI 新增效能面板 | ✅ 已改，待瀏覽器驗證 |
| `src/postfx.ts` | MSAA samples 預設改為 1；加入 `enabled` 與 `setSamples()` | ✅ 已改，待驗證（`setSamples` 可能需修正） |
| `src/kit.ts` | `buildMaterials` 加入 quality 參數；新增 `setTextureQuality()` | ✅ 已改，待瀏覽器驗證 |
| `public/textures/low/` | 11 張 1K 輕量化 PNG 貼圖（已生成） | ✅ 已生成 |
| `public/textures/high/` | 11 張 2K 原始 PNG 貼圖（備份） | ✅ 已備份 |
| `src/BuildingGenerator.ts` | （我們早期自製版本，**已被官方版本取代，請忽略**） | ⚠️ 廢棄 |
| `src/Config.ts` | （我們早期自製版本，**已被官方版本取代，請忽略**） | ⚠️ 廢棄 |
| `src/style.css` | （我們早期自製版本，**已被官方版本取代，請忽略**） | ⚠️ 廢棄 |

---

## 五、 後續開發建議（第二階段）

第一階段效能優化驗證完成後，可進行以下第二階段功能：

### 5.1 「自動貼圖距離 LOD」（對應 `Auto (Distance)` 選項）
目前 `Auto (Distance)` 選項選中後不會觸發任何動作。**預期實作方式**：
- 在渲染迴圈中，依據 `controls.target.distanceTo(camera.position)` 動態切換：
  - 距離 > 30：`kit.setTextureQuality('low')`
  - 距離 ≤ 30：`kit.setTextureQuality('high')`

```typescript
// 在 renderer.setAnimationLoop 內部加入：
if (perfState.textureMode === 'Auto (Distance)') {
  const dist = controls.target.distanceTo(camera.position);
  const targetQ: 'low' | 'high' = dist > 30 ? 'low' : 'high';
  kit.setTextureQuality(targetQ);
}
```

### 5.2 Blender 自動化腳本（`scripts/generate_kit.py`）
目前 `scripts/generate_kit.py` 是我們早期自製的基礎版腳本（只有 8 個簡單幾何體），已被官方 `kit.glb` 取代。
若需要未來在 Blender 中修改模型並重新匯出，應使用官方工具：
```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  procedural-hong-kong-building/source/procedural_building.blend \
  --python tools/export_kit.py -- public/assets/kit.glb public/assets/kit_manifest.json
```

### 5.3 其他可擴充功能
- [ ] 貼圖批次轉換為 **WebP 格式**（體積更小、速度更快，可替代 PNG）
- [ ] 為 `啟動建築生成器.command` 增加自動安裝依賴邏輯（第一次執行時自動 `npm install`）
- [ ] 新增「截圖下載」按鈕（呼叫 `renderer.domElement.toDataURL()`）

---

## 六、 ★ 第二階段開發計畫：生活感與街景細化（完整交接）

> **前提**：第二階段必須在第一階段效能優化驗證無誤後才開始。  
> **核心策略**：所有第二階段的模型零件都**已存在於** `public/assets/kit.glb` 中！  
> 不需要重新建模，只需在 `src/generator.ts` 中新增對應集合名稱的呼叫邏輯，並在 `src/main.ts` 的 GUI 中新增對應控制項即可。

---

### 6.1 `kit.glb` 中已有的生活感零件對照表

所有零件集合名稱來自 `public/assets/kit_manifest.json`（已確認存在）：

| 視覺效果 | `kit_manifest.json` 集合名稱 | 現有 GUI 參數 |
|:---|:---|:---|
| 冷氣室外機 | `ac.001`（6 個變體） | `params.acUnit`（0 ~ 1 機率） |
| 冷媒排水管線 | `AC WIRE.001`（5 個變體） | 跟隨 `acUnit` 一起顯示 |
| 外推曬衣架與彩色衣服 | `cloth lines WITH CLOTHES.001` | `params.clothlineProbability` |
| 無衣曬衣竿（空架） | `cloth lines.001` | 跟隨 `clothlineProbability` |
| 窗簾 | `CURTAINS.001` | `params.curtainClose` |
| 防盜鐵窗花 | `window guard.001`（多種圖案） | `params.windowType` |
| 鋼窗框（鋼窗系列） | `OBJ[steel window.001]`、`OBJ[steel frame.001]` | `params.windowType` |
| 木窗框（木窗系列） | `OBJ[wood window.001]`、`OBJ[wood frame.001]` | `params.windowType` |
| 一樓店面 | `storefront`（多種店型：包子/茶葉/烟酒/維修） | `params.closedOpenStore` |
| 一樓店面招牌（正面） | `store_sign`（發光廣告牌，多款） | `params.storeSign` |
| 一樓店面懸掛招牌 | `store_sign_hanging`（側掛式招牌） | `params.storeSign` |
| 一樓鐵捲門（拉下） | `shutter`（防盜鐵捲門） | `params.closedOpenStore`（趨近 0） |
| 一樓店面屋簷 | `store_roof` (`OBJ[store_roof]`) | `params.roofOnStore` |
| 店鋪內部陳設 | `storeinside`（商品貨架、冰箱） | `params.closedOpenStore` |
| 頂樓「幸福公寓」霓虹招牌 | `old store_sign`（含鋼骨支架） | `params.storeSign` |
| 頂樓不銹鋼圓筒水塔 | `watertank`（3 個大小變體） | `params.objectOnRoof` |
| 屋頂設施 | `roof`（機房、排氣管、電視天線） | `params.objectOnRoof` |
| 屋頂轉角 | `roofcorner` | 自動配置 |
| 屋頂配件（零散） | `roof_prop` | `params.objectOnRoof` |
| 地面人行道物件 | `prop_groud`（消防栓、垃圾桶、路障） | `params.objectOnGround` |
| 地面街邊物件 | `prop_front`（機車、腳踏車） | `params.objectOnGround` |
| 店門前裝飾 | `prop_store`（盆栽、招牌架） | `params.objectOnGround` |
| 街道路燈（地面） | `lightsground`（復古弧形路燈） | （尚未有 GUI 控制項） |
| 建築外露電線 | `wire`（隨機懸掛電線） | （尚未有 GUI 控制項） |
| 建築配電箱區域 | `eletricarea` | （尚未有 GUI 控制項） |
| 側牆廣告牆 | `side_wall`（老舊招貼廣告） | 自動配置 |

---

### 6.2 第二階段 GUI 新增項目規格

在 `src/main.ts` 的現有 GUI 架構中，新增以下兩個資料夾（插入在 `fBuild.close()` 之後）：

#### 新增資料夾 1：`🏮 街道與地景 (Street & Environment)`
```typescript
// 在 src/main.ts 中新增（緊接在 fBuild.onChange 之後）
const streetParams = {
  enableStreetLamps: true,   // 控制 lightsground 集合的顯示
  enableWires: true,         // 控制 wire 集合的顯示
  enableElectric: true,      // 控制 eletricarea 集合的顯示
};

const fStreet = gui.addFolder("🏮 街道與地景 (Street)");
fStreet.add(streetParams, "enableStreetLamps").name("復古路燈").onChange(() => regenerate());
fStreet.add(streetParams, "enableWires").name("外露電線").onChange(() => regenerate());
fStreet.add(streetParams, "enableElectric").name("配電箱").onChange(() => regenerate());
fStreet.close();
```

#### 新增資料夾 2：`🌙 夜晚模式 (Night Mode)` 
（與現有 `lighting` 資料夾分開，專門控制發光元件）
```typescript
const nightParams = {
  enableNeonSign: true,   // 控制頂樓「幸福公寓」霓虹招牌發光強度
  neonColor: '#ff3333',   // 霓虹燈管顏色（紅色預設）
  signEmissive: 1.0,      // 店面招牌自發光強度
};

const fNight = gui.addFolder("🌙 夜晚燈光 (Night Lights)");
fNight.add(nightParams, "enableNeonSign").name("頂樓霓虹招牌");
fNight.addColor(nightParams, "neonColor").name("霓虹顏色");
fNight.add(nightParams, "signEmissive", 1, 50, 1).name("招牌亮度").onChange((v: number) => {
  kit.setFloorEmissive(v);
});
fNight.close();
```

---

### 6.3 `generator.ts` 中已存在的生成邏輯說明

**重要**：`src/generator.ts` 已對所有集合有完整的生成邏輯，不需要大幅改寫。  
目前的 `BuildingParams`（在 `src/params.ts`）已對應以下 14 個參數與集合：

```typescript
// src/params.ts — 現有的 18 個 Blender 節點參數（已完整映射）
interface BuildingParams {
  floor: number;                  // 樓層數
  length: number;                 // 進深開間數
  width: number;                  // 正面開間數
  acUnit: number;                 // 0~1 → 冷氣機 (ac.001) 密度
  roofProbability: number;        // 0~1 → 店面遮雨棚 (store_roof) 機率
  clothlineProbability: number;   // 0~1 → 曬衣架 (cloth lines.001) 密度
  windowType: number;             // 0~1 → 窗型混合比（0=木窗, 1=鋼窗）
  windowOpenAmount: number;       // 0~1 → 窗戶開啟程度
  curtainClose: number;           // 0~1 → 窗簾關閉程度
  closedOpenStore: number;        // 0~1 → 店面開門比率（0=全關鐵捲門）
  roofOnStore: number;            // 0~1 → 頂樓招牌出現率
  objectOnGround: number;         // 0~1 → 地面街道物件密度
  storeSign: number;              // 0~1 → 招牌出現率（含幸福公寓霓虹）
  objectOnRoof: number;           // 0~1 → 頂樓設施密度（水塔、機房）
  randomise: number;              // 0~1000 → 隨機種子
}
```

**第二階段只需新增的參數**（目前 generator.ts 尚未暴露）：
- `enableStreetLamps`：控制 `lightsground` 集合顯示/隱藏
- `enableWires`：控制 `wire` 集合顯示/隱藏
- `enableElectric`：控制 `eletricarea` 集合顯示/隱藏

---

### 6.4 第二階段實作步驟清單

- [ ] **步驟 1**：先驗證第一階段效能 GUI（`⚡ 效能與畫質`）在瀏覽器中正常運作
- [ ] **步驟 2**：在 `src/params.ts` 的 `BuildingParams` 介面中新增 `enableStreetLamps / enableWires / enableElectric` 3 個布林值欄位
- [ ] **步驟 3**：在 `src/generator.ts` 中找到 `lightsground`、`wire`、`eletricarea` 的使用位置，加入條件判斷（`if (params.enableStreetLamps)`）
- [ ] **步驟 4**：在 `src/main.ts` 的 GUI 中新增 `🏮 街道與地景` 與 `🌙 夜晚燈光` 資料夾（參考 6.2 的代碼範本）
- [ ] **步驟 5**：在夜晚 lighting 模式下，測試「幸福公寓」霓虹招牌與一樓店面燈箱的自發光效果
- [ ] **步驟 6**：可選 — 新增「截圖下載」按鈕，呼叫 `renderer.domElement.toDataURL('image/png')` 並以 `<a>` 元素觸發下載

---

## 七、 快速啟動指令

```bash
# 啟動開發預覽（已安裝依賴）
cd /Users/ken.chen/Desktop/desktop/切圖暫存區/Anti_20260930
npm run dev
# 瀏覽器打開 http://localhost:5173/

# TypeScript 型別檢查（目前通過，exit code 0）
npx tsc --noEmit

# 重新生成 GLB（使用 Blender 5.1.1 背景模式）
/Applications/Blender.app/Contents/MacOS/Blender --background \
  procedural-hong-kong-building/source/procedural_building.blend \
  --python tools/export_kit.py -- public/assets/kit.glb public/assets/kit_manifest.json
```
