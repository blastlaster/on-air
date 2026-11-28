/* =============================================================
   blug.dj/jej in 2.5D — the same room, drawn as a real space.

   A way of drawing, not a different room: hall.js runs the room exactly
   as in 2D (the engine, the messages and the room's 240 × 150
   coordinates don't change) and hands this the people and what's on;
   this draws them with the graphics card (WebGL 1) at the screen's own
   resolution. The walls, floor, stage, speakers and radio are boxes and
   panels that keep their place and facing; people are today's sprites
   on cards turned to the camera. Outside the station: outer space. Club
   lights sweep the dance floor while the music's on. The camera is the
   station's: it frames the whole room, and nobody turns it by hand.

   Clicks come back as 2D room coordinates (pick), so everything in
   hall.js that takes a click works unchanged; names and bubbles are
   placed with at(). design/hall-25d-scope.md has the plan and what's
   still to come over from 2D.

   The world: x = room x (0–240), z = room y (the back wall at 58, the
   front edge at 150), y = up, in room pixels.
   ============================================================= */
(function () {
    'use strict';
    const A = window.HallArt;
    const Z0 = 58, Z1 = A.H, WALL = 58, FH = 20, SLAB = 12, BALL = [120, 66, 80], NL = 8, AW = 2048, AH = 512;

    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
    const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, 1];
    const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };

    /* ---------- the camera ---------- */
    function basis(c) {
        const cp = Math.cos(c.pitch), eye = [c.at[0] + Math.sin(c.yaw) * cp * c.dist, c.at[1] + Math.sin(c.pitch) * c.dist, c.at[2] + Math.cos(c.yaw) * cp * c.dist];
        const fw = norm(sub(c.at, eye)), right = norm(cross(fw, [0, 1, 0])), up = cross(right, fw);
        return { eye, fw, right, up };
    }
    function viewProj(B, aspect, fov) {
        const f = 1 / Math.tan(fov * Math.PI / 360), n = 4, fa = 5000, { eye, fw, right, up } = B;
        const V = [right[0], up[0], -fw[0], 0, right[1], up[1], -fw[1], 0, right[2], up[2], -fw[2], 0, -dot(right, eye), -dot(up, eye), dot(fw, eye), 1];
        const P = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0];
        const M = new Array(16);
        for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += P[k * 4 + r] * V[c * 4 + k]; M[c * 4 + r] = s; }
        return M;
    }
    const ndc = (M, p) => { const w = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15]; return w <= 0 ? null : [(M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12]) / w, (M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13]) / w, w]; };
    // The room's own shot: straight on, a little above, as close as it can be with all of it in the window.
    const ROOM_PTS = [[-4, -SLAB, Z1], [244, -SLAB, Z1], [-4, WALL, Z0 - 4], [244, WALL, Z0 - 4], [0, FH, Z1], [240, FH, Z1], [BALL[0], BALL[1] + 6, BALL[2]]];
    function fitShot(base, pts, aspect, margin) {
        const c = { ...base, at: [...base.at] };
        for (let it = 0; it < 4; it++) {
            let lo = 20, hi = 4000, M = null;
            const fits = (d) => { c.dist = d; M = viewProj(basis(c), aspect, c.fov); return pts.every(p => { const s = ndc(M, p); return s && Math.abs(s[0]) <= margin && Math.abs(s[1]) <= margin; }); };
            for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
            fits(hi);
            const S = pts.map(p => ndc(M, p)), B = basis(c), tf = Math.tan(c.fov * Math.PI / 360);
            const cx = (Math.min(...S.map(s => s[0])) + Math.max(...S.map(s => s[0]))) / 2, cy = (Math.min(...S.map(s => s[1])) + Math.max(...S.map(s => s[1]))) / 2;
            c.at = add(add(c.at, B.right, cx * hi * tf * aspect * 0.8), B.up, cy * hi * tf * 0.8);
        }
        return c;
    }
    // The go-live intro's timings (as hall-art.js entrance()).
    const phases = (secs) => { const E = Math.min(A.ENTRANCE, Math.max(1, secs)), k = E / A.ENTRANCE; return { smoke: E, desk: E - 1.5 * k, clear: 1.5 * k, sit: 0.6 * k }; };

    /** A new 2.5D view, or null without WebGL (the room then stays 2D). */
    function create() {
        const el = document.createElement('canvas');
        el.className = 'hall-25d';
        let gl = null;
        try { gl = el.getContext('webgl', { antialias: false, alpha: false }); } catch { gl = null; }
        if (!gl) return null;

        /* ---------- pictures: today's art drawn each frame, and what's made once ---------- */
        const [roomC, roomG] = canvas(256, 256), [midC, midG] = canvas(256, 64), [sideC, sideG] = canvas(128, 64), [atlasC, atlasG] = canvas(AW, AH);
        const [ballC, ballG] = canvas(16, 16), [scrC, scrG] = canvas(256, 64);
        const [shadowC, shadowG] = canvas(16, 16);
        shadowG.fillStyle = 'rgba(0,0,0,0.45)'; shadowG.beginPath(); shadowG.ellipse(8, 8, 7.5, 7.5, 0, 0, Math.PI * 2); shadowG.fill();
        const [whiteC, whiteG] = canvas(2, 2); whiteG.fillStyle = '#fff'; whiteG.fillRect(0, 0, 2, 2);
        const [beamC, beamG] = canvas(4, 64);
        for (let y = 0; y < 64; y++) { beamG.fillStyle = 'rgba(255,255,255,' + (0.34 * Math.pow(1 - y / 64, 1.6) + 0.02).toFixed(3) + ')'; beamG.fillRect(0, y, 4, 1); }
        const [puffC, puffG] = canvas(32, 32);
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.hypot(x - 15.5, y - 15.5) / 16; if (d < 1) { puffG.fillStyle = 'rgba(216,212,240,' + Math.min(1, (1 - d) * 1.6).toFixed(2) + ')'; puffG.fillRect(x, y, 1, 1); } }
        let seed = 7; const srnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };   // the same sky every time
        const [hullC, hullG] = canvas(128, 64);                       // the station's outside: panels, rivets, portholes
        hullG.fillStyle = '#1a1726'; hullG.fillRect(0, 0, 128, 64);
        for (let y = 0; y < 64; y += 16) for (let x = 0; x < 128; x += 32) {
            hullG.fillStyle = '#0e0c16'; hullG.fillRect(x, y, 32, 1); hullG.fillRect(x, y, 1, 16);
            hullG.fillStyle = '#272238'; hullG.fillRect(x + 1, y + 1, 31, 1);
            hullG.fillStyle = '#3a3452'; hullG.fillRect(x + 2, y + 3, 1, 1); hullG.fillRect(x + 29, y + 3, 1, 1); hullG.fillRect(x + 2, y + 13, 1, 1); hullG.fillRect(x + 29, y + 13, 1, 1);
            if (srnd() < 0.35) { hullG.fillStyle = '#0a0910'; hullG.fillRect(x + 12, y + 6, 8, 4); hullG.fillStyle = srnd() < 0.5 ? '#ffd78a' : '#7fe8ff'; hullG.fillRect(x + 13, y + 7, 6, 2); }
        }
        const [nebC, nebG] = canvas(1024, 512);                       // a soft nebula band all the way round
        (() => {
            nebG.fillStyle = '#030208'; nebG.fillRect(0, 0, 1024, 512);
            const band = (x) => 250 + Math.sin(x / 1024 * Math.PI * 2 + 0.6) * 110;
            const blob = (x, y, r, col, a) => { for (const ox of [-1024, 0, 1024]) { const g = nebG.createRadialGradient(x + ox, y, 0, x + ox, y, r); g.addColorStop(0, 'rgba(' + col + ',' + a + ')'); g.addColorStop(1, 'rgba(' + col + ',0)'); nebG.fillStyle = g; nebG.fillRect(x + ox - r, y - r, r * 2, r * 2); } };
            const gauss = () => (srnd() + srnd() + srnd() - 1.5);
            nebG.globalCompositeOperation = 'lighter';
            const COLS = ['120,40,170', '190,40,120', '30,110,170', '70,50,200', '40,140,150', '210,90,60'];
            for (let i = 0; i < 240; i++) { const x = srnd() * 1024; blob(x, band(x) + gauss() * 90, 25 + srnd() * 120, COLS[Math.floor(srnd() * (i % 9 ? 5 : 6))], (0.03 + srnd() * 0.07).toFixed(3)); }
            for (let i = 0; i < 5000; i++) { const x = srnd() * 1024, y = band(x) + gauss() * 70; nebG.fillStyle = 'rgba(220,210,255,' + (0.05 + srnd() * 0.12).toFixed(3) + ')'; nebG.fillRect(x, y, 1, 1); }
            nebG.globalCompositeOperation = 'source-over';
            for (let i = 0; i < 60; i++) { const x = srnd() * 1024; blob(x, band(x) + gauss() * 25, 10 + srnd() * 30, '2,1,6', 0.35); }
        })();
        const [galC, galG] = canvas(256, 256);                        // four galaxies, 128 × 128 each
        (() => {
            const spiral = (cx, cy, hue, arms, tilt, rot) => {
                galG.save(); galG.translate(cx, cy); galG.rotate(rot); galG.scale(1, tilt);
                const g = galG.createRadialGradient(0, 0, 0, 0, 0, 22); g.addColorStop(0, 'rgba(255,245,230,0.95)'); g.addColorStop(0.35, 'rgba(' + hue + ',0.5)'); g.addColorStop(1, 'rgba(' + hue + ',0)');
                galG.fillStyle = g; galG.fillRect(-22, -22, 44, 44);
                for (let a = 0; a < arms; a++) for (let k = 0; k < 900; k++) {
                    const th = k / 900 * Math.PI * 3.4, r = 4 + th * 5 + (srnd() - 0.5) * 6, an = th + a * Math.PI * 2 / arms + (srnd() - 0.5) * 0.35;
                    galG.fillStyle = 'rgba(' + (srnd() < 0.3 ? '255,255,255' : hue) + ',' + (0.55 * (1 - r / 60)).toFixed(3) + ')';
                    galG.fillRect(Math.cos(an) * r, Math.sin(an) * r, 1.3, 1.3);
                }
                galG.restore();
            };
            spiral(64, 64, '150,170,255', 2, 0.42, 0.5); spiral(192, 64, '255,140,200', 3, 0.75, -0.3); spiral(64, 192, '140,255,220', 2, 0.3, 1.1);
            galG.save(); galG.translate(192, 192); galG.scale(1, 0.6);
            const g = galG.createRadialGradient(0, 0, 0, 0, 0, 40); g.addColorStop(0, 'rgba(255,230,190,0.9)'); g.addColorStop(0.3, 'rgba(255,190,140,0.35)'); g.addColorStop(1, 'rgba(255,180,120,0)');
            galG.fillStyle = g; galG.fillRect(-40, -40, 80, 80); galG.restore();
        })();
        const GALAXIES = [{ d: [-0.55, 0.3, -1], s: 0.22, c: 0 }, { d: [0.8, 0.12, -1], s: 0.1, c: 3 }, { d: [1, 0.35, 0.25], s: 0.18, c: 1 }, { d: [-1, -0.15, 0.35], s: 0.16, c: 2 }, { d: [0.15, -0.6, -0.8], s: 0.12, c: 1 }];

        /* ---------- the shaders: lit textured panels; the sky ---------- */
        const HI = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
        const program = (vs, fs, attrs) => {
            const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
            const p = gl.createProgram();
            gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, HI + fs));
            attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
            gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
            return p;
        };
        let main, sky;
        try {
            main = program('attribute vec3 p;attribute vec2 uv;uniform mat4 m;varying vec2 v;varying vec3 w;void main(){gl_Position=m*vec4(p,1.);v=uv;w=p;}',
                `uniform sampler2D tex;uniform vec4 tint;uniform float cut,lit,amb,disco,time;uniform vec3 ball;
                 uniform vec3 Lp[${NL}];uniform vec4 Ld[${NL}];uniform vec3 Lc[${NL}];varying vec2 v;varying vec3 w;
                 void main(){
                   vec4 c=texture2D(tex,v)*tint;if(c.a<cut)discard;
                   vec3 col=c.rgb;
                   float inside=step(-.5,w.x)*step(w.x,240.5)*step(57.5,w.z)*step(-.5,w.y);
                   if(lit>.5&&inside>.5){
                     vec3 L=vec3(amb);
                     for(int i=0;i<${NL};i++){vec3 r=normalize(w-Lp[i]+vec3(0.,.0001,0.));float k=dot(r,Ld[i].xyz);L+=Lc[i]*smoothstep(Ld[i].w,mix(Ld[i].w,1.,.3),k);}
                     if(disco>0.){
                       vec3 r=normalize(w-ball);
                       vec2 g=vec2((atan(r.z,r.x)+time*.45)/6.2831853*40.,asin(clamp(r.y,-1.,1.))/6.2831853*40.);
                       vec2 id=floor(g),f=fract(g)-.5;float h=fract(sin(dot(id,vec2(12.9898,78.233)))*43758.5453);
                       float s=step(max(abs(f.x),abs(f.y)),.14)*step(.5,h);
                       L+=s*disco*mix(vec3(1.),vec3(.6+.4*sin(h*20.),.6+.4*sin(h*31.),1.),.6);
                     }
                     col=col*L+(L-vec3(amb))*.05;
                   }
                   gl_FragColor=vec4(col,c.a);
                 }`, ['p', 'uv']);
            sky = program('attribute vec2 p;varying vec2 q;void main(){q=p;gl_Position=vec4(p,.999,1.);}',
                `uniform vec3 R,Up,Fw;uniform vec2 tf;uniform sampler2D neb;uniform float px,time;varying vec2 q;
                 float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
                 vec3 layer(vec2 uv,float face,float n,float sz,float dens){
                   vec2 g=uv*n,id=floor(g)+face*97.,f=fract(g);float r=h2(id);if(r>dens)return vec3(0.);
                   vec2 o=vec2(h2(id+3.1),h2(id+7.7))*.6+.2,dd=abs(f-o)/n;
                   float s=px*sz*(.7+1.6*h2(id+1.3)),m=step(max(dd.x,dd.y),s);
                   float tw=.65+.35*sin(time*(1.+3.*h2(id+5.))+r*40.);
                   return mix(vec3(.7,.8,1.),vec3(1.,.85,.7),h2(id+9.))*m*tw*(.45+.55*h2(id+2.));
                 }
                 void main(){
                   vec3 d=normalize(Fw+R*q.x*tf.x+Up*q.y*tf.y),a=abs(d);vec2 uv;float face;
                   if(a.x>=a.y&&a.x>=a.z){uv=d.yz/a.x;face=d.x>0.?0.:1.;}else if(a.y>=a.z){uv=d.xz/a.y;face=d.y>0.?2.:3.;}else{uv=d.xy/a.z;face=d.z>0.?4.:5.;}
                   uv=uv*.5+.5;
                   vec3 c=texture2D(neb,vec2(atan(d.x,-d.z)/6.2831853+.5,acos(clamp(d.y,-1.,1.))/3.1415927)).rgb;
                   c+=layer(uv,face,34.,.75,.4)+layer(uv,face,90.,.5,.3)*.8;
                   gl_FragColor=vec4(c,1.);
                 }`, ['p']);
        } catch (err) { console.warn('2.5D: no shaders', err); return null; }
        const U = (n) => gl.getUniformLocation(main, n), S = (n) => gl.getUniformLocation(sky, n);
        const loc = { m: U('m'), tint: U('tint'), cut: U('cut'), lit: U('lit'), amb: U('amb'), disco: U('disco'), time: U('time'), ball: U('ball'), Lp: U('Lp[0]'), Ld: U('Ld[0]'), Lc: U('Lc[0]') };
        const sloc = { R: S('R'), Up: S('Up'), Fw: S('Fw'), tf: S('tf'), px: S('px'), time: S('time') };
        const vbo = gl.createBuffer(), skyBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const texture = (c, name, o = {}) => {
            const tx = gl.createTexture(), mip = o.mip !== false, L = o.linear;
            gl.bindTexture(gl.TEXTURE_2D, tx);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, L ? gl.LINEAR : gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? (L ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_LINEAR) : (L ? gl.LINEAR : gl.NEAREST));
            const wrap = o.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
            return { tx, c, name, up() { gl.bindTexture(gl.TEXTURE_2D, tx); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); if (mip) gl.generateMipmap(gl.TEXTURE_2D); } };
        };
        const T = {
            room: texture(roomC, 'room'), mid: texture(midC, 'mid'), side: texture(sideC, 'side'), atlas: texture(atlasC, 'atlas'), ball: texture(ballC, 'ball'), puff: texture(puffC, 'puff'),
            shadow: texture(shadowC, 'shadow'), white: texture(whiteC, 'white'), hull: texture(hullC, 'hull', { repeat: true }),
            beam: texture(beamC, 'beam', { linear: true, mip: false }), neb: texture(nebC, 'neb', { linear: true, mip: false, repeat: true }), gal: texture(galC, 'gal', { linear: true })
        };
        for (const k of ['shadow', 'white', 'hull', 'beam', 'neb', 'gal', 'puff']) T[k].up();

        /* ---------- batches: polygons gathered per texture, pass and colour, then drawn in a few calls ---------- */
        const batch = new Map();
        let B = null, M = null, W = 1, H = 1;
        function tris(tex, pass, P, UV, o = {}) {
            const tint = o.tint ? (typeof o.tint === 'string' ? hex(o.tint) : o.tint) : null;
            const lit = o.lit != null ? o.lit : (pass === 'solid' || pass === 'cut' || pass === 'card');
            const k = o.key || pass + ':' + tex.name + ':' + (o.tint || '') + ':' + lit;
            let b = batch.get(k);
            if (!b) batch.set(k, b = { tex, pass, tint, lit, v: [] }); else if (o.key) b.tint = tint;
            const sw = tex.c.width, sh = tex.c.height;
            for (let i = 1; i < P.length - 1; i++) for (const j of [0, i, i + 1]) b.v.push(P[j][0], P[j][1], P[j][2], UV[j][0] / sw, UV[j][1] / sh);
        }
        const quad = (tex, pass, a, b, c, d, u0, v0, u1, v1, o) => tris(tex, pass, [a, b, c, d], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], o);
        function box(x0, x1, y0, y1, z0, z1, front, side, top) {
            if (front) quad(front.tex, 'solid', [x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1], front.u0, front.v0, front.u1, front.v1);
            else quad(T.white, 'solid', [x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1], 0, 0, 1, 1, { tint: side });
            quad(T.white, 'solid', [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0], 0, 0, 1, 1, { tint: side });
            quad(T.white, 'solid', [x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1], 0, 0, 1, 1, { tint: side });
            quad(T.white, 'solid', [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, 1, { tint: top });
        }
        function billboard(tex, c, w, h, u0, v0, u1, v1, tint, lit, key) {   // key: see-through (smoke, flashes), not cut out
            const r = B.right, u = B.up, P = [add(add(c, r, -w / 2), u, h / 2), add(add(c, r, w / 2), u, h / 2), add(add(c, r, w / 2), u, -h / 2), add(add(c, r, -w / 2), u, -h / 2)];
            tris(tex, key ? 'smoke' : 'cut', P, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], { tint, lit: !!lit, key });
        }

        /* The mirror ball's arm: out (1) or pulled back into the wall top (0) while FunpostTV is in the middle of the stage. */
        let ballK = 1;
        const ballAt = () => { const e = ballK * ballK * (3 - 2 * ballK); return [BALL[0], BALL[1] + (1 - e) * 4, Z0 - 2 + (BALL[2] - Z0 + 2) * e]; };
        /* ---------- the camera: the room's own shot (moments that move it come later, from the station) ---------- */
        const cam = { yaw: 0, pitch: 0.5, dist: 300, fov: 40, at: [120, 14, 104] };
        let roomShot = null, roomAspect = 0, aimed = false, cue = null, clock = 0;
        /* Moments: the camera goes somewhere for a few seconds, then back to the whole room. Nobody's held there
           and walking goes on. From the host (hall-cam: stage, outside) or the room itself (dodge). */
        const CUES = {
            stage: { len: 3.5, shot: () => ({ yaw: 0, pitch: 0.32, dist: roomShot.dist * 0.62, fov: 40, at: [120, 22, 74] }) },
            outside: { len: 6, shot: (s) => ({ yaw: 0.55 + s * 0.05, pitch: 0.3, dist: 560, fov: 40, at: [120, 16, 104] }) },
            dodge: { len: 5, shot: (s) => ({ yaw: 0.7 * Math.sin(s / 5 * Math.PI * 2), pitch: 0.42, dist: roomShot.dist * 1.08, fov: roomShot.fov, at: [120, 14, 100] }) }
        };
        /* Watching FunpostTV from a seat in front of the stage: the camera drops to your eyes, looking up at the TV in
           the middle of the stage — almost the whole screen off air; live, the TV on the left and Radioman (his desk
           moved aside) on the right. You can look a little either way and zoom in or out. */
        let watchV = null, watchShot = null, watchKey = '';
        const TVR = { x0: 84, x1: 156, top: 58 - 3, bot: 58 - 37 };       // hall-art.js CENTRE_TV, on the stage at Z0 + 3
        function watchAim(aspect) {
            const v = watchV, key = [v.live ? 1 : 0, Math.round(v.deskX || 0), Math.round(v.seatX), aspect.toFixed(3)].join(':');
            if (key !== watchKey) {
                const z = Z0 + 3, pts = [[TVR.x0, TVR.top, z], [TVR.x1, TVR.top, z], [TVR.x1, TVR.bot, z], [TVR.x0, TVR.bot, z]];
                if (v.live) { const dx = 120 + (v.deskX || 0); pts.push([dx - 26, 54, z], [dx + 26, 54, z], [dx - 26, 9, z], [dx + 26, 9, z]); }
                watchShot = fitShot({ yaw: -(v.seatX - 120) / 260, pitch: -0.08, dist: 120, fov: 46, at: [120, 38, z] }, pts, aspect, v.live ? 0.9 : 0.97);
                watchKey = key;
            }
            const s = watchShot, k = v.zoom || 1;
            return { yaw: s.yaw + (v.look || 0) * 0.4, pitch: s.pitch, dist: s.dist * k, fov: s.fov, at: s.at };
        }
        function camAim(dt, t) {
            const aspect = W / H;
            if (!roomShot || Math.abs(aspect - roomAspect) > 0.001) { roomShot = fitShot({ yaw: 0, pitch: 0.5, dist: 300, fov: 40, at: [120, 14, 104] }, ROOM_PTS, aspect, 0.96); roomAspect = aspect; }
            clock = t;
            if (cue && cue.at == null) cue.at = t;
            if (cue && t - cue.at > CUES[cue.kind].len) cue = null;
            const s = cue ? CUES[cue.kind].shot(t - cue.at) : watchV ? watchAim(aspect) : roomShot, e = aimed ? Math.min(1, dt * (watchV ? 3.2 : 2.4)) : 1;
            aimed = true;
            for (const k of ['yaw', 'pitch', 'dist', 'fov']) cam[k] += (s[k] - cam[k]) * e;
            for (let i = 0; i < 3; i++) cam.at[i] += (s.at[i] - cam.at[i]) * e;
        }

        /* ---------- the club lights: lamps on the wall tops, a follow spot from above ---------- */
        const PAL = ['#ff2f6e', '#39e6ff', '#ffd34a', '#9a5cff', '#33ff99', '#ff8a2a'].map(hex);
        const FIX = [[40, WALL + 2.5, Z0 + 0.5], [93, WALL + 2.5, Z0 + 0.5], [147, WALL + 2.5, Z0 + 0.5], [200, WALL + 2.5, Z0 + 0.5], [-2, 41, 104], [242, 41, 104], [120, 100, 175]];
        const walkX = (left, secs) => { const P = phases(secs), w = Math.min(1, Math.max(0, (P.desk - left) / Math.max(0.1, P.desk - P.sit))); return 34 + (120 - 34) * w; };
        function lightsAt(t, o) {
            const club = o.club, beat = t / 0.5, flash = Math.pow(1 - (beat % 1), 3), il = o.intro;
            return FIX.map((P, i) => {
                let Tg = null, col = [0, 0, 0], k = 0, half = 0.17;
                if (il != null && i < 6) { Tg = [120 + 70 * Math.sin(t * 1.3 + i * 1.1), 9, Z0 + 6]; col = il > 0 ? (i % 2 ? [1, 0.35, 0.7] : [0.55, 0.45, 1]) : [1, 1, 1]; k = il > 0 ? 0.45 : 0.9; }
                else if (i === 6 && il != null && il > 0 && il <= phases(o.introSecs).desk) { Tg = [walkX(il, o.introSecs), 28, Z0 + 3]; col = [1, 0.92, 0.75]; k = 0.35; half = 0.11; }
                else if (i === 6 && o.air.live) { Tg = [120 + (o.deskX || 0), 28, Z0 + 3]; col = [1, 0.92, 0.75]; k = 0.3; half = 0.15; }
                else if (club) {
                    Tg = [120 + 92 * Math.sin(t * (0.33 + 0.07 * i) + i * 1.7), 0, 106 + 36 * Math.sin(t * (0.47 + 0.05 * i) + i * 2.3)];
                    col = PAL[(i * 2 + Math.floor(beat / 2 + i * 0.5)) % 6]; k = 0.65 + 0.55 * flash;
                }
                return { P, T: Tg || [P[0], 0, 104], col, k, half, beam: i < 6 && k > 0 };
            });
        }

        /* ---------- painting today's art for the walls ---------- */
        function paintSides(t, music) {
            sideG.clearRect(0, 0, 128, 64);
            for (let x = 0; x < 92; x++) { sideG.fillStyle = Math.floor(x / 6) % 2 ? '#211b37' : '#1d1830'; sideG.fillRect(x, 0, 1, 58); }
            sideG.fillStyle = '#120f1c'; sideG.fillRect(0, 56, 92, 2);
            sideG.fillStyle = music && Math.floor(t * 2) % 2 ? '#ff9ad2' : '#ff5ab0'; sideG.fillRect(0, 8, 92, 1);
        }
        function paintBall(t) {
            ballG.clearRect(0, 0, 16, 16);
            for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
                const dx = x - 7.5, dy = y - 7.5; if (dx * dx + dy * dy > 56) continue;
                const tx = Math.floor((x + t * 7) / 2.5), ty = Math.floor(y / 2.5), h = Math.abs(Math.sin(tx * 12.9 + ty * 78.2) * 437.5) % 1;
                const g = Math.round(90 + h * 150 - (dy + dx) * 4); ballG.fillStyle = 'rgb(' + g + ',' + g + ',' + Math.min(255, g + 25) + ')'; ballG.fillRect(x, y, 1, 1);
            }
        }
        function paintAll(t, o) {
            const a = { ...o.air, noNoise: true };                      // the speakers' waves are rings in the room, not on the wall
            roomG.clearRect(0, 0, 256, 256); A.room(roomG, t, a, o.info);
            if (o.under) o.under(roomG);                                // what lies on the floor or the wall (crop circles, the court, stage effects)
            midG.clearRect(0, 0, 256, 64);
            if (o.intro != null && !o.air.live) A.entrance(midG, t, o.intro, o.introSecs, a, o.info);
            else A.centre(midG, t, o.talking ? { ...a, talking: true } : a, o.info);
            if (o.intro != null) { const Sc = A.SCREEN; A.introOver(scrG, t, o.intro, o.introSecs, true); roomG.drawImage(scrC, Sc.x, Sc.y, Sc.w, Sc.h, Sc.x, Sc.y, Sc.w, Sc.h); }
            paintSides(t, o.air.music); paintBall(t);
        }

        /* ---------- the station ---------- */
        function drawStation(t, o, LIGHTS) {
            const a = o.air, il = o.intro, hull = (P, w, h) => tris(T.hull, 'solid', P, [[0, 0], [w, 0], [w, h], [0, h]]);
            quad(T.room, 'solid', [0, 0, Z0], [A.W, 0, Z0], [A.W, 0, Z1], [0, 0, Z1], 0, 58, 240, 150);
            quad(T.room, 'solid', [0, WALL, Z0], [A.W, WALL, Z0], [A.W, 0, Z0], [0, 0, Z0], 0, 0, 240, 58);
            tris(T.side, 'solid', [[0, WALL, Z0], [0, FH, Z1], [0, 0, Z1], [0, 0, Z0]], [[0, 0], [92, WALL - FH], [92, 58], [0, 58]]);
            tris(T.side, 'solid', [[A.W, FH, Z1], [A.W, WALL, Z0], [A.W, 0, Z0], [A.W, 0, Z1]], [[92, WALL - FH], [0, 0], [0, 58], [92, 58]]);
            const X0 = -4, X1 = 244, ZB = Z0 - 4, Y0 = -SLAB, D = Z1 - ZB;
            hull([[X0, WALL, ZB], [X0, FH, Z1], [X0, Y0, Z1], [X0, Y0, ZB]], D, WALL - Y0);
            hull([[X1, FH, Z1], [X1, WALL, ZB], [X1, Y0, ZB], [X1, Y0, Z1]], D, WALL - Y0);
            hull([[X1, WALL, ZB], [X0, WALL, ZB], [X0, Y0, ZB], [X1, Y0, ZB]], X1 - X0, WALL - Y0);
            hull([[X0, 0, Z1], [X1, 0, Z1], [X1, Y0, Z1], [X0, Y0, Z1]], X1 - X0, SLAB);
            hull([[X0, Y0, Z1], [X1, Y0, Z1], [X1, Y0, ZB], [X0, Y0, ZB]], X1 - X0, D);
            for (const [xa, xb] of [[X0, 0], [A.W, X1]]) {
                quad(T.white, 'solid', [xa, WALL, ZB], [xb, WALL, ZB], [xb, FH, Z1], [xa, FH, Z1], 0, 0, 1, 1, { tint: '#2c2740' });
                quad(T.white, 'solid', [xa, FH, Z1], [xb, FH, Z1], [xb, 0, Z1], [xa, 0, Z1], 0, 0, 1, 1, { tint: '#221e32' });
            }
            quad(T.white, 'solid', [X0, WALL, ZB], [X1, WALL, ZB], [X1, WALL, Z0], [X0, WALL, Z0], 0, 0, 1, 1, { tint: '#2c2740' });
            const neon = a.music && Math.floor(t * 2) % 2 ? '#ff9ad2' : '#ff5ab0';
            quad(T.white, 'cut', [X0, -1.5, Z1 + 0.05], [X1, -1.5, Z1 + 0.05], [X1, -3, Z1 + 0.05], [X0, -3, Z1 + 0.05], 0, 0, 1, 1, { tint: neon, lit: false });
            box(-3, -1.5, WALL, WALL + 42, ZB + 0.5, ZB + 2, null, '#4a4560', '#5a5470');
            if (Math.floor(t * 1.2) % 2) billboard(T.white, [-2.25, WALL + 43, ZB + 1.25], 1.6, 1.6, 0, 0, 1, 1, '#ff3030');
            // The stage and speakers stand behind the floor's back edge (FLOOR.y0), so nobody walks into them.
            box(30, 210, 0, 9, Z0, Z0 + 6, { tex: T.room, u0: 30, v0: 49, u1: 210, v1: 58 }, '#35200f', '#4a2e1c');
            box(4, 24, 0, 34, Z0, Z0 + 6, { tex: T.room, u0: 4, v0: 24, u1: 24, v1: 58 }, '#2a2438', '#3d3552');
            box(216, 236, 0, 34, Z0, Z0 + 6, { tex: T.room, u0: 216, v0: 24, u1: 236, v1: 58 }, '#2a2438', '#3d3552');
            // The middle of the stage: Radioman behind his desk (live, or walking out in the intro), or the radio as a box.
            if (a.live || il != null || (o.info && o.info.tv)) quad(T.mid, 'cut', [30, 58, Z0 + 3], [210, 58, Z0 + 3], [210, 9, Z0 + 3], [30, 9, Z0 + 3], 30, 0, 210, 49);
            else {
                box(90, 150, 9, 9 + 42, Z0 + 1, Z0 + 5, { tex: T.mid, u0: 90, v0: 7, u1: 150, v1: 49 }, '#1a1724', '#4a4360');
                quad(T.mid, 'cut', [100, 9 + 52, Z0 + 3], [140, 9 + 52, Z0 + 3], [140, 9 + 42, Z0 + 3], [100, 9 + 42, Z0 + 3], 100, -3, 140, 7);
            }
            // Sound waves: rings out of each speaker (and the radio's), rolling across the room.
            const emit = [[14, 12, Z0 + 6.2, [0.75, 0.12, 1], 54, 3, 4], [226, 12, Z0 + 6.2, [-0.75, 0.12, 1], 54, 3, 4]];
            if (!a.live && il == null && !(o.info && o.info.tvK)) emit.push([103, 24, Z0 + 5.2, [-1, 0.1, 0.55], 34, 2, 3], [137, 24, Z0 + 5.2, [1, 0.1, 0.55], 34, 2, 3]);
            if (a.music) for (const [sx, sy, sz, dv, far, n, r0] of emit) {
                const or = [sx, sy, sz], ax = norm(dv), r = norm(cross(ax, [0, 1, 0])), u = cross(r, ax), N = 28;
                for (let i = 0; i < n; i++) {
                    const d = (t * 24 + i * far / n) % far, fade = Math.min(1, d / 4) * (1 - d / far), rad = r0 + d * 0.32, c = add(or, ax, d);
                    const col = i % 2 ? [1, 0.75, 0.27, 0.9 * fade] : [1, 1, 1, 0.9 * fade];
                    for (let j = 0; j < N; j++) {
                        if (j % 7 === 6) continue;
                        const a0 = j / N * Math.PI * 2, a1 = (j + 1) / N * Math.PI * 2, at = (an, rr) => add(add(c, r, Math.cos(an) * rr), u, Math.sin(an) * rr);
                        tris(T.white, 'beam', [at(a0, rad), at(a1, rad), at(a1, rad + 1.2), at(a0, rad + 1.2)], [[0, 0], [1, 0], [1, 1], [0, 1]], { tint: col, lit: false, key: 'wave' + sx + i });
                    }
                }
            }
            if (il != null) introFx(t, il, o.introSecs);
            // The mirror ball, on an arm out from the back wall.
            const bp = ballAt();
            if (ballK > 0.02) {
                box(119, 121, WALL, bp[1] + 6, Z0 - 2, Z0, null, '#3a3550', '#4a4560');
                box(119, 121, bp[1] + 4.5, bp[1] + 6, Z0 - 2, bp[2], null, '#3a3550', '#4a4560');
                const sz = 9 * Math.min(1, 0.2 + ballK);
                billboard(T.ball, bp, sz, sz, 0, 0, 16, 16, null, false);
            }
            // The lamps, their lenses the colour they're shining, and their beams.
            LIGHTS.forEach((L, i) => {
                if (i === 6) return;
                const ax = norm(sub(L.T, L.P));
                box(L.P[0] - 2, L.P[0] + 2, L.P[1] - 2.5, L.P[1] + 1.5, L.P[2] - 2, L.P[2] + 2, null, '#22202c', '#33303f');
                const r = norm(cross(ax, [0, 1, 0])), u = cross(r, ax), c = add(L.P, ax, 2.3), lens = L.k > 0 ? [L.col[0], L.col[1], L.col[2], 1] : [0.15, 0.14, 0.2, 1];
                tris(T.white, 'cut', [add(add(c, r, -1.5), u, 1.5), add(add(c, r, 1.5), u, 1.5), add(add(c, r, 1.5), u, -1.5), add(add(c, r, -1.5), u, -1.5)], [[0, 0], [1, 0], [1, 1], [0, 1]], { tint: lens, lit: false, key: 'lens' + i });
                if (!L.beam) return;
                const len = Math.hypot(...sub(L.T, L.P)) * 1.15, rad = len * Math.tan(L.half), base = add(L.P, ax, len), N = 14;
                for (let j = 0; j < N; j++) {
                    const a0 = j / N * Math.PI * 2, a1 = (j + 1) / N * Math.PI * 2;
                    const p0 = add(add(base, r, Math.cos(a0) * rad), u, Math.sin(a0) * rad), p1 = add(add(base, r, Math.cos(a1) * rad), u, Math.sin(a1) * rad);
                    tris(T.beam, 'beam', [L.P, p0, p1], [[2, 0], [0, 64], [4, 64]], { tint: [L.col[0], L.col[1], L.col[2], 0.55 * L.k], lit: false, key: 'beam' + i });
                }
            });
        }
        /** The intro's smoke (real puffs on the stage), and the flash, ring and sparkles as the desk lands. */
        function introFx(t, left, secs) {
            const P = phases(secs);
            const d = left > P.smoke ? 0 : left > P.desk ? (P.smoke - left) / (P.smoke - P.desk) : Math.max(0, 1 - (P.desk - left) / P.clear);
            if (d > 0) for (let i = 0; i < 30; i++) {
                const x = 30 + (i * 37) % 180 + Math.sin(t * 0.6 + i) * 6, y = 6 + (i * 13) % 40 + Math.cos(t * 0.5 + i * 2) * 3, z = Z0 + 2 + (i * 7) % 16, s = 22 + (i % 4) * 5;
                billboard(T.puff, [x, y, z], s, s * 0.75, 0, 0, 32, 32, [1, 1, 1, 0.85 * d], true, 'smoke');
            }
            const m = P.desk - left;
            if (m >= 0 && m < 0.9) {
                const f = 1 - m / 0.9, c = [120, 9.4, Z0 + 3], rad = 6 + m * 40, N = 40;
                billboard(T.puff, [120, 14, Z0 + 4], 40, 26, 0, 0, 32, 32, [1, 1, 1, Math.min(1, 1.4 * f)], false, 'flash');
                for (let j = 0; j < N; j++) {
                    const a0 = j / N * Math.PI * 2, a1 = (j + 1) / N * Math.PI * 2, at = (an, rr) => [c[0] + Math.cos(an) * rr, c[1], c[2] + Math.sin(an) * rr];
                    tris(T.white, 'beam', [at(a0, rad), at(a1, rad), at(a1, rad + 1.4), at(a0, rad + 1.4)], [[0, 0], [1, 0], [1, 1], [0, 1]], { tint: [1, 0.96, 0.66, f], lit: false, key: 'ring' });
                }
                for (let i = 0; i < 18; i++) {
                    const h = (k) => Math.abs(Math.sin(k * 91.7) * 4375.5) % 1, a = h(i) * Math.PI * 2, rr = 4 + m * (20 + h(i + 9) * 24);
                    billboard(T.white, [120 + Math.cos(a) * rr, 10 + h(i + 3) * 22 * m * 2, Z0 + 3 + Math.sin(a) * rr * 0.6], 1.6, 1.6, 0, 0, 1, 1, [1, 0.96, 0.66, f], false, 'spark');
                }
            }
        }
        /**
         * The cards: everyone (and anything else standing in the room: Daniel, explosions, the UFO), each drawn by
         * hall.js's own 2D code into a slot of one big picture, then stood up where it is, turned to the camera,
         * with a shadow under it. A card: { x, y (room point it stands on), lift (raised that far), w, h (its slot),
         * ax, ay (where (x, y) is in the slot), paint(g) (draws in room coordinates), shadow }. Drawn see-through,
         * back to front, so faded people and glows look as they do in 2D.
         */
        function drawCards(list) {
            atlasG.clearRect(0, 0, AW, AH);
            const R = [B.right[0], 0, B.right[2]], rl = Math.hypot(R[0], R[2]) || 1; R[0] /= rl; R[2] /= rl;
            let sx = 0, sy = 0, rowH = 0;
            for (const q of [...list].sort((a, b) => a.y - b.y)) {
                const w = Math.ceil(q.w || 48), h = Math.ceil(q.h || 64), ax = q.ax != null ? q.ax : w / 2, ay = q.ay != null ? q.ay : h - 6;
                if (sx + w > AW) { sx = 0; sy += rowH; rowH = 0; }
                if (sy + h > AH) break;                                   // (no room left this frame)
                atlasG.save(); atlasG.beginPath(); atlasG.rect(sx, sy, w, h); atlasG.clip();
                atlasG.translate(sx + ax - Math.round(q.x), sy + ay - Math.round(q.y - (q.lift || 0)));
                try { q.paint(atlasG); } catch (err) { console.warn('2.5D card', err); }
                atlasG.restore();
                if (q.fade) {                                             // see-through (between you and the TV while you watch)
                    atlasG.save(); atlasG.globalCompositeOperation = 'destination-in'; atlasG.fillStyle = 'rgba(0,0,0,' + q.fade + ')'; atlasG.fillRect(sx, sy, w, h); atlasG.restore();
                }
                const x = q.x, z = q.y, lift = q.lift || 0, l = -ax, r = w - ax, top = ay + lift, bot = ay - h + lift;
                quad(T.atlas, 'card', [x + R[0] * l, top, z + R[2] * l], [x + R[0] * r, top, z + R[2] * r], [x + R[0] * r, bot, z + R[2] * r], [x + R[0] * l, bot, z + R[2] * l], sx, sy, sx + w, sy + h);
                if (q.shadow) quad(T.shadow, 'shadow', [x - 5, 0.1, z - 2], [x + 5, 0.1, z - 2], [x + 5, 0.1, z + 2], [x - 5, 0.1, z + 2], 0, 0, 16, 16);
                sx += w; rowH = Math.max(rowH, h);
            }
        }
        function drawGalaxies() {
            for (const g of GALAXIES) {
                const d = norm(g.d), c = add(B.eye, d, 3000), r = norm(cross(d, [0, 1, 0])), u = cross(r, d), s = 1500 * g.s;
                const cx = (g.c % 2) * 128, cy = Math.floor(g.c / 2) * 128;
                tris(T.gal, 'sky', [add(add(c, r, -s), u, s), add(add(c, r, s), u, s), add(add(c, r, s), u, -s), add(add(c, r, -s), u, -s)], [[cx, cy], [cx + 128, cy], [cx + 128, cy + 128], [cx, cy + 128]], { lit: false });
            }
        }

        /* ---------- each frame ---------- */
        let people = [], unit = 3;
        /**
         * o: { t, dt, air, info, talking, deskX, intro (seconds to live, or null), introSecs, club (lights on),
         *      cards: (drawCards), people: [{ x, y, lift }] (to click on), under(g) (paints onto the floor and wall) }
         */
        function frame(o) {
            const t = o.t;
            people = o.people || [];
            camAim(o.dt || 0, t);
            const inf = o.info || {}, tvMid = inf.tv ? (o.air.live ? Math.max(0, Math.min(1, inf.tvK || 0)) : 1) : 0;
            ballK += Math.sign((tvMid > 0.05 ? 0 : 1) - ballK) * Math.min(Math.abs((tvMid > 0.05 ? 0 : 1) - ballK), (o.dt || 0) / 0.8);
            B = basis(cam); M = viewProj(B, W / H, cam.fov);
            const pa = ndc(M, [120, 0, 104]), pb = ndc(M, [121, 0, 104]);
            if (pa && pb) unit = Math.abs(pb[0] - pa[0]) * W / 2;
            gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            // The sky: a triangle over the whole screen, each pixel looking out along its own direction.
            gl.useProgram(sky); gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf); gl.disableVertexAttribArray(1); gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
            const tf = Math.tan(cam.fov * Math.PI / 360);
            gl.uniform3fv(sloc.R, B.right); gl.uniform3fv(sloc.Up, B.up); gl.uniform3fv(sloc.Fw, B.fw); gl.uniform2f(sloc.tf, tf * W / H, tf);
            gl.uniform1f(sloc.px, tf / H); gl.uniform1f(sloc.time, t % 1000);
            gl.disable(gl.DEPTH_TEST); gl.bindTexture(gl.TEXTURE_2D, T.neb.tx); gl.drawArrays(gl.TRIANGLES, 0, 3);
            // The station.
            gl.useProgram(main); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
            const club = o.club || o.intro != null, LIGHTS = lightsAt(t, { ...o, club: o.club });
            const Lp = new Float32Array(NL * 3), Ld = new Float32Array(NL * 4), Lc = new Float32Array(NL * 3);
            LIGHTS.forEach((L, i) => { const ax = norm(sub(L.T, L.P)); Lp.set(L.P, i * 3); Ld.set([...ax, Math.cos(L.half)], i * 4); Lc.set(L.col.slice(0, 3).map(c => c * L.k), i * 3); });
            gl.uniformMatrix4fv(loc.m, false, M);
            gl.uniform3fv(loc.Lp, Lp); gl.uniform4fv(loc.Ld, Ld); gl.uniform3fv(loc.Lc, Lc);
            gl.uniform1f(loc.amb, club ? 0.62 : 1); gl.uniform1f(loc.disco, o.club ? 0.85 * ballK : 0); gl.uniform1f(loc.time, t % 1000); gl.uniform3fv(loc.ball, ballAt());
            paintAll(t, o); for (const k of ['room', 'mid', 'side', 'ball']) T[k].up();
            batch.clear(); drawGalaxies(); drawStation(t, o, LIGHTS); drawCards(o.cards || []); T.atlas.up();
            for (const pass of ['sky', 'solid', 'cut', 'shadow', 'card', 'smoke', 'beam']) {
                if (pass === 'sky') { gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false); }
                if (pass === 'solid') { gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true); }
                if (pass === 'shadow') { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
                if (pass === 'card') gl.depthMask(true);                  // see-through, back to front, and in front of what's behind
                if (pass === 'smoke') gl.depthMask(false);
                if (pass === 'beam') gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
                for (const b of batch.values()) {
                    if (b.pass !== pass) continue;
                    gl.bindTexture(gl.TEXTURE_2D, b.tex.tx);
                    gl.uniform4fv(loc.tint, b.tint || [1, 1, 1, 1]);
                    gl.uniform1f(loc.cut, pass === 'solid' || pass === 'cut' ? 0.5 : pass === 'card' ? 0.03 : 0.004);
                    gl.uniform1f(loc.lit, b.lit ? 1 : 0);
                    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(b.v), gl.STREAM_DRAW);
                    gl.drawArrays(gl.TRIANGLES, 0, b.v.length / 5);
                }
            }
            gl.depthMask(true); gl.disable(gl.BLEND);
        }
        /** Where a room point is on the canvas (device pixels): (x, height above the floor, z = room y), or null behind the camera. */
        function project(p) { if (!M) return null; const s = ndc(M, p); return s && [(s[0] * 0.5 + 0.5) * W, (0.5 - s[1] * 0.5) * H, s[2]]; }
        return {
            el,
            /** The canvas's size in device pixels. */
            size(w, h) { W = Math.max(1, Math.round(w)); H = Math.max(1, Math.round(h)); if (el.width !== W || el.height !== H) { el.width = W; el.height = H; } },
            frame,
            /** Watching FunpostTV from a seat: { seatX, live, deskX, look (-1 to 1: side to side), zoom (0.55 to 1.5) }, or null to stand up. */
            watch(v) { watchV = v; },
            /** A camera moment (CUES), starting on the next frame. */
            cue(kind) { if (CUES[kind]) cue = { kind, at: null }; },
            /** Device pixels per room pixel in the middle of the floor (for text sizes, bubbles). */
            get unit() { return unit; },
            /** The camera's far out (the station ID): names and bubbles would be specks. */
            get far() { return cam.dist > 380; },
            /**
             * Where to draw what 2D draws at room (x, y) for someone standing at room y `foot`: a point `foot - y`
             * above their feet (heads, bubbles); below the feet (names) it's just in front of them on the floor.
             */
            at(x, y, foot) { const h = foot - y, p = h < 0 ? project([x, 0, foot - h]) : project([x, h, foot]); return p ? [p[0], p[1]] : [-9999, -9999]; },
            /** Around a room spot (x, feet at y): where it is on the canvas and how many device pixels a room pixel is there. */
            lens(x, y) { const a = project([x, 0, y]), b = project([x + 1, 0, y]); return a && b ? [a[0], a[1], Math.hypot(b[0] - a[0], b[1] - a[1])] : [-9999, -9999, 1]; },
            /** A spot on the back wall (f 0) or on the stage where Radioman's desk / the TV stand is (f 1), as 2D draws it (room x, row): on the canvas. */
            wallPt(x, row, f = 0) { const p = project([x, WALL - row, Z0 + 0.05 + 3 * f]); return p ? [p[0], p[1]] : null; },
            /** On the stage, as 2D draws it (room x, row), Radioman's desk being 3 in front of the back wall. */
            atStage(x, row) { const p = project([x, WALL - row, Z0 + 3]); return p ? [p[0], p[1]] : [-9999, -9999]; },
            /**
             * A click at (sx, sy) on the canvas (device pixels), as the 2D room's coordinates: on someone, the spot on
             * their body as 2D has it (so everything that looks for whoever was clicked works as it is); else the
             * floor under the pointer.
             */
            pick(sx, sy) {
                if (!B) return [-99, -99];
                let best = null;
                for (const q of people) {
                    const f = project([q.x, q.lift || 0, q.y]), hd = project([q.x, (q.lift || 0) + 20, q.y]);
                    if (!f || !hd) continue;
                    const hw = Math.abs(hd[1] - f[1]) * 5.5 / 20;
                    if (Math.abs(sx - f[0]) <= hw && sy <= f[1] + hw * 0.4 && sy >= hd[1] && (!best || q.y > best.q.y)) best = { q, k: (f[1] - sy) / Math.max(1, f[1] - hd[1]) };
                }
                if (best) return [best.q.x, best.q.y - (best.q.lift || 0) - Math.max(0, best.k) * 18];
                const nx = sx / W * 2 - 1, ny = 1 - sy / H * 2, tf = Math.tan(cam.fov * Math.PI / 360);
                const d = norm(add(add(B.fw, B.right, nx * tf * W / H), B.up, ny * tf));
                if (d[1] >= -0.001) return [-99, -99];
                const k = -B.eye[1] / d[1];
                return [B.eye[0] + d[0] * k, B.eye[2] + d[2] * k];
            },
            destroy() { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); el.remove(); }
        };
    }
    window.HallView25 = { create };
})();
