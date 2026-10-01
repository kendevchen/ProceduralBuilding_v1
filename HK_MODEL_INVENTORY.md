# 港式模型物件清單

> 整理日期：2026-10-01 ・ 範圍：港式大樓專案（`src/`、`public/`）與道路城市系統（`road-system/`）
> 資源庫：`ProceduralBuilding_Assets_Kit/`（來源 achrefelouafi/BuildingGeneratorThreeJS，MIT）

## 一、結論

| 類別 | 數量 | 說明 |
|---|---|---|
| **源自資源庫的零件** | 188 個（37 個集合 + 5 個物件），共 51,385 個三角形 | 專案的 `public/assets/kit.glb` 與資源庫的 `3d_models/kit.glb` **逐位元組相同**；manifest 和 `.blend` 也相同 |
| 　其中實際顯示的 | 183 個 | 預設參數與 475 組參數掃描下，都會被放置並看得到 |
| 　其中未使用的 | **5 個**（`lights.001` ×3、`lightsground` ×2） | 都是 Blender 燈光物件，**沒有任何幾何**，網頁上看不到 |
| **程式碼生成的 3D 模型** | 道路城市系統全部 + 建築專案的人行道、行道樹、頂樓招牌、天空 | 見第四節 |
| **已不再使用的早期自製模型** | 8 件（`public/models/building_kit.glb`） | 由 `scripts/generate_kit.py` 用 Blender 腳本生成，從未被載入 |

**判定方式**：從 GLB 讀出全部零件與三角形數；用 `generateBuilding()` 加上 `waterTankPlacements()`，跑 475 組參數（300 個隨機種子，加上各機率參數的 0 / 0.25 / 0.5 / 0.75 / 1，加上 5 種大小）統計哪些零件被放置；`.blend` 用 Blender 5.1.1 無頭模式逐一列出集合與物件。

### 程式碼來源對照（資源庫 `core_logic_reference/` ↔ 專案 `src/`）

| 檔案 | 狀態 |
|---|---|
| `generator.ts`（排列演算法）、`rng.ts`（隨機數） | **與資源庫逐位元組相同**，是原作者的移植，我們沒有修改 |
| `kit.ts`（零件載入與材質） | **我們修改過**：材質改由貼圖重建、1K／2K 貼圖自動切換與釋放、乾燥材質（雨天不弄濕室內）、積雪殼 |

---

## 二、源自資源庫的零件（kit.glb，188 個）

零件命名：`COL[集合名][索引]`、`OBJ[物件名]`。「款式」是該集合內的零件數。

### 外牆與窗戶（59 款）

| 集合 | 款式 | 三角形/款 | 用途（依 `generator.ts`） |
|---|---|---|---|
| `wall.001` | 2 | 16 | 每格窗洞的牆面 |
| `window guard.001` | 3 | 96 | 防盜鐵窗花，款式跟牆面配對 |
| `OBJ[steel frame.001]`、`OBJ[steel window.001]` | 1 + 1 | 64 / 34 | 鋼窗框、窗扇（每格 4 扇） |
| `steel window top preset.001` | 19 | 68–150 | 鋼窗上方氣窗 |
| `OBJ[wood frame.001]`、`OBJ[wood window.001]` | 1 + 1 | 112 / 42 | 木窗框、窗扇 |
| `window wood top preset.001` | 18 | 84–166 | 木窗上方氣窗 |
| `CURTAINS.001` | 2 | 12 | 窗簾（每格左右各一） |
| `ROOMS.001` | 9 | 10 | 窗後的室內 |
| `corner` | 1 | 4 | 轉角柱 |
| `side_wall` | 1 | 2 | 側面（B 面）第 0 欄的實牆 |

### 住戶加建物（31 款）

| 集合 | 款式 | 三角形/款 | 用途 |
|---|---|---|---|
| `ac.001` | 12 | 56–180 | 冷氣室外機 |
| `AC WIRE.001` | 8 | 152–320 | 冷媒管線（跟冷氣一起放） |
| `cloth lines.001` | 3 | 104–248 | 空曬衣架 |
| `cloth lines WITH CLOTHES.001` | 5 | 608–958 | 掛衣服的曬衣架 |
| `roof.002` | 3 | 88–754 | 窗上遮雨棚 |

### 一樓與街面（63 款）

| 集合 | 款式 | 三角形/款 | 用途 |
|---|---|---|---|
| `groud_front` / `ground_back` / `groud side wall` / `ground_corner` | 4 / 1 / 1 / 1 | 54–206 / 56 / 14 / 34 | 一樓正面、背面、側面、轉角的地面層 |
| `storefront` | 4 | 64–82 | 開門店面（包子、茶葉、烟酒、手機維修…） |
| `storeinside` | 4 | 10 | 店內陳設 |
| `shutter` | 4 | 48 | 拉下的鐵捲門（關門店面） |
| `store_sign` / `store_sign_hanging` | 7 / 6 | 18–28 / 44–52 | 門頭招牌、懸掛招牌 |
| `old store_sign` | 2 | 28 | **關門店面**的舊招牌（約 0.93 × 0.22 m，不是頂樓招牌） |
| `OBJ[store_roof]` | 1 | 58 | 店面遮雨棚 |
| `prop_front` / `prop_groud` / `prop_store` | 9 / 7 / 5 | 29–1368 / 62–474 / 26–352 | 門前雜物（機車、垃圾桶、桌椅…） |
| `wire` | 4 | 240–424 | 懸掛電線 |
| `eletricarea` | 3 | 798–1266 | 後巷配電區 |

### 護欄與屋頂（30 款）

| 集合 | 款式 | 三角形/款 | 用途 |
|---|---|---|---|
| `guardrail front` / `guardrail back` / `guardrailside` | 4 / 1 / 1 | 12–34 / 12 / 12 | 女兒牆（正面、背面、側面） |
| `roofcorner` | 1 | 22 | 屋頂轉角 |
| `roof` | 1 | 2 | 屋頂地面片 |
| `roof_prop` | 19 | 234–3300 | 屋頂雜物（最重的零件，3,300 個三角形） |
| `watertank` | 3 | 208 | 水塔，**原圖沒有放，由我們的 `streetlife.ts` 補放** |

### 燈光（5 款，無幾何）

| 集合 | 款式 | 狀態 |
|---|---|---|
| `lights.001` | 3 | 從未被放置；是 Blender 燈光物件，0 三角形 |
| `lightsground` | 2 | 每間開門店面都會放置，但是 Blender 燈光物件，0 三角形，網頁上看不到 |

> **更正舊文件**：`HANDOVER.md` 把 `lightsground` 寫成「復古弧形路燈」、把 `old store_sign` 寫成頂樓「幸福公寓」招牌，兩者都不正確。

---

## 三、資源庫中尚未使用的資源

### 1. `.blend` 內沒有匯出、程式也沒用到的東西

`procedural_building.blend`（Blender 5.1.1）共 169 個集合：37 個匯出；128 個是這些集合底下的個別款式；另有 4 個獨立集合，其中 `floor_preset`、`groud_roof_preset` 是被匯出集合用實例引用的預設，匯出腳本會展開，所以有用到。

| 物件 | 內容 | 狀態 |
|---|---|---|
| **`Cube`** | 約 14.6 萬個三角形、10.1 萬個頂點，尺寸 8.11 × 4.79 × 7.9 m，材質 building / glass | **未匯出、程式沒用**。尺寸與預設參數（7 × 3 × 6 層）的大樓相近，推測是已套用的示範大樓（這是推測，沒有逐項驗證） |
| `Cube.001` | 2 m 立方體，掛著 `build system` 幾何節點修改器，位置 x = −9 | 節點圖的載體。它的輸入值就是 `params.ts` 的預設值；節點圖本身已用 TypeScript 重寫在 `generator.ts`，不是直接執行 |
| 節點群組 `Auto Smooth` | Blender 平滑法線，665 處使用 | 只在 Blender 內有用，網頁不需要 |
| `Camera`、`Collection.001` | 相機、空集合 | 與模型無關 |

### 2. 貼圖

| 項目 | 狀態 |
|---|---|
| `internal_ground_ao_texture.jpeg`（20 KB） | **從未載入**，`kit.ts` 不使用，`.blend` 的影像清單裡也沒有它。目前複製在 5 個資料夾裡 |
| `floor_Base_Emissive.png` | 專案有、也有載入；但**資源庫的 `blender_source/textures/` 缺少這一張**（原作者 repo 有）。資源庫的貼圖不完整 |
| `public/textures/` 根目錄的 12 張 PNG（約 13 MB） | **不會被載入**。程式只讀 `low/` 與 `high/`，而根目錄與 `high/` 12 張逐位元組相同，純重複 |
| `procedural-hong-kong-building/textures/`（11 張） | 與 `public/textures/` 同內容，重複，不會被載入 |

### 3. 早期自製的零件與程式（已棄用，仍在 repo 內）

| 檔案 | 內容 |
|---|---|
| `public/models/building_kit.glb`（28 KB） | 8 個基本幾何體：`Wall_Solid`(12 三角形)、`Wall_Window`(72)、`Shop_Door`(72)、`Shop_Window`(48)、`Pillar_Corner`(12)、`Pillar_Corner_Ground`(12)、`Floor_Slab`(12)、`Roof_Trim`(12) |
| `scripts/generate_kit.py` | 生成上面那個 GLB 的 Blender 腳本 |
| `src/BuildingGenerator.ts`、`src/Config.ts`、`src/style.css` | 配套的舊程式，沒有任何地方引用 |

這 5 個檔案都已經在 GitHub 上。之前我嘗試刪除被權限機制擋下，你沒有確認，所以還在。

---

## 四、程式碼生成的 3D 模型

「生成」指幾何由程式在執行時計算產生，不是載入的模型檔。

### A. 建築專案（`src/`）

| 物件 | 檔案 | 生成方式 |
|---|---|---|
| 人行道、路緣、黃色導盲磚帶（圍繞大樓，城市關閉時使用） | `streetlife.ts` | 圓角矩形擠出（ExtrudeGeometry）；方磚、導盲磚貼圖是 canvas 程序化繪製 |
| 行道樹（3 款） | `streetlife.ts` | 13–17 團頂點抖動的二十面體樹冠（逐面著色）+ 樹幹 + 3 根分枝，InstancedMesh |
| 樹穴蓋板 | `streetlife.ts` | BoxGeometry |
| **頂樓霓虹招牌** | `streetlife.ts` | 鋼骨架（立柱、橫梁、斜撐合併）；發光面板是平面，字用 canvas 即時畫（文字、顏色可調，預設「台北公寓」）；背面是左右鏡像的平面 |
| 水塔 | `streetlife.ts` | **不是生成**：用 kit 的 `watertank` 零件，只是程式決定放置位置 |
| 地面 | `main.ts` | 600 × 600 平面 |
| 天空球 | `sky.ts` | 球體 + 著色器（漸層、太陽、星星、雲） |
| 雪花、雨絲 | `snow.ts`、`rain.ts` | InstancedBufferGeometry 粒子 |
| 積雪殼 | `kit.ts` | 複製 kit 零件的幾何，用著色器外推，沒有新增頂點 |

### B. 道路城市系統（`road-system/`，全部由程式生成）

預設參數（5 × 5 街廓）實測：

| 類別 | 數量 | 三角形 | 說明 |
|---|---|---|---|
| 柏油 | 1 片 | 2 | 整張地圖一個大四邊形 |
| 路緣石（頂面與外牆） | 49 個街廓 | 5,968 | 偏移線求交加圓角 |
| 人行道 | 49 個街廓 | 2,984 | 路緣石內緣到地塊線之間，挖洞鋪面 |
| 地塊 | 49 塊 | 1,394 | |
| 斑馬線條紋 | 1,368 條 | 標線合計 5,196（白 4,836 + 黃 360） | 紋數依路寬計算 |
| 停止線 | 144 條 | （含在上列） | 只在駛入側 |
| 車道線、中線 | 186 + 180 條 | （含在上列） | 白虛線；雙黃線與單黃虛線 |
| 車道箭頭 | 960 片 | （含在上列） | 依路口出口決定直行、左轉、右轉 |
| 人孔蓋、排水格柵 | 66 + 132 | 924 | |
| 導盲磚片 | 288 片 | 576 | 斑馬線兩端 |
| **量體建築** | **321 棟**（66 棟有裙樓加塔樓，4–17 層） | 5,814 | 窗戶、夜間亮燈在著色器內 |
| 路燈 | 107 支 | 3,852（36/支） | |
| 行道樹 | 94 棵 | 6,580（70/棵） | |
| 路樁 | 574 根 | 13,776（24/根） | |
| 紅綠燈 | 143 組 | 8,008（56/組） | 固定相位，東西向綠燈 |
| **合計** | | **約 55,000** | 城市本體 22,858 + 街道家具 32,216 |

---

## 五、整理建議

可以安全清理（會減少 repo 大小與混淆），建議你確認後再動：

1. 刪除第三節 3 的 5 個早期自製檔案。
2. 刪除 `public/textures/` 根目錄的 12 張重複貼圖（約 13 MB），以及 `procedural-hong-kong-building/textures/`。
3. `kit.glb` 內嵌 18 MB 的貼圖（程式不使用）：重新匯出時加 `export_image_format="NONE"`，檔案可從 20 MB 降到約 2 MB。
4. 修正資源庫：補上 `floor_Base_Emissive.png`，並更正 `LICENSE` 的版權行（目前與原 repo 不一致）。
5. 更新 `HANDOVER.md` 裡關於 `lightsground`、`old store_sign` 的錯誤說明。
