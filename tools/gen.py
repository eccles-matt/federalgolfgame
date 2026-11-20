import json, math, sys, os
sys.path.insert(0, '/mnt/project-files/designs/generator')
os.chdir('/mnt/project-files/designs/generator')
src = open('holes3.py').read()
src = src[:src.index('cards = []')]
g = {}
exec(compile(src, 'holes3', 'exec'), g)
H, sample, W = g['H'], g['sample'], g['W']

def r1(v): return round(v, 1)
out = []
for n in range(1, 19):
    h = H[n]
    d = dict(n=n, par=h['par'], name=h['name'], mini=h['mini'], polys=[], circles=[], caps=[], sand=[], water=[], hazards=[],
             slopes=[], jumps=[], rough=[], roos=[], bodies=[])
    if h.get('special') == 'pond8':
        segs = [('M', 180, 645), ('L', 180, 330)]
        d['polys'].append(dict(pts=[[r1(x), r1(y)] for x, y in sample(segs)], hw=97))
        d['circles'].append([185, 285, 90])
        clip = [188, 288, 88]
        for bx, by, s, rot in ((112, 276, .72, 80), (262, 266, .6, -75), (130, 354, .5, 30), (248, 352, .5, -30), (190, 206, .5, 0)):
            d['sand'].append([bx, by, rot, s, clip])
        d['water'].append(dict(x=186, y=494, sx=1.55 * .95, sy=.95, clip=[88, 440, 278, 552], exclude=[90, 430, 130, 560]))
        d['jumps'].append([186, 552, 20])
        d['tee'] = [180, 624]; d['cup'] = [194, 280, 9]
        d['roos'].append(dict(kind='sleepy', x=150, y=420))
        out.append(d); continue
    w = h.get('w', W)
    hw = w / 2 + 2
    segs = h['segs']
    d['polys'].append(dict(pts=[[r1(x), r1(y)] for x, y in sample(segs)], hw=hw))
    if 'segs2' in h:
        d['polys'].append(dict(pts=[[r1(x), r1(y)] for x, y in sample(h['segs2'])], hw=hw))
    if 'green' in h:
        x, y, r = h['green']; d['circles'].append([x, y, r + 2])
    if 'pond' in h:
        x, y, r = h['pond']; d['circles'].append([x, y, r + 2])
    if 'plateau' in h:
        cx, cy, r = h['plateau']; d['circles'].append([cx, cy, r + 2])
        gx, gy, gr = cx + 3, cy + 3, r
    else:
        gx, gy, gr = h['green'][0] + 3, h['green'][1] + 3, h['green'][2]
    if 'ramp' in h:
        x, yb, yt = h['ramp']
        cy = h['plateau'][1]
        d['caps'].append([x, yb, x, cy, 26])
        d['slopes'].append(dict(rect=[x - 26, yt, x + 26, yb], a=[0, 120]))
    if 'ramp2' in h:
        x, y, a = h['ramp2']
        cx = h['plateau'][0]
        d['caps'].append([x - 34, y, cx, y, 26])
        d['slopes'].append(dict(rect=[x - 34, y - 26, x, y + 26], a=[-120, 0]))  # ramp climbs to the right, gravity pushes back left
    if 'raised_tee' in h:
        x, y = h['raised_tee']
        d['caps'].append([x, y + 8, x, segs[0][2], 30])
    if 'segs2' in h:  # gully corridor between the two parts
        d['caps'].append([segs[-1][1], segs[-1][2], h['segs2'][0][1], h['segs2'][0][2], hw])
    if 'gully' in h:
        y0, y1 = h['gully']; d['hazards'].append(dict(rect=[0, y0 + 4, 360, y1 - 4], msg='Into the gully! +1'))
    if 'jump' in h:
        x, y = h['jump']; d['jumps'].append([x, y - 40, 20])
    if 'pond_in' in h:
        x, y, sx, sy = h['pond_in']; d['water'].append(dict(x=x, y=y, sx=sx * .94, sy=sy * .94))
    for bx, by, s, rot in h['bunkers']:
        s = round(s * 1.3, 2)
        clip = [gx, gy, gr + 6] if h.get('bclip', True) and (bx - gx) ** 2 + (by - gy) ** 2 < (gr + 34) ** 2 else None
        d['sand'].append([bx, by, rot, s, clip])
    for x, y in h.get('pots', []):
        d['rough'].append(dict(circle=[x, y, 15], k=2.5))
    for m in h.get('mounds', []):
        x, y = m[0], m[1]; r = m[2] if len(m) > 2 else 16
        d['slopes'].append(dict(radial=[x, y, r + 8], a=70))
    if 'chev' in h:
        pts, ang = h['chev']
        a = math.radians(ang)
        for x, y in pts:
            d['slopes'].append(dict(circle=[x, y, 32], a=[r1(math.sin(a) * 45), r1(-math.cos(a) * 45)]))
    lane = segs[0][1]
    def dip(y0, y1, sgn):  # sgn 1 = dip (hollow), -1 = crest
        mid = (y0 + y1) / 2
        d['slopes'].append(dict(rect=[lane - 60, mid, lane + 60, y1], a=[0, -55 * sgn]))
        d['slopes'].append(dict(rect=[lane - 60, y0, lane + 60, mid], a=[0, 55 * sgn]))
    if 'hollow' in h: dip(*h['hollow'], 1)
    if 'valley' in h: dip(*h['valley'], 1)
    if 'crest' in h: dip(h['crest'] - 30, h['crest'] + 30, -1)
    if 'hump' in h:
        x, y = h['hump']; d['slopes'].append(dict(rect=[x - 46, y, x + 46, y + 22], a=[0, 55])); d['slopes'].append(dict(rect=[x - 46, y - 22, x + 46, y], a=[0, -55]))
    if h.get('hill'): d['hill'] = True
    if h.get('funnel'): d['funnel'] = [gx, gy, gr]
    if 'scrub' in h:
        y0, y1, side = h['scrub']
        d['rough'].append(dict(scrub=[y0, y1, -1 if side == 'left' else 1], k=3))
    if 'range' in h:
        d['range'] = [[84, 430, 214, 482], [90, 500, 236, 560], [70, 360, 190, 404]]
    if h.get('bigcup'):
        d['cup'] = [gx, gy, 16]; d['flag'] = '#ffd23f'; d['cupDrop'] = 230
    else:
        d['cup'] = [gx + 4, gy - 6, 9]
    tx, ty = h['tee']; d['tee'] = [tx, ty - 6]
    if h.get('roo'):
        k, x, y = h['roo']; d['roos'].append(dict(kind=k, x=x, y=y))
    out.append(d)
json.dump(out, open('/home/user/build/holes.json', 'w'))
print(sum(h['par'] for h in out), [ (h['n'], h['par']) for h in out])
