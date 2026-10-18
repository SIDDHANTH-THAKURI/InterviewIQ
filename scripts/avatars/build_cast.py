"""
Builds the InterviewIQ interviewer cast as TalkingHead-ready GLB avatars.

  blender -b --python build_cast.py -- <out_dir> <talkinghead_addon_dir> [only_id]

Every character: MPFB/MakeHuman base (CC0 assets), realistic skin, hair,
brows, lashes, a suit, the TalkingHead (Mixamo-style) rig, plus ARKit face
units and Oculus visemes for lip sync.
"""
import bpy, os, sys, json, shutil, importlib.util

from bl_ext.user_default.mpfb.services import (
    HumanService, ExportService, FaceService, TargetService, ObjectService, LocationService, AssetService,
)

argv = sys.argv[sys.argv.index("--") + 1:]
OUT = argv[0]
TH_DIR = argv[1]
ONLY = argv[2] if len(argv) > 2 else None
os.makedirs(OUT, exist_ok=True)


def age(years):
    """MakeHuman age macro: 0.5 = 25 years, 1.0 = 90 years."""
    return 0.5 + (years - 25) / 65 * 0.5


CAST = [
    dict(id="maya", name="Maya Chen", sex="F", years=34, race=dict(asian=0.92, caucasian=0.08, african=0.0),
         skin="middleage_asian_female", hair="elvs_wavy_bob", brows="eyebrow010", eyes="brown",
         clothes=["toigo_female_suit"], weight=0.45, muscle=0.45, height=0.42),
    dict(id="david", name="David Okafor", sex="M", years=41, race=dict(african=0.95, caucasian=0.05, asian=0.0),
         skin="middleage_african_male", hair="culturalibre_hair_02", brows="eyebrow001", eyes="brown",
         clothes=["toigo_male_suit_3"], weight=0.55, muscle=0.6, height=0.6),
    dict(id="elena", name="Elena Rossi", sex="F", years=39, race=dict(caucasian=0.95, asian=0.02, african=0.03),
         skin="middleage_caucasian_female", hair="rehmanpolanski_hair_bun_brown", brows="eyebrow011", eyes="green",
         clothes=["toigo_female_double-breasted_suit"], weight=0.45, muscle=0.45, height=0.5),
    dict(id="james", name="James Whitfield", sex="M", years=52, race=dict(caucasian=0.97, asian=0.0, african=0.03),
         skin="middleage_caucasian_male", hair="short02", brows="eyebrow003", eyes="blue",
         clothes=["toigo_male_suit_tie_and_jacket"], weight=0.55, muscle=0.5, height=0.62),
    dict(id="priya", hair_tint=(0.45, 0.42, 0.4), name="Priya Nair", sex="F", years=31, race=dict(caucasian=0.55, asian=0.25, african=0.2),
         skin="cutoff3d_indian_female_enhanced", hair="ponytail01", brows="eyebrow010", eyes="brown",
         clothes=["female_elegantsuit01"], weight=0.45, muscle=0.45, height=0.4),
    dict(id="arjun", skin_tint=(0.8, 0.66, 0.54), name="Arjun Mehta", sex="M", years=36, race=dict(caucasian=0.55, asian=0.25, african=0.2),
         skin="toigo_light_skin_male_bronze", hair="short04", brows="eyebrow001", eyes="brown",
         clothes=["toigo_male_suit_3"], weight=0.5, muscle=0.55, height=0.55),
]


def find_one(subdir, name, ext):
    """Resolve an asset folder name to its file, relative path as MPFB expects."""
    root = LocationService.get_user_data(subdir)
    folder = os.path.join(root, name)
    for f in os.listdir(folder):
        if f.endswith(ext):
            return f"{name}/{f}"
    raise FileNotFoundError(f"{subdir}/{name}/*{ext}")


def register_rig():
    rigs = LocationService.get_user_data("rigs")
    os.makedirs(rigs, exist_ok=True)
    skel = json.load(open(os.path.join(TH_DIR, "talkinghead.mpfbskel")))
    skel["identifying_bones"] = ["LeftToe_End"]
    json.dump(skel, open(os.path.join(rigs, "talkinghead.json"), "w"))
    shutil.copy(os.path.join(TH_DIR, "talkinghead.mhw"), os.path.join(rigs, "weights.talkinghead.json"))
    AssetService.invalidate_custom_rig_cache()


def load_th_addon():
    spec = importlib.util.spec_from_file_location("th_addon", os.path.join(TH_DIR, "talkinghead-addon.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def tint_image(node, rgb):
    """Bake a colour multiply into a copy of the texture (glTF can't export mix nodes)."""
    import numpy as np
    img = node.image
    px = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    px[:, :3] *= np.array(rgb, dtype=np.float32)
    new = img.copy()
    new.name = img.name + "_tinted"
    new.pixels.foreach_set(px.ravel())
    new.pack()
    node.image = new


def recolor_iris(node, rgb):
    """MakeHuman's brown iris is very red; re-hue the coloured iris pixels to a natural brown."""
    import numpy as np
    img = node.image
    px = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    r, g, b = px[:, 0], px[:, 1], px[:, 2]
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    iris = (r - b) > 0.1
    target = np.array(rgb, dtype=np.float32)
    px[iris, :3] = np.clip(target[None, :] * (lum[iris] / 0.28)[:, None], 0, 1)
    new = img.copy()
    new.name = img.name + "_iris"
    new.pixels.foreach_set(px.ravel())
    new.pack()
    node.image = new


def add_skin_normal(nt, bsdf, c):
    """MakeHuman skins share one UV layout, so a good skin normal map works on every character."""
    skins = LocationService.get_user_data("skins")
    if c["sex"] == "M" and c["race"].get("african", 0) > 0.5:
        nrm = os.path.join(skins, "mindfront_skin_male_african_middleage", "skin_male_african_middleage_NRM.png")
    else:
        nrm = os.path.join(skins, "mindfront_aksel_skin", "Aksel_Skin_NRM.png")
    if not os.path.exists(nrm) or bsdf.inputs["Normal"].is_linked:
        return
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(nrm)
    tex.image.colorspace_settings.name = "Non-Color"
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = 0.55 if c["sex"] == "M" else 0.3
    nt.links.new(tex.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])


def fix_materials(c):
    """Skin, eyes, teeth and clothes must be OPAQUE in real time (blended skin lets the teeth show
    through the lips). Hair is alpha-clipped (glTF MASK) and tinted to the character's hair colour."""
    for mat in bpy.data.materials:
        if not mat.node_tree:
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        name = mat.name.lower()
        is_hair = c["hair"].lower() in name or "hair" in name or "ponytail" in name
        alpha = bsdf.inputs["Alpha"]
        if is_hair:
            if alpha.is_linked:
                link = alpha.links[0]
                src = link.from_socket
                nt.links.remove(link)
                gt = nt.nodes.new("ShaderNodeMath")
                gt.operation = "GREATER_THAN"
                gt.inputs[1].default_value = 0.4
                nt.links.new(src, gt.inputs[0])
                nt.links.new(gt.outputs[0], alpha)
            base = bsdf.inputs["Base Color"]
            if base.is_linked and c.get("hair_tint") and base.links[0].from_node.type == "TEX_IMAGE":
                tint_image(base.links[0].from_node, c["hair_tint"])
            bsdf.inputs["Roughness"].default_value = 0.8
            bsdf.inputs["Specular IOR Level"].default_value = 0.2
        elif "high-poly" in name:
            # Per-character iris colour, cornea clipped instead of blended.
            base = bsdf.inputs["Base Color"]
            if base.is_linked and base.links[0].from_node.type == "TEX_IMAGE":
                eye_png = os.path.join(LocationService.get_user_data("eyes"), "materials", f"{c['eyes']}_eye.png")
                if os.path.exists(eye_png):
                    base.links[0].from_node.image = bpy.data.images.load(eye_png)
                if c["eyes"] == "brown":
                    recolor_iris(base.links[0].from_node, (0.30, 0.19, 0.11))
            if alpha.is_linked:
                link = alpha.links[0]
                src = link.from_socket
                nt.links.remove(link)
                gt = nt.nodes.new("ShaderNodeMath")
                gt.operation = "GREATER_THAN"
                gt.inputs[1].default_value = 0.5
                nt.links.new(src, gt.inputs[0])
                nt.links.new(gt.outputs[0], alpha)
            bsdf.inputs["Roughness"].default_value = 0.15
        elif "eyebrow" in name or "eyelash" in name:
            # Textured cards: alpha-clipped, matte, never shiny.
            if alpha.is_linked and "eyebrow" in name:
                link = alpha.links[0]
                src = link.from_socket
                nt.links.remove(link)
                gt = nt.nodes.new("ShaderNodeMath")
                gt.operation = "GREATER_THAN"
                gt.inputs[1].default_value = 0.3
                nt.links.new(src, gt.inputs[0])
                nt.links.new(gt.outputs[0], alpha)
            bsdf.inputs["Roughness"].default_value = 1.0
            bsdf.inputs["Specular IOR Level"].default_value = 0.0
        else:
            if alpha.is_linked:
                nt.links.remove(alpha.links[0])
            alpha.default_value = 1.0
            if "body" in name:
                add_skin_normal(nt, bsdf, c)
                base = bsdf.inputs["Base Color"]
                if c.get("skin_tint") and base.is_linked and base.links[0].from_node.type == "TEX_IMAGE":
                    tint_image(base.links[0].from_node, c["skin_tint"])
                bsdf.inputs["Roughness"].default_value = 0.62
                bsdf.inputs["Specular IOR Level"].default_value = 0.35
            else:
                bsdf.inputs["Specular IOR Level"].default_value = 0.25
            mat.surface_render_method = "DITHERED"


def build(c, th):
    bpy.ops.wm.read_homefile(use_empty=True)

    info = HumanService._create_default_human_info_dict()
    info["name"] = c["id"]
    info["phenotype"].update(
        gender=1.0 if c["sex"] == "M" else 0.0,
        age=age(c["years"]),
        muscle=c["muscle"],
        weight=c["weight"],
        height=c["height"],
        proportions=0.6,
        cupsize=0.45,
        firmness=0.5,
        race=c["race"],
    )
    info["rig"] = "custom.talkinghead"
    info["eyes"] = "high-poly/high-poly.mhclo"
    info["eyebrows"] = find_one("eyebrows", c["brows"], ".mhclo")
    info["eyelashes"] = find_one("eyelashes", "eyelashes02", ".mhclo")
    info["teeth"] = "teeth_base/teeth_base.mhclo"
    info["tongue"] = "tongue01/tongue01.mhclo"
    info["hair"] = find_one("hair", c["hair"], ".mhclo")
    info["clothes"] = [find_one("clothes", x, ".mhclo") for x in c["clothes"]]
    info["proxy"] = ""
    info["skin_mhmat"] = find_one("skins", c["skin"], ".mhmat")
    info["skin_material_type"] = "GAMEENGINE"
    info["eyes_material_type"] = "GAMEENGINE"
    info["clothes_material_type"] = "GAMEENGINE"
    info["eyes_material_settings"] = {}
    info["alternative_materials"] = {}

    settings = HumanService.get_default_deserialization_settings()
    settings.update(subdiv_levels=0, material_instances="NEVER")
    basemesh = HumanService.deserialize_from_dict(info, settings)

    # Eye colour
    try:
        HumanService._set_eyes(dict(info, eyes_material_type="GAMEENGINE",
                                    eyes_material_settings={}), basemesh)
    except Exception as e:  # noqa
        print("eye colour skipped:", e)

    # ── Export copy with face shapes ──
    copy = ExportService.create_character_copy(basemesh, name_suffix="_x")
    new_basemesh = ObjectService.find_object_of_type_amongst_nearest_relatives(copy)
    TargetService.bake_targets(new_basemesh)
    FaceService.load_targets(new_basemesh, load_microsoft_visemes=False, load_meta_visemes=True, load_arkit_faceunits=True)
    FaceService.interpolate_targets(new_basemesh)
    ExportService.bake_modifiers_remove_helpers(new_basemesh, bake_masks=True, bake_subdiv=False, remove_helpers=True, also_proxy=True)

    # Drop the original character, keep only the export copy.
    keep = set()
    for o in bpy.data.objects:
        root = o
        while root.parent:
            root = root.parent
        if root == copy:
            keep.add(o.name)
    for o in list(bpy.data.objects):
        if o.name not in keep:
            bpy.data.objects.remove(o, do_unlink=True)

    copy.name = "Armature"
    copy.data.name = "Armature"

    bpy.ops.object.select_all(action="DESELECT")
    copy.select_set(True)
    bpy.context.view_layer.objects.active = copy
    th.scale_character([copy])
    th.fix_bone_axes([copy], th.BONE_AXES_DATA_A)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    fix_materials(c)

    out = os.path.join(OUT, f"{c['id']}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=False,
        export_animations=False,
        export_morph=True,
        export_morph_normal=False,
        export_image_format="JPEG",
        export_jpeg_quality=88,
        export_yup=True,
    )
    shapes = sum(len(o.data.shape_keys.key_blocks) for o in bpy.data.objects if o.type == "MESH" and o.data.shape_keys)
    print(f"BUILT {c['id']} → {out} ({os.path.getsize(out)//1024} KB, {shapes} shape keys)")


register_rig()
th = load_th_addon()
for c in CAST:
    if ONLY and c["id"] != ONLY:
        continue
    try:
        build(c, th)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"FAILED {c['id']}: {e}")
