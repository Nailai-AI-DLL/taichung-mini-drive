"""
AI 生成的 MINI(Tripo 多視角,decisions/0016 §15)整理成遊戲用模型。
輸入是 Tripo 輸出的 GLB:長度正規化成 1、車頭 +X、Z 向上、整塊網格含輪子,約 150 萬三角形、2048 貼圖。
步驟:
  1. 縮放:照三視圖量到的輪子位置(profile.json 的 wheels,車頭 u = 0),讓軸距 = 物理軸距 2 × WHEEL_BASE_HALF。
  2. 平移:兩軸中點放原點、輪胎底貼地(GROUND)。
  3. 輪子:輪心附近、車身外側的面切出來;前左輪另存成輪子模型(遊戲裡四個輪子共用、會轉),車身上四個輪子都刪掉。
  4. 減面(Decimate)到目標三角形數;貼圖縮成 TEX 像素、輸出 JPEG。
  5. 材質稍微亮面(遊戲裡只有車子有環境反射,main.ts 的 applyCarEnv)。
執行(KEEP_WHEELS=1 不切輪子,只輸出車身):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 -P tools/models/ai_car_normalize.py -- \\
    <Tripo GLB> <輸出資料夾 public/models> <profile.json> <輸出名稱前綴,例 mini_ai> <預覽資料夾> [繞 Z 轉幾度,預設 0]
  Tripo 網頁版轉出的檔(tripo_convert_…)車長沿 Blender Y、車頭朝 -Y,要轉 90 度才會車頭朝 +X(2026-11-11 實測)。
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from common import render_previews  # noqa: E402

WHEEL_BASE_HALF = 1.0   # 物理(src/vehicle/params.ts)
GROUND = -0.80          # 物理車體中心到地面
TRACK_HALF = 0.76
TARGET_TRIS_BODY = 60000
TARGET_TRIS_WHEEL = 3000
TEX = 1024
# 輪子(正規化座標):半徑約車長 0.095(Tripo 分零件版的後輪實測 0.0925)
WHEEL_R_N = 0.097
WHEEL_INNER_Y_N = 0.13  # 比這更靠外側(|y| 較大)的面才算輪子,避免切到車身中央


def fbx_pbr(obj, src):
    """
    Tripo 網頁版轉出的 FBX:貼圖在旁邊的 <名稱>.fbm 資料夾,檔名結尾 _0_0 底色、_0_1 粗糙度、_0_2 金屬度、_0_3 法線
    (2026-11-11 看圖判斷:_0_3 是藍紫色的法線圖,_0_1 / _0_2 是灰階)。Blender 的 FBX 匯入只接上兩張,這裡重接成完整 PBR。
    """
    fbm = os.path.splitext(src)[0] + '.fbm'
    files = sorted(os.listdir(fbm))
    pick = lambda suffix: os.path.join(fbm, next(f for f in files if f.endswith(suffix)))
    mat = bpy.data.materials.new('mini_ai_pbr')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    def tex(path, non_color):
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = bpy.data.images.load(path)
        if non_color:
            n.image.colorspace_settings.name = 'Non-Color'
        return n
    nt.links.new(tex(pick('_0_0.jpg'), False).outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tex(pick('_0_1.jpg'), True).outputs['Color'], bsdf.inputs['Roughness'])
    nt.links.new(tex(pick('_0_2.jpg'), True).outputs['Color'], bsdf.inputs['Metallic'])
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tex(pick('_0_3.jpg'), True).outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    obj['pbr_textures'] = True


def export_body_only(body, out_dir, name, preview_dir):
    for img in bpy.data.images:
        if img.size[0] > TEX:
            img.scale(TEX, TEX)
    os.makedirs(out_dir, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    path = os.path.join(out_dir, name + '_body.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_image_format='JPEG', export_jpeg_quality=85)
    print('EXPORT', name + '_body.glb', os.path.getsize(path) // 1024, 'KB')
    os.makedirs(preview_dir, exist_ok=True)
    render_previews(os.path.join(preview_dir, name), target=(0, 0, GROUND + 0.7), distance=6.4)
    print('MODEL_OK')


def main():
    a = sys.argv[sys.argv.index('--') + 1:]
    src, out_dir, profile, name, preview_dir = a[:5]
    rot_z = float(a[5]) if len(a) > 5 else 0.0
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if src.lower().endswith('.fbx'):
        bpy.ops.import_scene.fbx(filepath=src)
    else:
        bpy.ops.import_scene.gltf(filepath=src)
    body = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
    if src.lower().endswith('.fbx'):
        fbx_pbr(body, src)
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    if rot_z:
        body.rotation_mode = 'XYZ'
        body.rotation_euler.z += math.radians(rot_z)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # ---- 縮放與平移 ----
    wf, wr = [w['center'] for w in json.load(open(profile))['wheels']]
    xs = [v.co.x for v in body.data.vertices]
    zs = [v.co.z for v in body.data.vertices]
    x_front, z_min = max(xs), min(zs)
    length = x_front - min(xs)
    # u(車頭 = 0)→ 正規化 x
    ux = lambda u: x_front - u * length
    xf, xr = ux(wf), ux(wr)
    s = 2 * WHEEL_BASE_HALF / (xf - xr)
    mid = (xf + xr) / 2
    for v in body.data.vertices:
        v.co.x = (v.co.x - mid) * s
        v.co.y = v.co.y * s
        v.co.z = (v.co.z - z_min) * s + GROUND
    r = WHEEL_R_N * s
    wheel_z = GROUND + r
    print('NORM scale=%.3f length=%.3f wheelR=%.3f width=%.3f' % (s, length * s, r, (max(v.co.y for v in body.data.vertices) - min(v.co.y for v in body.data.vertices))))

    # ---- 切出輪子:面中心在輪心半徑 1.08 r 內、且在外側 ----
    # 環境變數 KEEP_WHEELS=1:不切,輪子留在車身上、只輸出車身(0016 §15.6:AI 模型的輪子只有外側一層殼,
    # 切出來沒有胎面、輪心也不準,轉起來會晃,Cooper 2026-11-11 錄影確認)
    if os.environ.get('KEEP_WHEELS'):
        return export_body_only(body, out_dir, name, preview_dir)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    centers = [(x, sy) for x in (WHEEL_BASE_HALF, -WHEEL_BASE_HALF) for sy in (1, -1)]
    inner = WHEEL_INNER_Y_N * s
    wheel_faces = {c: [] for c in centers}
    for f in bm.faces:
        c = f.calc_center_median()
        for (x, sy) in centers:
            if sy * c.y > inner and math.hypot(c.x - x, c.z - wheel_z) < r * 1.08:
                wheel_faces[(x, sy)].append(f)
                break
    # 前左輪(+X、+Y)另存成輪子
    keep = set(wheel_faces[(WHEEL_BASE_HALF, 1)])
    wbm = bm.copy()
    wbm.faces.ensure_lookup_table()
    idx = {f.index for f in keep}
    bmesh.ops.delete(wbm, geom=[f for f in wbm.faces if f.index not in idx], context='FACES')
    bmesh.ops.delete(bm, geom=[f for fs in wheel_faces.values() for f in fs], context='FACES')
    bm.to_mesh(body.data)
    bm.free()
    wmesh = bpy.data.meshes.new('wheel')
    wbm.to_mesh(wmesh)
    wbm.free()
    wheel = bpy.data.objects.new(name + '_wheel', wmesh)
    bpy.context.scene.collection.objects.link(wheel)
    for m in body.data.materials:
        wheel.data.materials.append(m)
    # 輪心移到原點(遊戲裡掛在懸吊點、繞 Y 轉)
    for v in wheel.data.vertices:
        v.co.x -= WHEEL_BASE_HALF
        v.co.z -= wheel_z
    print('WHEEL faces', len(wheel.data.polygons), 'track y=%.3f' % (sum(v.co.y for v in wheel.data.vertices) / max(1, len(wheel.data.vertices))))
    # 輪子的 y 也移到 0(遊戲的輪子掛點已含輪距)
    yc = sum(v.co.y for v in wheel.data.vertices) / max(1, len(wheel.data.vertices))
    for v in wheel.data.vertices:
        v.co.y -= yc

    # ---- 減面 ----
    # Blender 的 Decimate 會把貼圖接縫(UV)壓壞,PBR 貼圖整片破碎、出現綠色色塊(tripo_convert 版實測,0016 §15.2)。
    # 環境變數 NO_DECIMATE=1 時跳過,改用會保護 UV 接縫的工具減面。
    for obj, target in (() if os.environ.get('NO_DECIMATE') else ((body, TARGET_TRIS_BODY), (wheel, TARGET_TRIS_WHEEL))):
        tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        m = obj.modifiers.new('dec', 'DECIMATE')
        m.ratio = min(1.0, target / max(1, tris))
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=m.name)
        print('TRIS', obj.name, tris, '->', sum(len(p.vertices) - 2 for p in obj.data.polygons))

    # ---- 貼圖縮小、材質亮面 ----
    for img in bpy.data.images:
        if img.size[0] > TEX:
            img.scale(TEX, TEX)
    for mat in bpy.data.materials:
        if mat.use_nodes:
            bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if bsdf and not bsdf.inputs['Roughness'].is_linked:
                bsdf.inputs['Roughness'].default_value = 0.32
                bsdf.inputs['Metallic'].default_value = 0.1

    os.makedirs(out_dir, exist_ok=True)
    for obj, fname in ((body, name + '_body.glb'), (wheel, name + '_wheel.glb')):
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, fname), export_format='GLB', use_selection=True,
                                  export_apply=True, export_yup=True, export_image_format='JPEG', export_jpeg_quality=85)
        print('EXPORT', fname, os.path.getsize(os.path.join(out_dir, fname)) // 1024, 'KB')
    # 預覽:四個輪子放回去
    for x in (WHEEL_BASE_HALF, -WHEEL_BASE_HALF):
        for y in (TRACK_HALF, -TRACK_HALF):
            d = wheel.copy()
            d.location = (x, y, wheel_z)
            if y < 0:
                d.scale.y = -1
            bpy.context.scene.collection.objects.link(d)
    wheel.hide_render = True
    os.makedirs(preview_dir, exist_ok=True)
    render_previews(os.path.join(preview_dir, name), target=(0, 0, GROUND + 0.7), distance=6.4)
    print('MODEL_OK')


main()
