# Cap-configurator twin of probe-propagation.py — times Shopify propagation
# phases for the chimney cap. Creates ONE new MFC-* variant (auto-cleaned).
# Usage: python scratch/probe-propagation-cap.py
import json, time, random, urllib.request, urllib.error, http.cookiejar, sys

API = "https://chimney-cap-configurator.vercel.app/api/add-to-cart"
STORE = "https://kaminos.com"
HANDLE = "chimney-cap-configurator"
PRODUCT_ID = 10980992614593
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) propagation-probe"

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [("User-Agent", UA)]

def req(url, data=None, headers=None, timeout=35):
    h = {"Content-Type": "application/json"} if data else {}
    if headers: h.update(headers)
    r = urllib.request.Request(url, data=json.dumps(data).encode() if data else None, headers=h)
    try:
        with opener.open(r, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")

eighth = lambda lo, hi: round(random.randint(lo * 8, hi * 8)) / 8
w, l = eighth(20, 44), eighth(30, 66)
payload = {
    "width": w, "length": l,
    "vertical_skirt": 3, "horizontal_skirt": 1, "drip_edge": True,
    "material": "stainless", "mount": "skirt", "lid_type": "flat",
    "powder_coat": False, "powder_coat_color": "#000000",
    "screen_height": 12, "lid_overhang": 3, "lid_pitch": 3,
    "seam_count": 2, "flange_width": 3,
    "quantity": 1, "notes": "",
    "shopifyProductId": str(PRODUCT_ID),
}
print(f"config: w={w} l={l}")

t0 = time.time()
status, body = req(API, payload)
api_ms = int((time.time() - t0) * 1000)
data = json.loads(body)
if status != 200:
    print("API ERROR", status, body[:400]); sys.exit(1)
vid = data["variantId"]
print(f"[A] /api/add-to-cart: {api_ms}ms  variantId={vid} reused={data.get('variantReused')} propagated={data.get('propagated')} price={data.get('price')}")
print(f"    _timing={json.dumps(data.get('_timing'))}")

t_add0 = time.time()
add_ok_at = None
attempt = 0
while time.time() - t_add0 < 40:
    attempt += 1
    s, b = req(f"{STORE}/cart/add.js", {"items": [{"id": int(vid), "quantity": 1}]})
    el = time.time() - t_add0
    if s == 200:
        add_ok_at = el
        print(f"[B] cart/add.js -> 200 after {el:.1f}s (attempt {attempt})")
        break
    print(f"    cart/add.js attempt {attempt}: HTTP {s} at {el:.1f}s  {b[:90]}")
    time.sleep(1.0)
if add_ok_at is None:
    print("[B] cart/add.js NEVER accepted in 40s"); sys.exit(1)

t_price0 = time.time()
price_at = None
while time.time() - t_price0 < 40:
    s, b = req(f"{STORE}/cart.js")
    el = time.time() - t_add0
    try:
        cart = json.loads(b)
        item = next((i for i in cart.get("items", []) if i.get("variant_id") == int(vid)), None)
    except Exception:
        item = None
    p = (item or {}).get("price") or (item or {}).get("final_price") or 0
    if item and p > 0:
        price_at = el
        print(f"[C] cart.js price>0 ({p}) after {el:.1f}s since add start")
        break
    print(f"    cart.js: item={'yes' if item else 'NO'} price={p} at {el:.1f}s")
    time.sleep(1.5)

t_sec0 = time.time()
sec_at = None
while time.time() - t_sec0 < 60:
    s, b = req(f"{STORE}/products/{HANDLE}?sections=cart-drawer&_={int(time.time()*1000)}")
    el = time.time() - t_add0
    try:
        html = json.loads(b).get("cart-drawer") or ""
    except Exception:
        html = ""
    has_variant = str(vid) in html
    has_zero = "$0.00" in html or ">$0<" in html
    if has_variant and not has_zero:
        sec_at = el
        print(f"[D] rendered section has variant + non-zero after {el:.1f}s since add start")
        break
    print(f"    sections: variant={'yes' if has_variant else 'NO'} zero={'yes' if has_zero else 'no'} len={len(html)} at {el:.1f}s")
    time.sleep(1.5)

print("\n=== TIMELINE (seconds since first cart/add.js) ===")
print(f"api call duration : {api_ms/1000:.1f}s (before timeline)")
print(f"add accepted      : {add_ok_at:.1f}s" if add_ok_at else "add: never")
print(f"price > 0         : {price_at:.1f}s" if price_at else "price: never (within window)")
print(f"sections usable   : {sec_at:.1f}s" if sec_at else "sections: NEVER within 60s")
