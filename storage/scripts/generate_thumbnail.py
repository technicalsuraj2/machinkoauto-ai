import os
import sys
import time
import json
import random
import urllib.request
import urllib.error
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

def generate_with_agnes_ai(title, clip_index, output_path):
    api_key = os.getenv("AGNES_API_KEY", "sk-9GL1xSoER4cJrAgUCPtBSSBeMm8g8Llc53m3O2Sf7eMjuP54")
    base_url = os.getenv("AGNES_BASE_URL", "https://apihub.agnes-ai.com/v1")
    model = os.getenv("AGNES_IMAGE_MODEL", "agnes-image-2.5-flash")
    
    if not api_key:
        return False
        
    clean_title = title.replace("#Shorts", "").replace("#shorts", "").replace("#viral", "").strip()
    lower_title = clean_title.lower()
    
    # User's exact prompt format:
    # 1. If MrBeast / Challenge: /pointingtumbnail ratio 9.16 topic :- 50M doller challge appected by ishowspeed
    # 2. If IShowSpeed / Shocking: /shokingthumbnail ratio 9.16 topic:- what happend in live streem
    is_mrbeast = any(k in lower_title for k in ["mrbeast", "beast", "challenge", "dollar", "$", "million", "survive", "win", "bounty"])
    is_speed = any(k in lower_title for k in ["speed", "ishowspeed", "rage", "scream", "live", "stream", "bark"])
    
    if is_mrbeast:
        style = "pointingtumbnail"
        topic = clean_title
    elif is_speed:
        style = "shokingthumbnail"
        topic = f"what happend in live streem {clean_title}"
    elif any(k in lower_title for k in ["shock", "crazy", "insane", "ghost", "crash", "omg", "wtf", "scary", "caught", "ending"]):
        style = "shokingthumbnail"
        topic = clean_title
    else:
        # Balanced alternate between pointing and shocking
        style = "pointingtumbnail" if (clip_index % 2 == 1) else "shokingthumbnail"
        topic = clean_title
        
    prompt = f"/{style} ratio 9.16 topic :- {topic}"
    print(f"[Agnes AI] Generating thumbnail with prompt: '{prompt}'...")
    
    req_payload = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "size": "1024x1792"
    }
    
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/images/generations",
        data=json.dumps(req_payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    )
    
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode())
        if "data" in result and len(result["data"]) > 0:
            img_url = result["data"][0].get("url")
            if img_url:
                print(f"[Agnes AI] Downloading image from {img_url}...")
                temp_down = f"storage/temp_agnes_{int(time.time() * 1000)}.png"
                urllib.request.urlretrieve(img_url, temp_down)
                
                with Image.open(temp_down) as agnes_img:
                    rgb = agnes_img.convert("RGB").resize((1080, 1920), Image.Resampling.LANCZOS)
                    rgb.save(output_path, "JPEG", quality=92, subsampling=0)
                    
                if os.path.exists(temp_down):
                    try:
                        os.remove(temp_down)
                    except:
                        pass
                        
                print(f"[Agnes AI] High-CTR viral thumbnail saved -> {output_path}")
                return True
    return False

def extract_frame(video_path, time_sec, target_size=(1080, 960), zoom=1.0, crop_focus="center"):
    temp_frame = f"storage/temp_frame_{int(time_sec * 100)}.jpg"
    try:
        cmd = [
            "ffmpeg", "-y",
            "-ss", f"{time_sec:.2f}",
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "2",
            temp_frame
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        img = Image.open(temp_frame).convert("RGBA")
        
        img_w, img_h = img.size
        target_w, target_h = target_size
        
        scale = max(target_w / img_w, target_h / img_h) * zoom
        new_w = int(img_w * scale)
        new_h = int(img_h * scale)
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        
        if crop_focus == "facecam":
            left = 0
            top = max(0, new_h - target_h)
        elif crop_focus == "right":
            left = max(0, new_w - target_w)
            top = (new_h - target_h) // 2
        else:
            left = max(0, (new_w - target_w) // 2)
            top = max(0, (new_h - target_h) // 2)
            
        img = img.crop((left, top, left + target_w, top + target_h))
        
        img = ImageEnhance.Color(img).enhance(1.28)
        img = ImageEnhance.Contrast(img).enhance(1.20)
        img = ImageEnhance.Brightness(img).enhance(1.04)
        
        return img
    finally:
        if os.path.exists(temp_frame):
            try:
                os.remove(temp_frame)
            except:
                pass

def draw_brush_banner(draw, x, y, w, h, slant=-10, fill=(225, 20, 20, 255)):
    pts = [
        (x + 20, y + random.randint(0, 8)),
        (x + w * 0.3, y - 8 + random.randint(-4, 4)),
        (x + w * 0.7, y + 4 + random.randint(-4, 4)),
        (x + w, y - slant + random.randint(-6, 6)),
        (x + w - 10, y + h - slant + random.randint(-5, 5)),
        (x + w * 0.6, y + h + random.randint(-4, 4)),
        (x + w * 0.2, y + h - 5 + random.randint(-4, 4)),
        (x, y + h + slant + random.randint(-5, 5))
    ]
    draw.polygon(pts, fill=fill)
    return pts

def draw_text_with_outline(draw, pos, text, font, fill_color, outline_color=(0, 0, 0, 255), stroke_width=10):
    draw.text(pos, text, font=font, fill=fill_color, stroke_width=stroke_width, stroke_fill=outline_color, anchor="mm")

def draw_curved_arrow(canvas_size=(380, 380)):
    w, h = canvas_size
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    
    pts = [
        (320, 70), (340, 45), (330, 25),
        (240, 50), (170, 110), (120, 190),
        (95, 170),
        (35, 270),
        (140, 255),
        (145, 225),
        (190, 150), (250, 95)
    ]
    
    border_img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(border_img)
    b_draw.polygon(pts, fill=(255, 255, 255, 255))
    border_img = border_img.filter(ImageFilter.MaxFilter(15))
    
    fill_img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    f_draw = ImageDraw.Draw(fill_img)
    f_draw.polygon(pts, fill=(235, 20, 20, 255))
    
    return Image.alpha_composite(border_img, fill_img)

def create_circular_facecam_cutout(img, diameter=300):
    w, h = img.size
    crop_w = int(w * 0.45)
    crop_h = int(h * 0.45)
    left = 0
    top = h - crop_h
    face_crop = img.crop((left, top, left + crop_w, top + crop_h)).resize((diameter, diameter), Image.Resampling.LANCZOS)
    
    face_crop = ImageEnhance.Contrast(face_crop).enhance(1.25)
    face_crop = ImageEnhance.Color(face_crop).enhance(1.20)
    
    mask = Image.new("L", (diameter, diameter), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse((0, 0, diameter, diameter), fill=255)
    
    output = Image.new("RGBA", (diameter, diameter), (0, 0, 0, 0))
    output.paste(face_crop, (0, 0), mask=mask)
    
    draw = ImageDraw.Draw(output)
    draw.ellipse((3, 3, diameter - 4, diameter - 4), outline=(255, 255, 255, 255), width=18)
    draw.ellipse((6, 6, diameter - 7, diameter - 7), outline=(235, 20, 20, 255), width=14)
    
    return output

def generate_viral_thumbnail(video_path, output_path, title="", clip_index=1, start_time=0.0, duration=30.0):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # 1. PRIMARY GENERATION: Agnes AI with exact prompt syntax
    try:
        success = generate_with_agnes_ai(title, clip_index, output_path)
        if success and os.path.exists(output_path) and os.path.getsize(output_path) > 10000:
            return output_path
    except Exception as agnes_err:
        print(f"[Thumbnail] Agnes AI notice ({agnes_err}), falling back to Pillow split-screen reaction generator.")
    
    # 2. SEAMLESS FALLBACK: Pillow Split-Screen Reaction Generator
    W, H = 1080, 1920
    half_H = 960
    
    t1 = max(4.0, start_time + min(12.0, duration * 0.35))
    t2 = max(t1 + 3.0, start_time + min(duration - 2.0, 18.0))
    
    print(f"[Thumbnail] Extracting Frame 1 at {t1:.1f}s, Frame 2 at {t2:.1f}s...")
    frame_top = extract_frame(video_path, t1, (W, half_H), zoom=1.1, crop_focus="center")
    frame_bot = extract_frame(video_path, t2, (W, half_H), zoom=1.05, crop_focus="center")
    
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    canvas.paste(frame_top, (0, 0))
    canvas.paste(frame_bot, (0, half_H))
    
    divider = Image.new("RGBA", (W, 20), (0, 0, 0, 250))
    canvas.paste(divider, (0, half_H - 10))
    
    font_impact_huge = ImageFont.truetype("C:/Windows/Fonts/impact.ttf", 115)
    font_impact_big = ImageFont.truetype("C:/Windows/Fonts/impact.ttf", 90)
    font_impact_med = ImageFont.truetype("C:/Windows/Fonts/impact.ttf", 68)
    font_impact_small = ImageFont.truetype("C:/Windows/Fonts/impact.ttf", 52)
    font_emoji = ImageFont.truetype("C:/Windows/Fonts/seguiemj.ttf", 210)
    
    clean_title = title.replace("#Shorts", "").replace("#shorts", "").replace("#viral", "").strip()
    words = clean_title.split()
    top_keyword = "VIRAL MOMENT"
    if words:
        top_keyword = " ".join(words[:2]).upper()
        if len(top_keyword) > 18:
            top_keyword = words[0].upper()
            
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    # Top Red Brush Banner
    draw_brush_banner(draw, 50, 40, 980, 110, slant=8, fill=(225, 20, 20, 255))
    draw_text_with_outline(draw, (120, 95), "!!", font_impact_big, fill_color=(255, 255, 0, 255), outline_color=(0, 0, 0, 255), stroke_width=8)
    draw_text_with_outline(draw, (560, 95), top_keyword, font_impact_med, fill_color=(255, 255, 255, 255), stroke_width=7)
    
    # Neon Yellow Action Word
    action_words = ["PLAY", "WATCH", "DRIVING", "CRASH", "INSANE", "WTF?!"]
    action_word = action_words[(clip_index - 1) % len(action_words)]
    draw_text_with_outline(draw, (770, 225), action_word, font_impact_huge, fill_color=(255, 240, 0, 255), outline_color=(0, 0, 0, 255), stroke_width=16)
    draw_text_with_outline(draw, (540, 360), "AND", font_impact_small, fill_color=(255, 255, 255, 255), stroke_width=6)
    
    # Main Curiosity Red Brush Banner
    draw_brush_banner(draw, 35, 435, 1010, 140, slant=-12, fill=(225, 15, 15, 255))
    draw_text_with_outline(draw, (270, 505), "WHAT", font_impact_big, fill_color=(255, 240, 0, 255), outline_color=(0, 0, 0, 255), stroke_width=12)
    draw_text_with_outline(draw, (690, 505), "HAPPENED?!", font_impact_big, fill_color=(255, 255, 255, 255), outline_color=(0, 0, 0, 255), stroke_width=12)
    
    # Circular Facecam Cutout
    circle_cutout = create_circular_facecam_cutout(frame_top, diameter=290)
    overlay.paste(circle_cutout, (750, 980), mask=circle_cutout)
    
    # Curved Red 3D Arrow
    arrow = draw_curved_arrow((360, 360))
    overlay.paste(arrow, (530, 1140), mask=arrow)
    
    # Big 3D Shocked Emoji
    try:
        emoji_layer = Image.new("RGBA", (320, 320), (0, 0, 0, 0))
        e_draw = ImageDraw.Draw(emoji_layer)
        e_draw.text((160, 160), "😱", font=font_emoji, anchor="mm", embedded_color=True)
        overlay.paste(emoji_layer, (40, 1610), mask=emoji_layer)
    except Exception as e:
        print("Emoji note:", e)
        
    # Bottom Viral Banner
    bottom_hooks = ["FULL STORY?!", "WAIT FOR END?!", "100% GONE WRONG?!", "NEVER DO THIS?!"]
    bot_hook = bottom_hooks[(clip_index - 1) % len(bottom_hooks)]
    draw_brush_banner(draw, 340, 1755, 700, 115, slant=10, fill=(225, 20, 20, 255))
    draw_text_with_outline(draw, (690, 1812), bot_hook, font_impact_big, fill_color=(255, 255, 255, 255), outline_color=(0, 0, 0, 255), stroke_width=10)
    
    final_img = Image.alpha_composite(canvas, overlay)
    final_rgb = final_img.convert("RGB")
    final_rgb.save(output_path, "JPEG", quality=92, subsampling=0)
    print(f"[Thumbnail] Generated successfully -> {output_path}")
    return output_path

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python generate_thumbnail.py <video_path> <output_path> [title] [clip_index] [start_time] [duration]")
        sys.exit(1)
        
    v_path = sys.argv[1]
    o_path = sys.argv[2]
    t = sys.argv[3] if len(sys.argv) > 3 else "Viral Video"
    idx = int(sys.argv[4]) if len(sys.argv) > 4 else 1
    st = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0
    dur = float(sys.argv[6]) if len(sys.argv) > 6 else 30.0
    
    generate_viral_thumbnail(v_path, o_path, t, idx, st, dur)
