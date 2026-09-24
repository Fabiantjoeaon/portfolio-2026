"""Blender 4.2+: --background --python scripts/build-meadow-wall.py -- /path/to/v7.FBX

Offline conversion only; no Blender or source FBX required by the website.
"""
import bpy
import numpy as np
import sys
from pathlib import Path

source = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
output = Path(__file__).resolve().parents[1] / 'public/assets/models/meadow/plant-wall.glb'
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(source))
wall = bpy.data.objects['3DTree_Verticalgarden']
# The FBX also contains loose sample plants and a concrete backing. Keep the garden.
for obj in list(bpy.data.objects):
    if obj != wall:
        bpy.data.objects.remove(obj, do_unlink=True)
bpy.context.view_layer.objects.active = wall
wall.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
before = len(wall.data.polygons)
modifier = wall.modifiers.new('Web silhouette', 'DECIMATE')
modifier.ratio = 0.08
bpy.ops.object.modifier_apply(modifier=modifier.name)
print('SIMPLIFIED', before, '->', len(wall.data.polygons), flush=True)

# Pack all 14 material slots into two atlases, with gutters for mip filtering.
size, tile, gutter = 2048, 512, 16
inner = tile - gutter * 2
color = np.zeros((size, size, 4), dtype=np.float32)
normal = np.ones_like(color)
normal[:, :, :3] = (0.5, 0.5, 1)
uvs = np.empty(len(wall.data.loops) * 2, dtype=np.float32)
wall.data.uv_layers.active.data.foreach_get('uv', uvs)
uvs = uvs.reshape(-1, 2)
slots = np.empty(len(wall.data.polygons), dtype=np.int32)
wall.data.polygons.foreach_get('material_index', slots)
loop_slots = np.repeat(slots, [p.loop_total for p in wall.data.polygons])

def pixels(path, data=False):
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
    image.scale(inner, inner)
    a = np.empty(inner * inner * 4, dtype=np.float32)
    image.pixels.foreach_get(a)
    bpy.data.images.remove(image)
    return a.reshape(inner, inner, 4)

for i, mat in enumerate(wall.data.materials):
    paths = [Path(n.image.filepath) for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
    # Resolve FBX references by basename so the conversion is portable.
    paths = [source.parent / '3DTree_Verticalgarden_07' / p.name for p in paths]
    base = pixels(paths[0])
    opacity = next((p for p in paths if 'opacity' in p.name.lower()), None)
    if opacity:
        base[:, :, 3] = pixels(opacity, True)[:, :, 0]
    norm_path = next((p for p in paths if '_NORM' in p.name), None)
    norm = pixels(norm_path, True) if norm_path else np.full_like(base, (0.5, 0.5, 1, 1))
    x, y = (i % 4) * tile, (i // 4) * tile
    color[y:y+tile, x:x+tile] = np.pad(base, ((gutter, gutter), (gutter, gutter), (0, 0)), mode='edge')
    normal[y:y+tile, x:x+tile] = np.pad(norm, ((gutter, gutter), (gutter, gutter), (0, 0)), mode='edge')
    mask = loop_slots == i
    local = uvs[mask]
    # Only bark wraps beyond [0, 1]; fit its repeated strip inside the tile.
    local[:, 0] /= max(1, float(local[:, 0].max()))
    uvs[mask] = (np.clip(local, 0, 1) * inner + (x + gutter, y + gutter)) / size
wall.data.uv_layers.active.data.foreach_set('uv', uvs.ravel())

def atlas(name, values, data=False):
    image = bpy.data.images.new(name, size, size, alpha=True)
    image.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
    image.pixels.foreach_set(values.ravel())
    image.pack()
    return image

mat = bpy.data.materials.new('Wet garden atlas')
mat.use_nodes = True
mat.surface_render_method = 'DITHERED'
mat.use_backface_culling = False
nodes, links = mat.node_tree.nodes, mat.node_tree.links
bsdf = nodes.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = 0.36
base = nodes.new('ShaderNodeTexImage')
base.image = atlas('Garden color + cutout', color)
links.new(base.outputs['Color'], bsdf.inputs['Base Color'])
links.new(base.outputs['Alpha'], bsdf.inputs['Alpha'])
tex = nodes.new('ShaderNodeTexImage')
tex.image = atlas('Garden normal', normal, True)
norm = nodes.new('ShaderNodeNormalMap')
links.new(tex.outputs['Color'], norm.inputs['Color'])
links.new(norm.outputs['Normal'], bsdf.inputs['Normal'])
wall.data.materials.clear()
wall.data.materials.append(mat)
for p in wall.data.polygons:
    p.material_index = 0

# Unit bounds: X [-.5,.5], Y [0,1], Z [-.5,.5] after glTF's Y-up conversion.
coords = np.array([v.co[:] for v in wall.data.vertices])
lo, hi = coords.min(axis=0), coords.max(axis=0)
# Imported split normals must follow the inverse transpose of normalization.
# Leaving them in source space makes the subsequently scaled leaves look faceted.
normals = np.empty(len(wall.data.loops) * 3, dtype=np.float32)
wall.data.corner_normals.foreach_get('vector', normals)
normals = normals.reshape(-1, 3) * (hi - lo)
normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-8)
coords = (coords - lo) / (hi - lo)
coords[:, :2] -= 0.5
wall.data.vertices.foreach_set('co', coords.astype(np.float32).ravel())
wall.data.update()
wall.data.normals_split_custom_set(normals)
wall.name = 'PlantWall'
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
    export_image_format='WEBP', export_image_quality=85,
    export_animations=False, export_cameras=False, export_lights=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14, export_draco_texcoord_quantization=14)
print('OUTPUT', output, output.stat().st_size, flush=True)
