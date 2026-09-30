# 程序化建築生成器（Procedural Building Configurator）開發實作計畫

本專案旨在打造一套基於 **Three.js + Blender 5.1.1** 的網頁 3D 程序化建築生成系統（參考 [proceduralbuildings.chirostudio.xyz](https://proceduralbuildings.chirostudio.xyz/)），採用 **100% 免費、開源工具鏈**，並透過 **Blender 背景無頭命令列（Headless CLI）** 實現從模型生成到 `.glb` 匯出的全自動化流程，完全不需手動操作 Blender 介面。

---

## 一、 技術棧與架構設計

* **3D 模組生成與匯出**：Blender 5.1.1（內建 Python 3 / `bpy` 函式庫，背景無介面模式執行）
* **前端工程環境**：Vite + Vanilla TypeScript + HTML5 / CSS3
* **3D 渲染引擎**：Three.js（核心使用 `InstancedMesh` 以達到極致效能與最少 Draw Calls）
* **互動控制面板**：Lil-GUI（輕量化階層式控制面板）
* **自動化整合**：透過 `package.json` 指令封裝 Blender 背景匯出命令

---

## 二、 兩階段開發策略

為了確保開發效率與系統穩定性，本專案採取敏捷的**兩階段開發法**：

```
┌────────────────────────────────────────────────────────┐
│  第一階段：核心架構與模組化調控驗證 (PoC / MVP)             │
│  - 建立全自動化 Pipeline (Blender -b -P -> Three.js)   │
│  - 8 個核心模組：水泥牆、窗戶、一樓店面、轉角柱、樓板、屋頂 │
│  - 右側選單完整骨幹架設與 Building/Lighting 即時調控驗證 │
└──────────────────────────┬─────────────────────────────┘
                           │ 驗證成功後進入
┌──────────────────────────▼─────────────────────────────┐
│  第二階段：外觀細化與生活感裝飾 (港式/亞洲老街氛圍)         │
│  - 細緻零件：鐵窗花、外露冷氣機、外推曬衣架與衣服       │
│  - 特色地標：頂樓「幸福公寓」紅色霓虹招牌、不銹鋼水塔    │
│  - 街景環境：人行道導盲磚、復古路燈、行道樹              │
└────────────────────────────────────────────────────────┘
```

---

## 三、 幾何度量與原點標準規範（Grid Standards）

為確保模組無縫拼接、無破面與 Z-fighting，所有 3D 模組嚴格遵循以下度量衡：

1. **空間規格標準**：
   * **開間寬度（Bay Width, X 軸）**：標準為 **$3.3\text{ m}$**
   * **標準層單元高度（Floor Height, Z 軸）**：固定為 **$3.0\text{ m}$**
   * **一樓店面挑高高度（Ground Floor Height, Z 軸）**：固定為 **$4.2\text{ m}$**
   * **外牆結構厚度（Wall Thickness, Y 軸）**：固定為 **$0.3\text{ m}$**
   * **轉角預留邊距（Corner Margin）**：固定為 **$1.0\text{ m}$**
   * **轉角柱斷面（Corner Column）**：固定為 **$0.4\text{ m} \times 0.4\text{ m}$**

2. **原點（Pivot / Origin Point）統一規範**：
   * 所有牆面、門窗、店面模組的原點**嚴格鎖定在底面正面正中心 `(0, 0, 0)`**。
   * 正面統一朝向 **$+Y$ 軸**（匯出至 Three.js 後對應世界座標）。
   * 轉角柱原點鎖定在**底部幾何中心 `(0, 0, 0)`**。
   * 每個物件在匯出前強制執行 `transform_apply`，確保位置歸零、旋轉為 0、縮放為 1.0。

---

## 四、 模組零件庫（Asset Kit）清單

### 1. 第一階段核心模組（PoC / MVP）

| 零件名稱（Object Name） | 尺寸規格 ($W \times D \times H$) | 材質指派 | 結構說明 |
| :--- | :--- | :--- | :--- |
| **`Wall_Solid`** | $3.3 \times 0.3 \times 3.0\text{ m}$ | `Mat_Concrete` | 標準實心水泥外牆 |
| **`Wall_Window`** | $3.3 \times 0.3 \times 3.0\text{ m}$ | `Mat_Concrete`, `Mat_Dark_Frame`, `Mat_Glass` | 水泥外牆開窗，含金屬框與玻璃 |
| **`Shop_Door`** | $3.3 \times 0.3 \times 4.2\text{ m}$ | `Mat_Dark_Frame`, `Mat_Glass`, `Mat_Signboard` | 一樓雙開玻璃商業大門 + 門楣招牌箱 |
| **`Shop_Window`** | $3.3 \times 0.3 \times 4.2\text{ m}$ | `Mat_Dark_Frame`, `Mat_Glass`, `Mat_Signboard` | 一樓大面積落地展示櫥窗 + 門楣招牌箱 |
| **`Pillar_Corner`** | $0.4 \times 0.4 \times 3.0\text{ m}$ | `Mat_Concrete` | 標準層四角包邊結構柱 |
| **`Pillar_Corner_Ground`** | $0.4 \times 0.4 \times 4.2\text{ m}$ | `Mat_Dark_Frame` | 一樓挑高轉角商業金屬柱 |
| **`Floor_Slab`** | $3.3 \times 3.3 \times 0.2\text{ m}$ | `Mat_Concrete` | 樓層間水平隔板與天台地面 |
| **`Roof_Trim`** | $3.3 \times 0.3 \times 0.8\text{ m}$ | `Mat_Concrete` | 天台外圍安全女兒牆護欄 |

### 2. 第二階段擴充模組（生活感與街景飾件）

* `Wall_Window_Bars`：加裝防盜鐵窗花的窗戶
* `Wall_Balcony`：外凸小陽台
* `Prop_AC_Unit`：冷氣室外機（掛於窗下或外牆）
* `Prop_Clothesline`：外推式曬衣架與多色衣物
* `Rooftop_Sign_Frame`：頂樓「幸福公寓」霓虹招牌支架與發光字體
* `Roof_WaterTank`：經典圓筒不銹鋼水塔與三腳支架
* `Roof_MachineRoom`：電梯機房頂樓突出部
* `Street_Sidewalk`：人行道磚與黃色導盲磚
* `Street_Lamp`：復古弧形街燈
* `Street_Tree`：簡約低多邊形行道樹

---

## 五、 右側選單規格結構（Lil-GUI）

依照使用者精簡後的規格樹完整配置：

```text
▼ procedural buildings - lighting set
  ├── building: [ Chinese ▾ ] (當前固定為亞洲/港式老街公寓風格)
  │
  ▼ building · Chinese
    ├── ▼ Building (建築幾何尺寸調控)
    │     ├── Width: 18          (建築正面寬度，範圍 6 ~ 30m)
    │     ├── Depth: 13          (建築側面進深，範圍 6 ~ 30m)
    │     ├── Floors: 6          (總樓層數，範圍 2 ~ 15 層)
    │     ├── Ground Floor Height: 4.2  (一樓店面高度，範圍 3.5 ~ 5.0m)
    │     ├── Floor Height: 3.0  (標準層高度，範圍 2.8 ~ 3.5m)
    │     ├── Bay Width: 3.3     (單一開間寬度，預設 3.3m)
    │     ├── Corner Margin: 1.0 (轉角預留邊距)
    │     ├── Wall Thickness: 0.3(外牆結構厚度)
    │     ├── Seed: 3            (隨機排列種子碼)
    │     └── Detail Level: LOD0 (幾何精緻度層級)
    │
    ├── ▶ Facade (立面外觀)
    │     └── 外牆污漬老舊度、水泥風化材質切換
    │
    ├── ▶ Windows (窗戶系統)
    │     └── 開窗比例、鐵窗花（防盜窗）開關
    │
    ├── ▶ Residents' Additions (生活感加建物)
    │     ├── 冷氣室外機（AC units）顯示開關與密度
    │     └── 外推曬衣架與衣物顯示開關
    │
    ├── ▶ Shops (一樓店面專區)
    │     ├── 店鋪類型分佈（烟酒、手機維修、包子等）
    │     ├── 門楣招牌發光開關
    │     └── 鐵捲門開合狀態（拉下 / 營業中玻璃門）
    │
    ├── ▶ Rooftop Sign (頂樓霓虹招牌)
    │     ├── 「幸福公寓」霓虹字開關
    │     └── 霓虹燈管顏色與發光強度
    │
    ├── ▶ Roof (屋頂設施)
    │     └── 不銹鋼圓筒水塔、電梯機房、天線顯示開關
    │
    ├── ▶ Street (周邊造景)
    │     └── 人行道鋪面、行道樹、復古路燈顯示開關
    │
    └── ↺ reset to .blend values (一鍵重設為預設數值)
  │
  ▼ lighting set (即時光影控制)
    ├── mood: Architectural ▾  (光影氛圍風格)
    ├── exposure: 0.92          (全域曝光值，範圍 0.1 ~ 2.0)
    ├── ▶ key light            (主太陽光源角度、強度、陰影)
    └── ▶ fill light           (環境補光色溫與強度)
```

---

## 六、 程序化拼裝演算法設計（InstancedMesh Logic）

1. **開間數量計算（Grid Bay Calculation）**：
   * 正面開間數 $N_x = \text{round}((Width - 2 \times CornerMargin) / BayWidth)$
   * 側面開間數 $N_z = \text{round}((Depth - 2 \times CornerMargin) / BayWidth)$
2. **一樓商鋪配置（Ground Floor Layout）**：
   * $Y = 0$ 高度鋪設一樓。
   * 臨街面（南、北、東、西外緣）依據開間位置依序排入 `Shop_Door` 與 `Shop_Window`。
   * 四個角落精確放置 `Pillar_Corner_Ground`。
3. **標準樓層巡訪（Upper Floors Loop）**：
   * 從第 2 層至第 $Floors$ 層，每層高度累積：$Y = GroundFloorHeight + (floor - 1) \times FloorHeight$。
   * 依據 `Seed` 雜湊演算法計算每個開間位置，隨機決定使用 `Wall_Solid` 或 `Wall_Window`。
   * 四個角落精確放置 `Pillar_Corner`。
4. **天台與女兒牆（Roof & Trims）**：
   * 最頂層表面全面平鋪 `Floor_Slab`。
   * 頂層外圍一圈均勻鋪設 `Roof_Trim` 女兒牆護欄。
5. **GPU 矩陣批次提交**：
   * 每種零件只需一個 `InstancedMesh`，以單一矩陣運算寫入 `setMatrixAt(i, matrix)`，最後執行 `instanceMatrix.needsUpdate = true`，完成瞬時 60 FPS 重建。

---

## 七、 專案目錄結構與自動化指令

### 1. 目錄配置
```text
Anti_20260930/
├── implementation_plan.md       # 本開發實作計畫文件
├── scripts/
│   └── generate_kit.py          # Blender 5.1.1 背景建模與匯出腳本
├── public/
│   └── models/
│       └── building_kit.glb     # 自動產出的 3D 零件包
├── src/
│   ├── main.ts                  # Three.js 場景、燈光、渲染迴圈與 Lil-GUI
│   ├── BuildingGenerator.ts     # 程序化組裝演算法與 InstancedMesh 矩陣運算
│   ├── Config.ts                # 預設參數與介面狀態定義
│   └── style.css                # 介面重設與畫布滿版樣式
├── index.html                   # HTML 入口
├── package.json                 # 專案依賴與腳本定義
├── tsconfig.json                # TypeScript 編譯設定
└── vite.config.ts               # Vite 伺服器配置
```

### 2. package.json 自動化指令
```json
{
  "scripts": {
    "generate-kit": "/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/generate_kit.py",
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
```

---

## 八、 第一階段驗收指標（Milestone 1 Checklist）

- [ ] **自動化匯出測試**：執行 `npm run generate-kit` 能在無 GUI 情況下順利於 `public/models/` 產出 `building_kit.glb`。
- [ ] **模型完整性**：`.glb` 內含 `Wall_Solid`、`Wall_Window`、`Shop_Door`、`Shop_Window`、`Pillar_Corner`、`Pillar_Corner_Ground`、`Floor_Slab`、`Roof_Trim` 且原點座標正確無偏移。
- [ ] **選單功能調控**：
  - [ ] 調整 `Width` 與 `Depth` 能即時增減建築面寬與進深。
  - [ ] 調整 `Floors` 能即時加蓋或減去樓層。
  - [ ] 調整 `Ground Floor Height` 與 `Floor Height` 能即時調整層高且接縫嚴密無裂隙。
  - [ ] 切換 `Seed` 能即時變更窗戶與實心牆隨機分佈。
  - [ ] 調整 `Lighting Set` 曝光與光線能即時影響畫面明暗與陰影。
