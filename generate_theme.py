"""Generate the UIUXMonster Dark toolbar theme for Internet Download Manager (v=3).

Produces 32-bit straight-alpha BGRA BMP icon strips (12 icons per strip) for
large (56x42), small (32x32), and HiDPI 150% (84x63) in Normal and Hot states,
plus the `.tbi` manifest and a dark-mode preview image.
"""

from __future__ import annotations

import math
import struct
from pathlib import Path
from typing import Iterable, Tuple

from PIL import Image, ImageChops, ImageDraw, ImageFilter

# Palette inspired directly by the UIUXMonster IDM dark concept
BG_DARK = (22, 22, 29, 255)
STROKE_NORMAL = (229, 232, 242)   # #E5E8F2 crisp silver-white
TEAL = (45, 212, 191)             # #2DD4BF cyan-teal
CYAN = (34, 211, 238)             # #22D3EE
PURPLE = (139, 92, 246)           # #8B5CF6 violet-purple
PINK_PURPLE = (168, 85, 247)      # #A855F7
ROSE = (244, 114, 182)            # #F472B6 delete hover accent

SS = 8  # Supersampling factor for razor-sharp anti-aliased strokes


def lerp_color(
    c1: Tuple[int, int, int], c2: Tuple[int, int, int], t: float
) -> Tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return (
        int(round(c1[0] + (c2[0] - c1[0]) * t)),
        int(round(c1[1] + (c2[1] - c1[1]) * t)),
        int(round(c1[2] + (c2[2] - c1[2]) * t)),
    )


def make_gradient_rgba(
    mask: Image.Image,
    c1: Tuple[int, int, int],
    c2: Tuple[int, int, int],
    diagonal: bool = True,
) -> Image.Image:
    """Colorize an L-mode alpha mask with a smooth linear gradient (fast LUT resize)."""
    w, h = mask.size
    if c1 == c2:
        grad = Image.new("RGB", (w, h), c1)
    else:
        gw = 64
        grad_small = Image.new("RGB", (gw, gw))
        px = grad_small.load()
        denom = float((gw - 1) * (2 if diagonal else 1))
        for y in range(gw):
            for x in range(gw):
                t = (x + y) / denom if diagonal else x / denom
                px[x, y] = lerp_color(c1, c2, t)
        grad = grad_small.resize((w, h), Image.Resampling.BILINEAR)
    r, g, b = grad.split()
    return Image.merge("RGBA", (r, g, b, mask))


def draw_cap(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, fill) -> None:
    draw.ellipse((x - r, y - r, x + r, y + r), fill=fill)


def draw_round_line(
    draw: ImageDraw.ImageDraw,
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    width: float,
    fill,
) -> None:
    r = width / 2.0
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    length = math.hypot(dx, dy)
    if length < 1e-4:
        draw_cap(draw, p1[0], p1[1], r, fill)
        return
    nx = -dy / length * r
    ny = dx / length * r
    poly = [
        (p1[0] + nx, p1[1] + ny),
        (p2[0] + nx, p2[1] + ny),
        (p2[0] - nx, p2[1] - ny),
        (p1[0] - nx, p1[1] - ny),
    ]
    draw.polygon(poly, fill=fill)
    draw_cap(draw, p1[0], p1[1], r, fill)
    draw_cap(draw, p2[0], p2[1], r, fill)


def draw_polyline(
    draw: ImageDraw.ImageDraw,
    pts: Iterable[Tuple[float, float]],
    width: float,
    fill,
    closed: bool = False,
) -> None:
    pts_list = list(pts)
    if len(pts_list) < 2:
        return
    for i in range(len(pts_list) - 1):
        draw_round_line(draw, pts_list[i], pts_list[i + 1], width, fill)
    if closed:
        draw_round_line(draw, pts_list[-1], pts_list[0], width, fill)


def sample_arc(
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    start_deg: float,
    end_deg: float,
    steps: int = 48,
) -> list[Tuple[float, float]]:
    pts = []
    for i in range(steps + 1):
        ang = math.radians(start_deg + (end_deg - start_deg) * (i / steps))
        pts.append((cx + rx * math.cos(ang), cy + ry * math.sin(ang)))
    return pts


def draw_rounded_rect_stroke(
    draw: ImageDraw.ImageDraw,
    box: Tuple[float, float, float, float],
    radius: float,
    width: float,
    fill,
) -> None:
    x0, y0, x1, y1 = box
    r = min(radius, (x1 - x0) / 2.0, (y1 - y0) / 2.0)
    pts = []
    pts.extend(sample_arc(x0 + r, y0 + r, r, r, 180, 270, 14))
    pts.extend(sample_arc(x1 - r, y0 + r, r, r, 270, 360, 14))
    pts.extend(sample_arc(x1 - r, y1 - r, r, r, 0, 90, 14))
    pts.extend(sample_arc(x0 + r, y1 - r, r, r, 90, 180, 14))
    draw_polyline(draw, pts, width, fill, closed=True)


def icon_from_stroke_mask(
    s: int,
    mask: Image.Image,
    hot: bool,
    c1_hot: Tuple[int, int, int] = CYAN,
    c2_hot: Tuple[int, int, int] = PINK_PURPLE,
    accent_mask: Image.Image | None = None,
) -> Image.Image:
    if hot:
        base = make_gradient_rgba(mask, c1_hot, c2_hot, diagonal=True)
    else:
        base = make_gradient_rgba(mask, STROKE_NORMAL, STROKE_NORMAL)

    if accent_mask is not None:
        if hot:
            acc = make_gradient_rgba(accent_mask, c1_hot, c2_hot, diagonal=True)
        else:
            acc = make_gradient_rgba(accent_mask, TEAL, PURPLE, diagonal=True)
        base = Image.alpha_composite(base, acc)
    return base


# ---------------------------------------------------------------------------
# Individual icon vector builders in normalized [0..1] square space
# ---------------------------------------------------------------------------

def icon_add_url(size: float, hot: bool) -> Image.Image:
    """Signature gradient circle with crisp white cloud-download icon (UIUXMonster pill)."""
    s = int(round(size))
    badge_mask = Image.new("L", (s, s), 0)
    bd = ImageDraw.Draw(badge_mask)
    pad = 0.06 * s
    bd.ellipse((pad, pad, s - pad, s - pad), fill=255)

    c1 = CYAN if hot else TEAL
    c2 = PINK_PURPLE if hot else PURPLE
    badge = make_gradient_rgba(badge_mask, c1, c2, diagonal=True)

    if hot:
        ring_mask = Image.new("L", (s, s), 0)
        rd = ImageDraw.Draw(ring_mask)
        ring_pts = sample_arc(0.5 * s, 0.5 * s, 0.425 * s, 0.425 * s, 0, 360, 64)
        draw_polyline(rd, ring_pts, 0.03 * s, 160, closed=False)
        badge = Image.alpha_composite(
            badge, make_gradient_rgba(ring_mask, (255, 255, 255), (255, 255, 255))
        )

    # Symmetrical clean cloud outline + centered download arrow
    fg_mask = Image.new("L", (s, s), 0)
    fd = ImageDraw.Draw(fg_mask)
    sw = 0.064 * s

    cloud_pts = []
    cloud_pts.extend(sample_arc(0.34 * s, 0.54 * s, 0.115 * s, 0.115 * s, 90, 255, 18))
    cloud_pts.extend(sample_arc(0.50 * s, 0.43 * s, 0.15 * s, 0.145 * s, 195, 345, 24))
    cloud_pts.extend(sample_arc(0.66 * s, 0.54 * s, 0.115 * s, 0.115 * s, 285, 450, 18))
    draw_polyline(fd, cloud_pts, sw, 255, closed=False)
    draw_round_line(fd, (0.34 * s, 0.655 * s), (0.39 * s, 0.655 * s), sw, 255)
    draw_round_line(fd, (0.61 * s, 0.655 * s), (0.66 * s, 0.655 * s), sw, 255)

    draw_round_line(fd, (0.50 * s, 0.46 * s), (0.50 * s, 0.72 * s), sw, 255)
    draw_round_line(fd, (0.415 * s, 0.635 * s), (0.50 * s, 0.72 * s), sw, 255)
    draw_round_line(fd, (0.585 * s, 0.635 * s), (0.50 * s, 0.72 * s), sw, 255)

    fg_rgba = Image.new("RGBA", (s, s), (255, 255, 255, 0))
    fg_rgba.putalpha(fg_mask)
    return Image.alpha_composite(badge, fg_rgba)


def icon_resume(size: float, hot: bool) -> Image.Image:
    s = int(round(size))
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    sw = 0.070 * s
    pts = [(0.29 * s, 0.20 * s), (0.80 * s, 0.50 * s), (0.29 * s, 0.80 * s)]
    draw_polyline(d, pts, sw, 255, closed=True)
    return icon_from_stroke_mask(s, mask, hot)


def icon_stop(size: float, hot: bool) -> Image.Image:
    s = int(round(size))
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    sw = 0.070 * s
    draw_rounded_rect_stroke(d, (0.22 * s, 0.22 * s, 0.78 * s, 0.78 * s), 0.13 * s, sw, 255)
    return icon_from_stroke_mask(s, mask, hot)


def icon_stop_all(size: float, hot: bool) -> Image.Image:
    """Stopwatch circle with top stem + stop square badge (matches Stop All in mockup)."""
    s = int(round(size))
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    sw = 0.066 * s
    draw_round_line(d, (0.42 * s, 0.14 * s), (0.58 * s, 0.14 * s), sw, 255)
    draw_round_line(d, (0.50 * s, 0.14 * s), (0.50 * s, 0.24 * s), sw, 255)
    arc_pts = sample_arc(0.49 * s, 0.54 * s, 0.29 * s, 0.29 * s, 100, 365, 52)
    draw_polyline(d, arc_pts, sw, 255, closed=False)
    draw_round_line(d, (0.49 * s, 0.39 * s), (0.49 * s, 0.54 * s), sw * 0.9, 255)
    draw_round_line(d, (0.49 * s, 0.54 * s), (0.59 * s, 0.54 * s), sw * 0.9, 255)

    accent = Image.new("L", (s, s), 0)
    ad = ImageDraw.Draw(accent)
    draw_rounded_rect_stroke(
        ad, (0.63 * s, 0.63 * s, 0.85 * s, 0.85 * s), 0.05 * s, sw * 0.88, 255
    )
    return icon_from_stroke_mask(s, mask, hot, accent_mask=accent)


def icon_delete(size: float, hot: bool) -> Image.Image:
    """Clean trash bin with X (matches Delete in mockup)."""
    s = int(round(size))
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    sw = 0.066 * s
    draw_round_line(d, (0.19 * s, 0.27 * s), (0.81 * s, 0.27 * s), sw, 255)
    handle = sample_arc(0.50 * s, 0.27 * s, 0.11 * s, 0.11 * s, 180, 360, 18)
    draw_polyline(d, handle, sw, 255, closed=False)
    body = [
        (0.26 * s, 0.28 * s),
        (0.31 * s, 0.83 * s),
        (0.69 * s, 0.83 * s),
        (0.74 * s, 0.28 * s),
    ]
    draw_polyline(d, body, sw, 255, closed=False)
    draw_round_line(d, (0.42 * s, 0.46 * s), (0.58 * s, 0.64 * s), sw * 0.9, 255)
    draw_round_line(d, (0.58 * s, 0.46 * s), (0.42 * s, 0.64 * s), sw * 0.9, 255)
    return icon_from_stroke_mask(s, mask, hot, c1_hot=PURPLE, c2_hot=ROSE)


def icon_delete_completed(size: float, hot: bool) -> Image.Image:
    """Clean trash bin with checkmark (distinguishes Delete Completed from Delete)."""
    s = int(round(size))
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    sw = 0.066 * s
    draw_round_line(d, (0.19 * s, 0.27 * s), (0.81 * s, 0.27 * s), sw, 255)
    handle = sample_arc(0.50 * s, 0.27 * s, 0.11 * s, 0.11 * s, 180, 360, 18)
    draw_polyline(d, handle, sw, 255, closed=False)
    body = [
        (0.26 * s, 0.28 * s),
        (0.31 * s, 0.83 * s),
        (0.69 * s, 0.83 * s),
        (0.74 * s, 0.28 * s),
    ]
    draw_polyline(d, body, sw, 255, closed=False)

    accent = Image.new("L", (s, s), 0)
    ad = ImageDraw.Draw(accent)
    draw_polyline(
        ad,
        [(0.39 * s, 0.56 * s), (0.47 * s, 0.65 * s), (0.62 * s, 0.46 * s)],
        sw * 0.95,
        255,
    )
    return icon_from_stroke_mask(s, mask, hot, accent_mask=accent)


def icon_options(size: float, hot: bool) -> Image.Image:
    """Clean geometric 8-tooth outlined gear (smooth Lucide-style profile)."""
    s = int(round(size))
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    sw = 0.064 * s
    cx, cy = 0.50 * s, 0.50 * s

    teeth = 8
    r_in = 0.265 * s
    r_out = 0.365 * s
    pts = []
    for t in range(teeth):
        base_ang = (t / teeth) * 2 * math.pi
        step = (2 * math.pi) / teeth
        offsets = [
            (0.00 * step, r_in),
            (0.14 * step, r_in),
            (0.24 * step, r_out),
            (0.42 * step, r_out),
            (0.52 * step, r_in),
            (0.75 * step, r_in),
        ]
        for da, r in offsets:
            ang = base_ang + da
            pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    draw_polyline(d, pts, sw, 255, closed=True)

    inner = sample_arc(cx, cy, 0.125 * s, 0.125 * s, 0, 360, 48)
    draw_polyline(d, inner, sw, 255, closed=False)
    return icon_from_stroke_mask(s, mask, hot)


def icon_scheduler(size: float, hot: bool) -> Image.Image:
    """Calendar with bottom-right clock badge (matches Schedule in mockup)."""
    s = int(round(size))
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    sw = 0.064 * s
    draw_round_line(d, (0.33 * s, 0.14 * s), (0.33 * s, 0.26 * s), sw, 255)
    draw_round_line(d, (0.61 * s, 0.14 * s), (0.61 * s, 0.26 * s), sw, 255)
    draw_round_line(d, (0.16 * s, 0.37 * s), (0.78 * s, 0.37 * s), sw * 0.9, 255)

    cal_pts = []
    cal_pts.extend([(0.49 * s, 0.78 * s)])
    cal_pts.extend(sample_arc(0.24 * s, 0.70 * s, 0.08 * s, 0.08 * s, 90, 180, 10))
    cal_pts.extend(sample_arc(0.24 * s, 0.29 * s, 0.08 * s, 0.08 * s, 180, 270, 10))
    cal_pts.extend(sample_arc(0.70 * s, 0.29 * s, 0.08 * s, 0.08 * s, 270, 360, 10))
    cal_pts.extend([(0.78 * s, 0.48 * s)])
    draw_polyline(d, cal_pts, sw, 255, closed=False)

    for gx in (0.31 * s, 0.45 * s):
        draw_cap(d, gx, 0.51 * s, sw * 0.52, 255)
    draw_cap(d, 0.31 * s, 0.64 * s, sw * 0.52, 255)

    accent = Image.new("L", (s, s), 0)
    ad = ImageDraw.Draw(accent)
    cx, cy, cr = 0.71 * s, 0.71 * s, 0.16 * s
    ring = sample_arc(cx, cy, cr, cr, 0, 360, 36)
    draw_polyline(ad, ring, sw * 0.88, 255, closed=False)
    draw_round_line(ad, (cx, cy - 0.075 * s), (cx, cy), sw * 0.82, 255)
    draw_round_line(ad, (cx, cy), (cx + 0.06 * s, cy + 0.035 * s), sw * 0.82, 255)
    return icon_from_stroke_mask(s, mask, hot, accent_mask=accent)


def icon_start_queue(size: float, hot: bool) -> Image.Image:
    """Stacked queue cards (matches Queues in mockup) with teal play triangle."""
    s = int(round(size))
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    sw = 0.064 * s
    back = [
        (0.18 * s, 0.62 * s),
        (0.18 * s, 0.25 * s),
        (0.25 * s, 0.18 * s),
        (0.62 * s, 0.18 * s),
    ]
    draw_polyline(d, back, sw, 255, closed=False)
    draw_rounded_rect_stroke(d, (0.31 * s, 0.31 * s, 0.82 * s, 0.82 * s), 0.11 * s, sw, 255)

    accent = Image.new("L", (s, s), 0)
    ad = ImageDraw.Draw(accent)
    tri = [(0.50 * s, 0.46 * s), (0.67 * s, 0.565 * s), (0.50 * s, 0.67 * s)]
    draw_polyline(ad, tri, sw * 0.85, 255, closed=True)
    return icon_from_stroke_mask(s, mask, hot, accent_mask=accent)


def icon_stop_queue(size: float, hot: bool) -> Image.Image:
    """Stacked queue cards with stop square accent inside."""
    s = int(round(size))
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    sw = 0.064 * s
    back = [
        (0.18 * s, 0.62 * s),
        (0.18 * s, 0.25 * s),
        (0.25 * s, 0.18 * s),
        (0.62 * s, 0.18 * s),
    ]
    draw_polyline(d, back, sw, 255, closed=False)
    draw_rounded_rect_stroke(d, (0.31 * s, 0.31 * s, 0.82 * s, 0.82 * s), 0.11 * s, sw, 255)

    accent = Image.new("L", (s, s), 0)
    ad = ImageDraw.Draw(accent)
    draw_rounded_rect_stroke(
        ad, (0.47 * s, 0.47 * s, 0.66 * s, 0.66 * s), 0.04 * s, sw * 0.85, 255
    )
    return icon_from_stroke_mask(
        s, mask, hot, c1_hot=PURPLE, c2_hot=ROSE, accent_mask=accent
    )


def icon_grabber(size: float, hot: bool) -> Image.Image:
    """Minimalist globe wireframe + capture arrow for Site Grabber."""
    s = int(round(size))
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    sw = 0.064 * s
    cx, cy, r = 0.47 * s, 0.49 * s, 0.31 * s
    outer = sample_arc(cx, cy, r, r, 62, 382, 48)
    draw_polyline(d, outer, sw, 255, closed=False)
    merid = sample_arc(cx, cy, 0.145 * s, r, 75, 295, 36)
    draw_polyline(d, merid, sw * 0.85, 255, closed=False)
    draw_round_line(d, (cx - r, cy), (cx + r * 0.92, cy), sw * 0.85, 255)

    accent = Image.new("L", (s, s), 0)
    ad = ImageDraw.Draw(accent)
    draw_round_line(ad, (0.76 * s, 0.58 * s), (0.76 * s, 0.82 * s), sw * 0.9, 255)
    draw_round_line(ad, (0.67 * s, 0.73 * s), (0.76 * s, 0.82 * s), sw * 0.9, 255)
    draw_round_line(ad, (0.85 * s, 0.73 * s), (0.76 * s, 0.82 * s), sw * 0.9, 255)
    return icon_from_stroke_mask(s, mask, hot, accent_mask=accent)


def icon_share(size: float, hot: bool) -> Image.Image:
    """Forward share arrow emerging from rounded corner box (matches Share in mockup)."""
    s = int(round(size))
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    sw = 0.066 * s
    box_pts = []
    box_pts.extend([(0.44 * s, 0.25 * s)])
    box_pts.extend(sample_arc(0.28 * s, 0.33 * s, 0.08 * s, 0.08 * s, 270, 180, 10))
    box_pts.extend(sample_arc(0.28 * s, 0.73 * s, 0.08 * s, 0.08 * s, 180, 90, 10))
    box_pts.extend(sample_arc(0.68 * s, 0.73 * s, 0.08 * s, 0.08 * s, 90, 0, 10))
    box_pts.extend([(0.76 * s, 0.58 * s)])
    draw_polyline(d, box_pts, sw, 255, closed=False)

    arrow_curve = sample_arc(0.75 * s, 0.57 * s, 0.31 * s, 0.31 * s, 195, 270, 24)
    draw_polyline(d, arrow_curve, sw, 255, closed=False)
    tip = (0.77 * s, 0.26 * s)
    draw_round_line(d, (0.65 * s, 0.16 * s), tip, sw, 255)
    draw_round_line(d, (0.65 * s, 0.36 * s), tip, sw, 255)
    return icon_from_stroke_mask(s, mask, hot)


ICON_BUILDERS = [
    ("Add URL", icon_add_url),
    ("Resume", icon_resume),
    ("Stop", icon_stop),
    ("Stop All", icon_stop_all),
    ("Delete", icon_delete),
    ("Delete Completed", icon_delete_completed),
    ("Options", icon_options),
    ("Scheduler", icon_scheduler),
    ("Start Queue", icon_start_queue),
    ("Stop Queue", icon_stop_queue),
    ("Grabber", icon_grabber),
    ("Share", icon_share),
]


def add_hot_glow(icon: Image.Image, glow_c1=CYAN, glow_c2=PURPLE) -> Image.Image:
    """Add a subtle soft neon aura behind the icon for Hot/Hover state."""
    w, _h = icon.size
    alpha = icon.split()[3]
    glow_mask = alpha.filter(ImageFilter.GaussianBlur(radius=max(2.0, w * 0.075)))
    glow_mask = glow_mask.point(lambda v: int(v * 0.42))
    glow = make_gradient_rgba(glow_mask, glow_c1, glow_c2, diagonal=True)
    return Image.alpha_composite(glow, icon)


def downsample_straight_alpha(hi_img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Downsample via premultiplied C-speed Pillow ops, then un-premultiply cleanly."""
    r, g, b, a = hi_img.split()
    pre = Image.merge(
        "RGBA",
        (
            ImageChops.multiply(r, a),
            ImageChops.multiply(g, a),
            ImageChops.multiply(b, a),
            a,
        ),
    )
    small = pre.resize((target_w, target_h), Image.Resampling.LANCZOS)
    sp = small.load()
    out = Image.new("RGBA", (target_w, target_h))
    op = out.load()
    for y in range(target_h):
        for x in range(target_w):
            pr, pg, pb, pa = sp[x, y]
            if pa <= 1:
                op[x, y] = (0, 0, 0, 0)
            elif pa == 255:
                op[x, y] = (pr, pg, pb, 255)
            else:
                inv = 255.0 / pa
                op[x, y] = (
                    min(255, int(round(pr * inv))),
                    min(255, int(round(pg * inv))),
                    min(255, int(round(pb * inv))),
                    pa,
                )
    return out


def render_strip(
    cell_w: int,
    cell_h: int,
    icon_draw_px: int,
    hot: bool,
) -> Image.Image:
    """Render a 12-icon horizontal strip at exact target dimensions."""
    strip = Image.new("RGBA", (cell_w * len(ICON_BUILDERS), cell_h), (0, 0, 0, 0))
    hi_cell_w = cell_w * SS
    hi_cell_h = cell_h * SS
    hi_icon_s = icon_draw_px * SS

    for idx, (_name, builder) in enumerate(ICON_BUILDERS):
        icon_hi = builder(hi_icon_s, hot)
        if hot:
            icon_hi = add_hot_glow(icon_hi)
        cell_hi = Image.new("RGBA", (hi_cell_w, hi_cell_h), (0, 0, 0, 0))
        ox = (hi_cell_w - hi_icon_s) // 2
        oy = (hi_cell_h - hi_icon_s) // 2
        cell_hi.paste(icon_hi, (ox, oy), icon_hi)

        cell = downsample_straight_alpha(cell_hi, cell_w, cell_h)
        strip.paste(cell, (idx * cell_w, 0))
    return strip


def save_bgra_bmp(img: Image.Image, path: Path, dpi: int = 96) -> None:
    """Write a 32-bit BI_RGB bottom-up BGRA BMP matching IDM v=3 toolbar specs."""
    w, h = img.size
    raw_rgba = img.convert("RGBA").tobytes("raw", "BGRA", 0, -1)
    pixel_offset = 54
    image_size = len(raw_rgba)
    file_size = pixel_offset + image_size
    ppm = int(round(dpi / 0.0254))

    file_header = struct.pack("<2sIHHI", b"BM", file_size, 0, 0, pixel_offset)
    info_header = struct.pack(
        "<IiiHHIIiiII",
        40,
        w,
        h,
        1,
        32,
        0,
        image_size,
        ppm,
        ppm,
        0,
        0,
    )
    path.write_bytes(file_header + info_header + raw_rgba)


def build_preview(
    large: Image.Image,
    large_hot: Image.Image,
    small: Image.Image,
    small_hot: Image.Image,
    hdpi: Image.Image,
    hdpi_hot: Image.Image,
    out_path: Path,
) -> None:
    """Build a dark-mode preview sheet showing Normal, Hot, Small, and HiDPI strips."""
    w = max(hdpi.width, large.width) + 40
    h = 460
    canvas = Image.new("RGBA", (w, h), BG_DARK)
    draw = ImageDraw.Draw(canvas)

    sections = [
        ("Large Normal (672x42 - 12x 56x42)", large, 20, 20),
        ("Large Hot / Hover (672x42)", large_hot, 20, 88),
        ("Small Normal & Hot (384x32 - 12x 32x32)", small, 20, 156),
        ("", small_hot, 20 + small.width + 24, 156),
        ("HiDPI 150% Normal (1008x63 - 12x 84x63)", hdpi, 20, 224),
        ("HiDPI 150% Hot (1008x63)", hdpi_hot, 20, 326),
    ]
    for label, strip, x, y in sections:
        if label:
            draw.text((x, y), label, fill=(180, 185, 205, 255))
        box_y = y + 18
        draw.rounded_rectangle(
            (x - 4, box_y - 4, x + strip.width + 4, box_y + strip.height + 4),
            radius=8,
            fill=(29, 29, 38, 255),
            outline=(48, 48, 64, 255),
        )
        canvas.paste(strip, (x, box_y), strip)

    canvas.save(out_path)


def main() -> None:
    root = Path(__file__).resolve().parent
    theme_dir = root / "UIUXMonster-Dark"
    theme_dir.mkdir(parents=True, exist_ok=True)

    large = render_strip(56, 42, 32, hot=False)
    large_hot = render_strip(56, 42, 32, hot=True)
    small = render_strip(32, 32, 22, hot=False)
    small_hot = render_strip(32, 32, 22, hot=True)
    hdpi = render_strip(84, 63, 48, hot=False)
    hdpi_hot = render_strip(84, 63, 48, hot=True)

    save_bgra_bmp(large, theme_dir / "uiux_large.bmp")
    save_bgra_bmp(large_hot, theme_dir / "uiux_largeHot.bmp")
    save_bgra_bmp(small, theme_dir / "uiux_small.bmp")
    save_bgra_bmp(small_hot, theme_dir / "uiux_smallHot.bmp")
    save_bgra_bmp(hdpi, theme_dir / "uiux_hdpi.bmp")
    save_bgra_bmp(hdpi_hot, theme_dir / "uiux_hdpiHot.bmp")

    tbi_content = "\r\n".join([
        "v=3",
        "name=UIUXMonster Dark",
        "large=uiux_large.bmp",
        "largeHot=uiux_largeHot.bmp",
        "small=uiux_small.bmp",
        "smallHot=uiux_smallHot.bmp",
        "hdpi=uiux_hdpi.bmp",
        "hdpiHot=uiux_hdpiHot.bmp",
    ])
    (theme_dir / "uiuxmonster_dark.tbi").write_bytes(tbi_content.encode("ascii"))

    build_preview(large, large_hot, small, small_hot, hdpi, hdpi_hot, root / "preview.png")
    print("Generated UIUXMonster-Dark theme and preview.png successfully.")


if __name__ == "__main__":
    main()
