import json, re, os
raw = json.load(open('raw.json')); defs = json.load(open('defs.json'))
os.makedirs('/home/user/federalgolfgame/holes', exist_ok=True)
def refs(s):
    return set(re.findall(r'href="#([^"]+)"', s)) | set(re.findall(r'url\(#([^)]+)\)', s))
for h in raw:
    n, s = h['n'], h['svg']
    s, k = re.subn(r'<text x="30" y="34".*?</g>\n', '', s, flags=re.S); assert k == 1, (n, 'hud')
    s, k = re.subn(r'<use href="#ball3" transform="[^"]*"></use>', '', s); assert k == 1, (n, 'ball')
    s = re.sub(r'<path d="[^"]*" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="2 8" stroke-linecap="round"></path><ellipse [^>]*rx="20" ry="5"[^>]*></ellipse>', '', s)
    s = re.sub(r'<ellipse [^>]*rx="(36|40)" ry="26" fill="#ffd23f" opacity=".18"></ellipse><ellipse [^>]*stroke-dasharray="6 6"[^>]*></ellipse>', '', s)
    s = re.sub(r'<g transform="translate\([^)]*\)( rotate\(-10\))? scale\([^)]*\)">(<use href="#roo3Shadow"></use>)?<use href="#roo3"></use></g>', '', s)
    s, k = re.subn(r'<line x1="[^"]*" y1="[^"]*" x2="[^"]*" y2="[^"]*" stroke="#fff" stroke-width="4" stroke-linecap="round"></line><path d="[^"]*" fill="#(ff6b7f|ffd23f)"></path>', '', s); assert k == 1, (n, 'flag', k)
    assert 'roo3' not in s, (n, 'roo left')
    s = re.sub(r' role="img" aria-label="[^"]*"', '', s)
    local = set(re.findall(r'id="([^"]+)"', s))
    need, done, dl = refs(s), set(), []
    while need - done - local:
        for i in list(need - done - local):
            done.add(i)
            if i not in defs: print('missing', n, i); continue
            dl.append(defs[i]); need |= refs(defs[i])
    s = s.replace('<svg viewBox="0 0 360 760">', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 760" width="360" height="760"><defs>' + ''.join(dl) + '</defs>', 1)
    open(f'/home/user/federalgolfgame/holes/h{n}.svg', 'w').write(s)
open('/home/user/federalgolfgame/roo.svg', 'w').write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-30 -52 104 100" width="208" height="200">' + defs['roo3'] + '</svg>')
print('ok')
