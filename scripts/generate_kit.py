"""
Blender 5.1.1 自動化建模與匯出腳本 (Procedural Building Asset Kit)
執行方式 (背景無頭模式):
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/generate_kit.py
"""

import bpy
import os
import math

# -------------------------------------------------------------
# 1. 規格常數定義 (單位: 公尺)
# -------------------------------------------------------------
BAY_W = 3.3          # 開間寬度 (X 軸)
FLOOR_H = 3.0        # 標準層高度 (Z 軸)
GROUND_H = 4.2       # 一樓店面挑高 (Z 軸)
WALL_THICK = 0.3     # 牆厚 (Y 軸)
PILLAR_SIZE = 0.4    # 轉角柱邊長

# 輸出路徑
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
OUTPUT_DIR = os.path.join(PROJECT_DIR, "public", "models")
os.makedirs(OUTPUT_DIR, exist_ok=True)
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "building_kit.glb")

# -------------------------------------------------------------
# 2. 清理場景
# -------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)

# -------------------------------------------------------------
# 3. 建立共用材質 (Materials)
# -------------------------------------------------------------
def create_material(name, color, roughness=0.6, metallic=0.1, alpha=1.0, emission=(0, 0, 0, 1)):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if alpha < 1.0:
            mat.blend_method = 'BLEND'
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emission
    return mat

mat_concrete = create_material("Mat_Concrete", (0.75, 0.73, 0.70, 1.0), roughness=0.85, metallic=0.05)
mat_frame = create_material("Mat_Dark_Frame", (0.15, 0.15, 0.17, 1.0), roughness=0.4, metallic=0.7)
mat_glass = create_material("Mat_Glass", (0.2, 0.35, 0.45, 0.4), roughness=0.1, metallic=0.9, alpha=0.4)
mat_sign = create_material("Mat_Signboard", (0.1, 0.1, 0.12, 1.0), roughness=0.5, metallic=0.2, emission=(0.2, 0.2, 0.25, 1))
mat_door = create_material("Mat_Door", (0.3, 0.2, 0.15, 1.0), roughness=0.6, metallic=0.2)

# -------------------------------------------------------------
# 4. 輔助函式：建立基本立方體與校準原點
# -------------------------------------------------------------
def add_box(name, width, depth, height, center_x, center_y, center_z, mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(center_x, center_y, center_z))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (width, depth, height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        obj.data.materials.append(mat)
    return obj

def set_origin_to_bottom_center(obj, x=0, y=0, z=0):
    bpy.context.view_layer.objects.active = obj
    bpy.context.scene.cursor.location = (x, y, z)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR', center='MEDIAN')

# -------------------------------------------------------------
# 5. 生成 8 大核心模組
# -------------------------------------------------------------

# --- 模組 1: Wall_Solid (實心水泥外牆) ---
def make_wall_solid():
    obj = add_box("Wall_Solid", BAY_W, WALL_THICK, FLOOR_H, 0, WALL_THICK/2, FLOOR_H/2, mat_concrete)
    set_origin_to_bottom_center(obj, 0, 0, 0)
    return obj

# --- 模組 2: Wall_Window (開窗水泥外牆) ---
def make_wall_window():
    # 主體牆面 (左右立柱與上下橫樑構成開口)
    win_w = 2.0
    win_h = 1.8
    side_w = (BAY_W - win_w) / 2
    sill_h = 0.8
    top_h = FLOOR_H - sill_h - win_h
    
    parts = []
    # 左牆墩
    parts.append(add_box("Wall_Left", side_w, WALL_THICK, FLOOR_H, -BAY_W/2 + side_w/2, WALL_THICK/2, FLOOR_H/2, mat_concrete))
    # 右牆墩
    parts.append(add_box("Wall_Right", side_w, WALL_THICK, FLOOR_H, BAY_W/2 - side_w/2, WALL_THICK/2, FLOOR_H/2, mat_concrete))
    # 窗台下部
    parts.append(add_box("Wall_Bottom", win_w, WALL_THICK, sill_h, 0, WALL_THICK/2, sill_h/2, mat_concrete))
    # 窗台上部
    parts.append(add_box("Wall_Top", win_w, WALL_THICK, top_h, 0, WALL_THICK/2, FLOOR_H - top_h/2, mat_concrete))
    # 窗框
    parts.append(add_box("Win_Frame", win_w, WALL_THICK * 0.5, win_h, 0, WALL_THICK/2, sill_h + win_h/2, mat_frame))
    # 玻璃
    parts.append(add_box("Win_Glass", win_w * 0.94, 0.02, win_h * 0.94, 0, WALL_THICK/2, sill_h + win_h/2, mat_glass))
    
    # 合併
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    wall_win = bpy.context.active_object
    wall_win.name = "Wall_Window"
    set_origin_to_bottom_center(wall_win, 0, 0, 0)
    return wall_win

# --- 模組 3: Shop_Door (一樓商鋪雙開玻璃大門) ---
def make_shop_door():
    sign_h = 0.8
    door_h = 2.6
    transom_h = GROUND_H - sign_h - door_h
    
    parts = []
    # 頂部招牌箱 (Signboard Header)
    parts.append(add_box("Shop_Sign", BAY_W, WALL_THICK * 1.2, sign_h, 0, (WALL_THICK*1.2)/2, GROUND_H - sign_h/2, mat_sign))
    # 門頭氣窗橫樑
    parts.append(add_box("Shop_Beam", BAY_W, WALL_THICK, transom_h, 0, WALL_THICK/2, door_h + transom_h/2, mat_frame))
    # 左右門柱
    p_w = 0.25
    parts.append(add_box("Shop_Door_PillarL", p_w, WALL_THICK, door_h, -BAY_W/2 + p_w/2, WALL_THICK/2, door_h/2, mat_frame))
    parts.append(add_box("Shop_Door_PillarR", p_w, WALL_THICK, door_h, BAY_W/2 - p_w/2, WALL_THICK/2, door_h/2, mat_frame))
    # 雙開玻璃門主體
    door_w = BAY_W - p_w * 2
    parts.append(add_box("Shop_Door_Body", door_w, 0.08, door_h, 0, WALL_THICK/2, door_h/2, mat_door))
    # 門玻璃視窗
    parts.append(add_box("Shop_Door_Glass", door_w * 0.75, 0.02, door_h * 0.75, 0, WALL_THICK/2, door_h/2, mat_glass))
    
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    shop_door = bpy.context.active_object
    shop_door.name = "Shop_Door"
    set_origin_to_bottom_center(shop_door, 0, 0, 0)
    return shop_door

# --- 模組 4: Shop_Window (一樓商鋪落地櫥窗) ---
def make_shop_window():
    sign_h = 0.8
    base_h = 0.4
    glass_h = GROUND_H - sign_h - base_h
    
    parts = []
    # 頂部招牌箱
    parts.append(add_box("Shop_Sign2", BAY_W, WALL_THICK * 1.2, sign_h, 0, (WALL_THICK*1.2)/2, GROUND_H - sign_h/2, mat_sign))
    # 底部踢腳防撞矮牆
    parts.append(add_box("Shop_Plinth", BAY_W, WALL_THICK, base_h, 0, WALL_THICK/2, base_h/2, mat_concrete))
    # 落地窗框
    parts.append(add_box("Shop_Glass_Frame", BAY_W, WALL_THICK * 0.6, glass_h, 0, WALL_THICK/2, base_h + glass_h/2, mat_frame))
    # 展示大玻璃
    parts.append(add_box("Shop_Big_Glass", BAY_W * 0.95, 0.02, glass_h * 0.92, 0, WALL_THICK/2, base_h + glass_h/2, mat_glass))
    
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    shop_win = bpy.context.active_object
    shop_win.name = "Shop_Window"
    set_origin_to_bottom_center(shop_win, 0, 0, 0)
    return shop_win

# --- 模組 5: Pillar_Corner (標準層轉角柱) ---
def make_pillar_corner():
    obj = add_box("Pillar_Corner", PILLAR_SIZE, PILLAR_SIZE, FLOOR_H, 0, 0, FLOOR_H/2, mat_concrete)
    set_origin_to_bottom_center(obj, 0, 0, 0)
    return obj

# --- 模組 6: Pillar_Corner_Ground (一樓挑高轉角柱) ---
def make_pillar_corner_ground():
    obj = add_box("Pillar_Corner_Ground", PILLAR_SIZE * 1.1, PILLAR_SIZE * 1.1, GROUND_H, 0, 0, GROUND_H/2, mat_frame)
    set_origin_to_bottom_center(obj, 0, 0, 0)
    return obj

# --- 模組 7: Floor_Slab (樓層板 / 天台底板) ---
def make_floor_slab():
    thick = 0.25
    obj = add_box("Floor_Slab", BAY_W, BAY_W, thick, 0, 0, thick/2, mat_concrete)
    set_origin_to_bottom_center(obj, 0, 0, 0)
    return obj

# --- 模組 8: Roof_Trim (天台女兒牆 / 圍欄) ---
def make_roof_trim():
    trim_h = 0.8
    obj = add_box("Roof_Trim", BAY_W, WALL_THICK, trim_h, 0, WALL_THICK/2, trim_h/2, mat_concrete)
    set_origin_to_bottom_center(obj, 0, 0, 0)
    return obj

# -------------------------------------------------------------
# 6. 執行全部建模
# -------------------------------------------------------------
items = [
    make_wall_solid(),
    make_wall_window(),
    make_shop_door(),
    make_shop_window(),
    make_pillar_corner(),
    make_pillar_corner_ground(),
    make_floor_slab(),
    make_roof_trim()
]

# 在 Blender 場景中以陣列排開，避免重疊
for i, item in enumerate(items):
    item.location.x = i * 4.0

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# -------------------------------------------------------------
# 7. 自動匯出為 GLB 檔案
# -------------------------------------------------------------
print(f"[Generate Kit] 正在匯出 GLB 至: {OUTPUT_FILE} ...")
bpy.ops.export_scene.gltf(
    filepath=OUTPUT_FILE,
    export_format='GLB',
    export_apply=True,
    use_selection=False
)
print("[Generate Kit] 匯出成功！模組庫包含:", [it.name for it in items])
