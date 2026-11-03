(function () {
  var q = { 'mq-landscape-short': '(orientation: landscape) and (max-height: 500px)',
            'mq-reduced-motion': '(prefers-reduced-motion: reduce)' };
  Object.keys(q).forEach(function (cls) {
    var mq = window.matchMedia(q[cls]);
    var set = function () { document.documentElement.classList.toggle(cls, mq.matches); };
    set();
    if (mq.addEventListener) mq.addEventListener('change', set); else mq.addListener(set);
  });
})();

/* ============================================================
   BMW M4 Competition · Scene painter
   Paints the night-city panorama procedurally into one canvas per
   parallax layer. Painting happens once per layout (load / resize);
   at runtime the layers only move via transform.
   A seeded RNG keeps the city identical on every repaint.
   ============================================================ */
(function () {
  'use strict';

  /* Parallax factor per layer (street = 1 = the layer the cards live in). */
  var FACTORS = { sky: 0.05, far: 0.2, mid: 0.48, street: 1, fore: 1.5 };

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function between(r, a, b) { return a + (b - a) * r(); }
  function pick(r, list) { return list[Math.floor(r() * list.length)]; }

  /* Size a canvas for its CSS box and return a context in CSS pixels. */
  function prep(canvas, w, h, top, dpr) {
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.style.top = top + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function glow(ctx, x, y, r, color, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + color + ',' + alpha + ')');
    g.addColorStop(0.35, 'rgba(' + color + ',' + alpha * 0.35 + ')');
    g.addColorStop(1, 'rgba(' + color + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /* ---------- SKY ---------- */
  function paintSky(ctx, w, h, H, r) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#03050b');
    g.addColorStop(0.35, '#0d1222');
    g.addColorStop(0.62, '#2b2230');
    g.addColorStop(0.82, '#6b4128');
    g.addColorStop(1, '#a8622a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (var i = 0; i < 90; i++) {
      ctx.fillStyle = 'rgba(220,230,255,' + between(r, 0.15, 0.7) * (r() > 0.85 ? 1 : 0.6) + ')';
      var s = between(r, 0.5, 1.3);
      ctx.fillRect(r() * w, r() * h * 0.45, s, s);
    }

    // moon + halo
    var mx = w * 0.74, my = H * 0.2, mr = H * 0.011;
    glow(ctx, mx, my, H * 0.1, '160,180,225', 0.12);
    var mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 0, mx, my, mr);
    mg.addColorStop(0, 'rgba(240,238,228,0.9)');
    mg.addColorStop(1, 'rgba(200,205,215,0.75)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();

    // light-polluted low clouds
    for (var c = 0; c < 14; c++) {
      var cx = r() * w, cy = h * between(r, 0.45, 0.85), rw = between(r, 80, 220);
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(1, 0.18);
      glow(ctx, 0, 0, rw, '255,150,70', between(r, 0.08, 0.16));
      ctx.restore();
    }
  }

  /* ---------- FAR SKYLINE ---------- */
  function paintFar(ctx, w, h, H, r) {
    var x = -10;
    while (x < w) {
      var bw = between(r, 14, 44);
      var bh = r() > 0.9 ? between(r, 0.32, 0.46) * H : between(r, 0.08, 0.3) * H;
      var top = h - bh;
      var shade = Math.floor(between(r, 16, 26));
      ctx.fillStyle = 'rgb(' + (shade - 4) + ',' + shade + ',' + (shade + 18) + ')';
      ctx.fillRect(x, top, bw, bh);
      var roof = r();
      if (roof > 0.75) { ctx.fillRect(x + bw * 0.25, top - bh * 0.08, bw * 0.5, bh * 0.08); }
      else if (roof > 0.6) { ctx.fillRect(x + bw / 2 - 0.6, top - bh * 0.18, 1.2, bh * 0.18); }
      // sparse window specks
      for (var wy = top + 4; wy < h - 4; wy += 5) {
        for (var wx = x + 3; wx < x + bw - 3; wx += 4) {
          if (r() < 0.2) {
            ctx.fillStyle = 'rgba(255,200,110,' + between(r, 0.45, 0.85) + ')';
            ctx.fillRect(wx, wy, 1, 1.4);
          }
        }
      }
      x += bw + between(r, -4, 6);
    }
    // atmospheric haze toward the ground
    var g = ctx.createLinearGradient(0, h * 0.35, 0, h);
    g.addColorStop(0, 'rgba(150,90,40,0)');
    g.addColorStop(1, 'rgba(190,110,45,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /* ---------- MID CITY ---------- */
  var WARM = ['255,206,138', '255,228,184', '255,190,120'];
  var COOL = ['200,228,255', '150,220,255', '235,245,255'];
  var NEON = [['255,61,127', 'HOTEL'], ['54,224,255', 'OPEN 24H'], ['255,210,63', 'CINEMA'],
              ['180,120,255', 'BAR'], ['54,224,255', 'SUSHI'], ['255,61,127', 'CLUB']];

  function paintBuildingWindows(ctx, r, x, top, bw, bh, kind) {
    var cols, colW, rowH, ww, wh;
    if (kind === 'glass') {
      // curtain wall: vertical mullions + a few lit office floors
      var gg = ctx.createLinearGradient(x, 0, x + bw, 0);
      gg.addColorStop(0, 'rgba(70,95,140,0.22)');
      gg.addColorStop(0.5, 'rgba(30,45,75,0.1)');
      gg.addColorStop(1, 'rgba(90,110,160,0.18)');
      ctx.fillStyle = gg; ctx.fillRect(x, top, bw, bh);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (var m = x + 5; m < x + bw; m += 5) ctx.fillRect(m, top, 1, bh);
      for (var fy = top + 6; fy < top + bh - 6; fy += 7) {
        if (r() < 0.55) {
          var len = bw * between(r, 0.3, 1);
          var start = x + between(r, 0, bw - len);
          ctx.fillStyle = 'rgba(' + pick(r, r() < 0.7 ? WARM : COOL) + ',' + between(r, 0.6, 0.95) + ')';
          ctx.fillRect(start, fy, len, 3.4);
        }
      }
      return;
    }
    colW = kind === 'bands' ? bw : between(r, 6, 9);
    rowH = between(r, 8, 11);
    ww = kind === 'bands' ? bw - 8 : colW - 3;
    wh = kind === 'bands' ? 3 : rowH - 4.5;
    cols = Math.max(1, Math.floor((bw - 6) / colW));
    var ox = x + (bw - cols * colW) / 2 + (kind === 'bands' ? 4 : 1.5);
    var palette = r() > 0.12 ? WARM : COOL;
    for (var y = top + 8; y < top + bh - rowH; y += rowH) {
      var occ = r() < 0.08 ? 0 : between(r, 0.45, 0.95);
      for (var c = 0; c < cols; c++) {
        var wx = ox + c * colW;
        if (r() < occ) {
          ctx.fillStyle = 'rgba(' + pick(r, palette) + ',' + between(r, 0.75, 1) + ')';
          ctx.fillRect(wx, y, ww, wh);
          // interior depth: darker lower half of some windows
          if (r() < 0.4) { ctx.fillStyle = 'rgba(20,14,10,0.35)'; ctx.fillRect(wx, y + wh * 0.6, ww, wh * 0.4); }
        } else {
          ctx.fillStyle = 'rgba(120,80,40,0.22)';
          ctx.fillRect(wx, y, ww, wh);
        }
      }
    }
  }

  function paintNeon(ctx, x, y, color, text) {
    ctx.save();
    ctx.font = '600 9px "Barlow Condensed", "Arial Narrow", sans-serif';
    var tw = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(8,8,14,0.9)';
    ctx.fillRect(x, y, tw, 15);
    ctx.shadowColor = 'rgba(' + color + ',0.9)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(' + color + ',0.95)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, 14);
    ctx.fillStyle = 'rgba(' + color + ',1)';
    ctx.fillText(text, x + 5, y + 11);
    ctx.restore();
    glow(ctx, x + tw / 2, y + 7, 34, color, 0.16);
  }

  function paintBillboard(ctx, x, y, w, h) {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(x + w * 0.3, y + h, 3, 18);
    ctx.fillRect(x + w * 0.7, y + h, 3, 18);
    var g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#0f1a2a'); g.addColorStop(1, '#05080e');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    glow(ctx, x + w / 2, y + h / 2, w * 0.7, '120,210,255', 0.14);
    ctx.save();
    ctx.shadowColor = 'rgba(120,215,255,0.8)'; ctx.shadowBlur = 6;
    ctx.fillStyle = '#e9f6ff';
    ctx.font = '800 ' + Math.round(h * 0.36) + 'px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText('BMW M4', x + 8, y + h * 0.5);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(120,215,255,0.9)';
    ctx.font = '600 ' + Math.round(h * 0.17) + 'px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText('COMPETITION  ·  530 HP', x + 8, y + h * 0.78);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function paintMid(ctx, w, h, H, r, beacons) {
    var x = -20, billboardAt = w * 0.42, billboardDone = false;
    while (x < w) {
      var bw = between(r, 44, 112);
      if (!billboardDone && x > billboardAt) bw = 140;          // wide block to carry the billboard
      var tall = r() > 0.82;
      // tall enough that lit facades sit behind the whole feature-card band
      // (capped so rooftops stay below the HUD at the top of the screen)
      var bh = (tall ? between(r, 0.5, 0.55) : between(r, 0.4, 0.5)) * H;
      bh = Math.min(bh, h - 6);
      var top = h - bh;
      var base = Math.floor(between(r, 11, 19));
      var g = ctx.createLinearGradient(0, top, 0, h);
      g.addColorStop(0, 'rgb(' + (base + 2) + ',' + (base + 6) + ',' + (base + 20) + ')');
      g.addColorStop(1, 'rgb(' + base + ',' + (base + 2) + ',' + (base + 10) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(x, top, bw, bh);
      // sodium street light washing up the facade
      var up = ctx.createLinearGradient(0, h, 0, top);
      up.addColorStop(0, 'rgba(255,165,70,0.42)');
      up.addColorStop(0.45, 'rgba(255,150,60,0.14)');
      up.addColorStop(1, 'rgba(255,150,60,0.04)');
      ctx.fillStyle = up;
      ctx.fillRect(x, top, bw, bh);
      // rim light from the city glow
      ctx.fillStyle = 'rgba(255,200,140,0.18)';
      ctx.fillRect(x, top, 1.5, bh);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x + bw - 2, top, 2, bh);

      var kind = r() < 0.22 ? 'glass' : (r() < 0.2 ? 'bands' : 'grid');
      paintBuildingWindows(ctx, r, x, top, bw, bh, kind);

      // rooftop details
      ctx.fillStyle = 'rgb(' + base + ',' + (base + 3) + ',' + (base + 12) + ')';
      if (r() > 0.5) ctx.fillRect(x + bw * 0.15, top - 6, bw * 0.25, 6);
      if (tall) {
        ctx.fillRect(x + bw / 2 - 1, top - 26, 2, 26);
        beacons.push({ x: x + bw / 2, y: top - 26 });
      }

      if (!billboardDone && x > billboardAt && bw > 120) {      // mounted on the facade
        paintBillboard(ctx, x + (bw - 128) / 2, top + 0.12 * H, 128, 50);
        billboardDone = true;
      } else if (r() < 0.3 && bh > 0.2 * H) {
        var n = pick(r, NEON);
        paintNeon(ctx, x + between(r, 4, Math.max(5, bw - 50)), top + between(r, 14, bh * 0.5), n[0], n[1]);
      }
      x += bw + (r() < 0.3 ? between(r, 2, 10) : 0);
    }
    var hz = ctx.createLinearGradient(0, h * 0.55, 0, h);
    hz.addColorStop(0, 'rgba(160,90,40,0)');
    hz.addColorStop(1, 'rgba(200,115,45,0.4)');
    ctx.fillStyle = hz; ctx.fillRect(0, 0, w, h);
  }

  /* ---------- STREET ---------- */
  function paintStreet(ctx, w, h, top, m, r) {
    // all y values below are in stage space; shift to canvas space
    ctx.save();
    ctx.translate(0, -top);
    var roadTop = m.roadTop, curbY = m.curbY, H = m.H;
    var shopTop = roadTop - H * 0.065, walkTop = roadTop - H * 0.02;

    // storefront strip: facades with recessed, softly lit shop windows
    ctx.fillStyle = '#06070a';
    ctx.fillRect(0, shopTop, w, walkTop - shopTop);
    var x = 0;
    while (x < w) {
      var sw = between(r, 34, 84);
      var winTop = shopTop + H * 0.016, winH = walkTop - winTop - 3;
      if (r() < 0.62) {
        var c = r() < 0.7 ? pick(r, WARM) : pick(r, COOL);
        var a = between(r, 0.28, 0.55);
        var gg = ctx.createLinearGradient(0, winTop, 0, winTop + winH);
        gg.addColorStop(0, 'rgba(' + c + ',' + a * 0.35 + ')');
        gg.addColorStop(1, 'rgba(' + c + ',' + a + ')');
        ctx.fillStyle = gg;
        ctx.fillRect(x + 4, winTop, sw - 8, winH);
        // interior silhouettes: shelves, people, tables
        for (var k = 0; k < 4; k++) {
          ctx.fillStyle = 'rgba(6,6,8,' + between(r, 0.35, 0.7) + ')';
          var iw = between(r, 3, 12), ih = between(r, winH * 0.25, winH * 0.7);
          ctx.fillRect(x + 4 + r() * (sw - 8 - iw), winTop + winH - ih, iw, ih);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        for (var mm = x + 4 + 12; mm < x + sw - 8; mm += between(r, 10, 16)) ctx.fillRect(mm, winTop, 1, winH);
        glow(ctx, x + sw / 2, walkTop + 2, sw * 0.7, c, a * 0.35);
        m.reflections.push({ x: x + sw / 2, w: sw * 0.5, c: c, a: a * 0.32 });
        if (r() < 0.25) {                                   // small lit fascia sign
          var sc = pick(r, NEON)[0];
          ctx.fillStyle = 'rgba(' + sc + ',0.75)';
          ctx.fillRect(x + sw * 0.25, shopTop + H * 0.004, sw * 0.5, H * 0.007);
          glow(ctx, x + sw / 2, shopTop + H * 0.008, sw * 0.4, sc, 0.18);
        }
      } else {
        ctx.fillStyle = 'rgba(40,50,70,0.12)';             // dark, closed shop
        ctx.fillRect(x + 4, winTop, sw - 8, winH);
      }
      ctx.fillStyle = '#0b0c10';                            // pillar
      ctx.fillRect(x, shopTop, 4, walkTop - shopTop);
      x += sw;
    }

    // back sidewalk
    var wg = ctx.createLinearGradient(0, walkTop, 0, roadTop);
    wg.addColorStop(0, '#24262e'); wg.addColorStop(1, '#16181e');
    ctx.fillStyle = wg; ctx.fillRect(0, walkTop, w, roadTop - walkTop);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, roadTop - 1.5, w, 1.5);

    // road surface
    var rg = ctx.createLinearGradient(0, roadTop, 0, curbY);
    rg.addColorStop(0, '#1a1b21'); rg.addColorStop(0.5, '#111217'); rg.addColorStop(1, '#0c0d11');
    ctx.fillStyle = rg; ctx.fillRect(0, roadTop, w, curbY - roadTop);
    // asphalt grain
    var grains = Math.floor(w * (curbY - roadTop) / 40);
    for (var i = 0; i < grains; i++) {
      ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.25)';
      ctx.fillRect(r() * w, roadTop + r() * (curbY - roadTop), 1, 1);
    }

    // street lamps
    var spacing = m.lampSpacing, lampTopY = m.lampY;
    for (var lx = m.lampOffset; lx < w + spacing; lx += spacing) {
      var headX = lx + 20;
      // light cone
      var cone = ctx.createLinearGradient(0, lampTopY, 0, roadTop + 30);
      cone.addColorStop(0, 'rgba(255,220,170,0.13)');
      cone.addColorStop(1, 'rgba(255,220,170,0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(headX - 6, lampTopY + 3); ctx.lineTo(headX + 6, lampTopY + 3);
      ctx.lineTo(headX + 70, roadTop + 30); ctx.lineTo(headX - 70, roadTop + 30);
      ctx.closePath(); ctx.fill();
      // pool on the road
      ctx.save(); ctx.translate(headX, roadTop + (curbY - roadTop) * 0.22); ctx.scale(1, 0.14);
      glow(ctx, 0, 0, 120, '255,214,160', 0.28);
      ctx.restore();
      m.reflections.push({ x: headX, w: 10, c: '255,220,170', a: 0.42 });
      // pole + arm
      ctx.fillStyle = '#0a0b0f';
      ctx.fillRect(lx - 1.6, lampTopY, 3.2, walkTop + H * 0.012 - lampTopY);
      ctx.fillRect(lx - 1, lampTopY - 1, 24, 2.4);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(lx - 1.6, lampTopY, 1, walkTop - lampTopY);
      // head
      ctx.fillStyle = '#fff3dc';
      ctx.fillRect(headX - 6, lampTopY + 1, 12, 2.4);
      glow(ctx, headX, lampTopY + 3, 46, '255,224,180', 0.5);
      glow(ctx, headX, lampTopY + 3, 10, '255,250,235', 0.9);
    }

    // wet reflections: soft vertical streaks under every light source
    var refH = (curbY - roadTop) * 0.75;
    m.reflections.forEach(function (rf) {
      var g = ctx.createLinearGradient(0, roadTop, 0, roadTop + refH);
      g.addColorStop(0, 'rgba(' + rf.c + ',' + rf.a + ')');
      g.addColorStop(0.5, 'rgba(' + rf.c + ',' + rf.a * 0.3 + ')');
      g.addColorStop(1, 'rgba(' + rf.c + ',0)');
      ctx.fillStyle = g;
      for (var k = 0; k < 3; k++) {
        var ww = rf.w * between(r, 0.3, 1);
        ctx.globalAlpha = between(r, 0.4, 1);
        ctx.fillRect(rf.x - ww / 2 + between(r, -3, 3), roadTop, ww, refH * between(r, 0.6, 1));
      }
    });
    ctx.globalAlpha = 1;

    // lane markings
    var laneY = roadTop + (curbY - roadTop) * 0.36;
    for (var dx = -20; dx < w; dx += 84) {
      ctx.fillStyle = 'rgba(232,230,220,0.78)';
      ctx.fillRect(dx, laneY, 40, 2.6);
      ctx.fillStyle = 'rgba(232,230,220,0.08)';
      ctx.fillRect(dx, laneY + 3, 40, 6);
    }
    ctx.fillStyle = 'rgba(232,230,220,0.35)';
    ctx.fillRect(0, roadTop + 5, w, 1.4);

    // puddles mirroring the sky
    for (var p = 0; p < w / 260; p++) {
      var px = r() * w, py = between(r, laneY + 12, curbY - 10);
      ctx.save(); ctx.translate(px, py); ctx.scale(1, 0.1);
      glow(ctx, 0, 0, between(r, 40, 90), '110,130,180', 0.16);
      ctx.restore();
    }

    // near curb + pavement
    ctx.fillStyle = '#4b4e57'; ctx.fillRect(0, curbY, w, 2);
    var cg = ctx.createLinearGradient(0, curbY + 2, 0, H);
    cg.addColorStop(0, '#22242b'); cg.addColorStop(0.25, '#15161b'); cg.addColorStop(1, '#0b0c0f');
    ctx.fillStyle = cg; ctx.fillRect(0, curbY + 2, w, H - curbY - 2);
    for (var t = 0; t < w; t += 34) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(t, curbY + 2, 1, H * 0.02);
    }
    ctx.restore();
  }

  /* ---------- FOREGROUND RAILING ---------- */
  function paintFore(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (var x = 0; x < w; x += 56) {
      var pg = ctx.createLinearGradient(x, 0, x + 9, 0);
      pg.addColorStop(0, '#16171c'); pg.addColorStop(0.4, '#2c2e35'); pg.addColorStop(1, '#08090b');
      ctx.fillStyle = pg;
      ctx.fillRect(x, h * 0.18, 9, h);
      ctx.fillStyle = 'rgba(255,200,140,0.18)';
      ctx.fillRect(x + 3, h * 0.18, 2, 1.5);
    }
    ctx.fillStyle = '#121318'; ctx.fillRect(0, h * 0.22, w, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(0, h * 0.22, w, 1);
  }

  /* ---------- PUBLIC ---------- */
  /**
   * @param {object} o  { W, H, maxShift, dpr, canvases: {sky,far,mid,street,fore}, beaconEl }
   * @returns {object}  stage metrics the app needs (road / ground lines, lamp spacing)
   */
  function paint(o) {
    var W = o.W, H = o.H, dpr = o.dpr;
    var m = {
      H: H,
      roadTop: Math.round(H * 0.655),
      curbY: Math.round(H * 0.915),
      groundY: Math.round(H * 0.845),
      lampY: Math.round(H * 0.395),
      lampSpacing: Math.round(Math.max(200, W * 0.6)),
      lampOffset: Math.round(W * 0.3),
      reflections: []
    };
    function widthFor(f) { return Math.ceil(W + o.maxShift * f + 2); }

    var c = o.canvases;
    paintSky(prep(c.sky, widthFor(FACTORS.sky), m.roadTop, 0, Math.min(dpr, 1.5)), widthFor(FACTORS.sky), m.roadTop, H, rng(11));

    var farTop = Math.round(H * 0.16);
    paintFar(prep(c.far, widthFor(FACTORS.far), m.roadTop - farTop, farTop, dpr), widthFor(FACTORS.far), m.roadTop - farTop, H, rng(23));

    var midTop = Math.round(H * 0.02), midH = m.roadTop - H * 0.04 - midTop;
    var beacons = [];
    paintMid(prep(c.mid, widthFor(FACTORS.mid), midH, midTop, dpr), widthFor(FACTORS.mid), midH, H, rng(47), beacons);
    o.beaconEl.innerHTML = beacons.map(function (b, i) {
      return '<i style="left:' + b.x.toFixed(1) + 'px;top:' + (b.y + midTop).toFixed(1) +
             'px;animation-delay:' + (-(i * 0.37) % 1.6).toFixed(2) + 's"></i>';
    }).join('');

    var streetTop = Math.round(m.lampY - 50);
    var sw = widthFor(FACTORS.street);
    paintStreet(prep(c.street, sw, H - streetTop, streetTop, dpr), sw, H - streetTop, streetTop, m, rng(83));

    var foreTop = Math.round(H * 0.935), foreW = widthFor(FACTORS.fore);
    paintFore(prep(c.fore, foreW, H - foreTop, foreTop, dpr), foreW, H - foreTop);

    return m;
  }

  window.Scene = { paint: paint, FACTORS: FACTORS };
})();


/* ============================================================
   BMW M4 Competition · Tilt-to-Unleash interstitial
   State machine:  teaser → drive → (firstMove) → exit → endcard
   Input:          gyro tilt (throttle) · touch / mouse drag · ← →
   Rendering:      one rAF loop, transform + opacity only
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Config ---------- */
  var CFG = {
    trackScreens: 3,          // pan distance = 3 × screen width (panorama ≈ 4× wide)
    crossSeconds: 3.4,        // time to cross the whole drive at full throttle
    tiltDeadzone: 3,          // degrees ignored around the resting angle
    tiltFull: 22,             // degrees of tilt for full throttle
    accelTau: 0.38,           // s – how quickly speed follows throttle
    brakeTau: 0.26,           // s – how quickly speed drops when easing off
    coastTau: 0.6,            // s – friction after a drag fling
    dragGain: 2.1,            // scene px per finger px
    firstMoveAt: 0.05,        // fraction of the drive
    cardFocus: 0.1,           // card counts as "seen" within ±10% of screen centre
    sensorWait: 1200,         // ms to wait for gyro data before switching to the swipe hint
    headlineDelay: 1000,      // ms after the scene appears
    instructionDelay: 3500,   // ms (headline + 2.5 s)
    exitPause: 450,           // ms between lock and drive-off
    driveOff: 1100,           // ms
    topSpeedKmh: 180,
    landingUrl: 'https://www.bmw-m.com/'
  };

  /* Car geometry, measured from the car image during asset processing (percent of car image). */
  var CAR = { wheels: [{ x: 20.41, y: 76.164, d: 15.191 }, { x: 83.621, y: 76.386, d: 15.335 }] };

  var CARDS = [
    { img: 'card-1', title: 'M Laserlight', sub: 'Blue-accented laser high beams' },
    { img: 'card-2', title: 'M Compound brakes', sub: 'Red calipers, forged M wheels' },
    { img: 'card-3', title: 'M kidney grille', sub: 'Feeds the 530 hp twin-turbo six' },
    { img: 'card-4', title: 'Carbon roof', sub: 'CFRP lowers the centre of gravity' },
    { img: 'card-5', title: 'M Sport exhaust', sub: 'Quad tailpipes, full M soundtrack' }
  ];

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- DOM ---------- */
  function $(id) { return document.getElementById(id); }
  var ad = $('ad'), device = $('device');
  var el = {
    drive: $('drive'), car: $('car'), body: $('car-body'), tail: $('car-tail'),
    sheen: $('sheen'), instruction: $('instruction'),
    instructionText: $('instruction-text'), speed: $('speed'), progress: $('progress'),
    cards: $('cards'), heroParallax: $('hero-parallax'), closed: $('closed')
  };
  var layers = {};
  ['sky', 'far', 'mid', 'street', 'fore'].forEach(function (k) {
    layers[k] = document.querySelector('[data-layer="' + k + '"]');
  });
  var canvases = {
    sky: layers.sky, far: layers.far, fore: layers.fore,
    mid: layers.mid.querySelector('canvas'), street: layers.street.querySelector('canvas')
  };
  var wheelEls = Array.prototype.map.call(document.querySelectorAll('.wheel'), function (w, i) {
    var g = CAR.wheels[i];                       // margins in % resolve against car width
    w.style.cssText = 'left:' + g.x + '%;top:' + g.y + '%;width:' + g.d + '%;margin:' +
      (-g.d / 2) + '% 0 0 ' + (-g.d / 2) + '%';
    // two rotating layers per wheel (rim + spokes); the caliper between them stays still
    var spins = Array.prototype.map.call(w.querySelectorAll('.wheel-spin'), function (s) {
      return { el: s, sharp: s.firstElementChild, blur: s.querySelector('.blur') };
    });
    return { spins: spins, d: g.d };
  });

  /* ---------- Tracking ---------- */
  function track(name, data) {
    console.log('[bmw-m4] ' + name, data || {});
  }

  /* ---------- Build cards + progress segments ----------
     (skipped when the cards are already in the markup, as in the GWD build) */
  if (!el.cards.children.length) el.cards.innerHTML = CARDS.map(function (c, i) {
    return '<li class="card" style="--i:' + i + '"><figure class="card-inner">' +
      '<img data-img="' + c.img + '" alt="" width="360" height="240" decoding="async">' +
      '<figcaption><b>' + c.title + '</b><span>' + c.sub + '</span></figcaption>' +
      '<span class="card-dim"></span><span class="card-glow"></span></figure></li>';
  }).join('');
  // Image paths are set as properties, not written into HTML strings: Google Web
  // Designer scans inline scripts for src="…" / url(…) and chokes on concatenations.
  Array.prototype.forEach.call(el.cards.querySelectorAll('img[data-img]'), function (img) {
    img.src = 'assets/build/' + img.getAttribute('data-img') + '.webp';
  });
  el.progress.innerHTML = CARDS.map(function () { return '<li><i></i></li>'; }).join('');
  var cardEls = Array.prototype.slice.call(el.cards.children).map(function (li) {
    return { li: li, inner: li.firstElementChild, dim: li.querySelector('.card-dim'), glow: li.querySelector('.card-glow') };
  });
  var segEls = Array.prototype.map.call(el.progress.children, function (li) {
    return { li: li, fill: li.firstElementChild };
  });

  /* ---------- Rain texture (shared by teaser + drive) ---------- */
  (function makeRain() {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    var ctx = c.getContext('2d');
    ctx.lineCap = 'round';
    for (var i = 0; i < 70; i++) {
      var x = Math.random() * 256, y = Math.random() * 256, len = 8 + Math.random() * 18;
      ctx.strokeStyle = 'rgba(200,220,255,' + (0.12 + Math.random() * 0.3) + ')';
      ctx.lineWidth = Math.random() > 0.8 ? 1.2 : 0.7;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len * 0.18, y + len); ctx.stroke();
    }
    ad.style.setProperty('--rain', 'url' + '("' + c.toDataURL() + '")');   // split so GWD doesn't read it as an asset
  })();

  /* ============================================================
     LAYOUT – paint the city for the current stage size
     ============================================================ */
  var stage = { W: 0, H: 0, maxShift: 0, vmax: 1, lampSpacing: 200, lampOffset: 0, cardX: [] };

  function layout() {
    var W = ad.clientWidth, H = ad.clientHeight;
    if (!W || !H || (W === stage.W && H === stage.H)) return;
    var ratio = stage.maxShift ? motion.x / stage.maxShift : 0;

    stage.W = W; stage.H = H;
    stage.maxShift = W * CFG.trackScreens;
    stage.vmax = stage.maxShift / CFG.crossSeconds;

    var m = Scene.paint({
      W: W, H: H, maxShift: stage.maxShift,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      canvases: canvases, beaconEl: layers.mid.querySelector('.beacons')
    });
    stage.lampSpacing = m.lampSpacing;
    stage.lampOffset = m.lampOffset;

    layers.mid.style.width = Math.ceil(W + stage.maxShift * Scene.FACTORS.mid) + 'px';
    layers.street.style.width = Math.ceil(W + stage.maxShift) + 'px';
    ad.style.setProperty('--ground-y', m.groundY + 'px');
    ad.style.setProperty('--lamp', m.lampSpacing + 'px');

    // Cards: a contiguous strip; first one peeks in from the right edge at start.
    var pitch = W * 0.535;
    stage.cardX = CARDS.map(function (_, i) { return W * 1.12 + i * pitch; });
    cardEls.forEach(function (c, i) { c.li.style.left = stage.cardX[i] + 'px'; });

    var carW = el.car.offsetWidth;
    wheelEls.forEach(function (w) { w.r = carW * w.d / 200 * 0.99; });   // sprite has a 2 px margin

    motion.x = ratio * stage.maxShift;
    render();
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 120);
  });
  // Ad containers (e.g. GWD pages) can be hidden or resized without a window resize:
  // repaint whenever the ad itself changes size.
  if (window.ResizeObserver) {
    new ResizeObserver(function () { requestAnimationFrame(layout); }).observe(ad);
  }

  /* ============================================================
     STATE MACHINE
     ============================================================ */
  var state = 'teaser';
  var flags = { firstMove: false, exiting: false, closed: false };
  var timers = [];
  var seen = [];

  function setState(next) {
    state = next;
    ad.setAttribute('data-state', next);
  }

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function resetDrive() {
    clearTimers();
    motion.x = 0; motion.v = 0; motion.accel = 0; motion.pitch = 0; motion.pitchV = 0;
    motion.driveOff = null; motion.carX = 0;
    flags.firstMove = false; flags.exiting = false;
    seen = CARDS.map(function () { return false; });
    gyro.baseline = null; gyro.samples = [];
    drag.active = false; drag.coasting = false;
    el.drive.classList.remove('first-move', 'exiting', 'cards-out', 'dragging', 'show-headline', 'show-instruction');
    segEls.forEach(function (s) { s.li.classList.remove('seen'); });
    if (stage.W) render();      // idle frames skip rendering, so draw the reset scene now
  }

  function enterDrive() {
    resetDrive();
    setState('drive');
    later(function () { el.drive.classList.add('show-headline'); }, CFG.headlineDelay);
    later(function () { el.drive.classList.add('show-instruction'); }, CFG.instructionDelay);
    // Choose the instruction once we know whether the sensor is actually live.
    later(function () { setInstructionMode(gyro.live ? 'tilt' : 'drag'); }, CFG.sensorWait);
  }

  function setInstructionMode(mode) {
    el.instruction.setAttribute('data-mode', mode);
    el.instructionText.innerHTML = mode === 'tilt'
      ? 'Tilt your phone right<br>to unleash'
      : 'Swipe left<br>to unleash';
  }

  function onFirstMove() {
    flags.firstMove = true;
    el.drive.classList.add('first-move');
    track('first_move');
  }

  function onCardSeen(i) {
    seen[i] = true;
    segEls[i].li.classList.add('seen');
    if (navigator.vibrate) navigator.vibrate(12);
    track('card_seen', { index: i + 1, title: CARDS[i].title });
  }

  function startExit() {
    flags.exiting = true;
    drag.active = false;
    motion.x = stage.maxShift;
    el.drive.classList.add('exiting');
    track('completion');
    later(function () {
      motion.driveOff = { start: performance.now(), dur: reduceMotion ? 500 : CFG.driveOff, from: 0 };
      el.drive.classList.add('cards-out');
    }, CFG.exitPause);
    later(showEndcard, CFG.exitPause + (reduceMotion ? 500 : CFG.driveOff) - 150);
  }

  function showEndcard() {
    setState('endcard');
    el.drive.classList.remove('cards-out');
  }

  /* ============================================================
     MOTION MODEL
     x  = distance driven (px of the street layer), 0 … maxShift
     v  = speed (px/s). Tilt sets a target speed, drag sets a target x.
     ============================================================ */
  var motion = { x: 0, v: 0, accel: 0, pitch: 0, pitchV: 0, carX: 0, driveOff: null, lastT: 0 };
  var gyro = { live: false, value: 0, baseline: null, samples: [] };
  var drag = { active: false, coasting: false, startPointer: 0, startX: 0, target: 0, lastP: 0, lastT: 0, vel: 0 };
  var keys = { left: false, right: false };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(dt, tau) { return 1 - Math.exp(-dt / tau); }

  function throttle() {
    if (keys.left || keys.right) return (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (!gyro.live || gyro.baseline === null) return 0;
    var tilt = gyro.value - gyro.baseline;
    var mag = Math.abs(tilt) - CFG.tiltDeadzone;
    if (mag <= 0) return 0;
    return Math.sign(tilt) * Math.pow(clamp(mag / (CFG.tiltFull - CFG.tiltDeadzone), 0, 1), 1.35);
  }

  function step(dt) {
    var prevV = motion.v;
    if (!flags.exiting) {
      if (drag.active) {
        var nx = motion.x + (drag.target - motion.x) * ease(dt, 0.07);
        motion.v = (nx - motion.x) / dt;
        motion.x = nx;
      } else {
        var th = throttle();
        if (th !== 0 || !drag.coasting) {
          drag.coasting = false;
          var target = th * stage.vmax;
          var tau = Math.abs(target) > Math.abs(motion.v) ? CFG.accelTau : CFG.brakeTau;
          motion.v += (target - motion.v) * ease(dt, tau);
          if (target === 0 && Math.abs(motion.v) < 1) motion.v = 0;   // settle exactly, so idle frames can be skipped
        } else {
          motion.v *= Math.exp(-dt / CFG.coastTau);
          if (Math.abs(motion.v) < 4) { motion.v = 0; drag.coasting = false; }
        }
        motion.x += motion.v * dt;
      }
      if (motion.x <= 0) { motion.x = 0; if (motion.v < 0) motion.v = 0; }
      if (motion.x >= stage.maxShift) { motion.x = stage.maxShift; motion.v = 0; }
    } else if (motion.driveOff) {
      var d = motion.driveOff;
      var p = clamp((performance.now() - d.start) / d.dur, 0, 1);
      var nxt = stage.W * 1.25 * p * p * p;          // ease-in: the car launches
      motion.v = (nxt - motion.carX) / dt;
      motion.carX = nxt;
    } else {
      motion.v *= Math.exp(-dt / 0.12);
    }

    // acceleration → body pitch via a damped spring (squats, then settles)
    motion.accel += ((motion.v - prevV) / dt - motion.accel) * ease(dt, 0.08);
    var targetPitch = reduceMotion ? 0 : clamp(-motion.accel / (stage.vmax * 2.2), -1, 1) * 1.6;
    motion.pitchV += ((targetPitch - motion.pitch) * 90 - motion.pitchV * 11) * dt;
    motion.pitch += motion.pitchV * dt;
  }

  /* ============================================================
     RENDER – transforms / opacity only
     ============================================================ */
  var DEG = 180 / Math.PI;
  var hud = { kmh: '', braking: null };

  function render() {
    var x = motion.x, W = stage.W;
    var speed = Math.abs(motion.v) / stage.vmax;

    // parallax layers
    layers.sky.style.transform = 'translate3d(' + (-x * Scene.FACTORS.sky).toFixed(2) + 'px,0,0)';
    layers.far.style.transform = 'translate3d(' + (-x * Scene.FACTORS.far).toFixed(2) + 'px,0,0)';
    layers.mid.style.transform = 'translate3d(' + (-x * Scene.FACTORS.mid).toFixed(2) + 'px,0,0)';
    layers.street.style.transform = 'translate3d(' + (-x).toFixed(2) + 'px,0,0)';
    layers.fore.style.transform = 'translate3d(' + (-x * Scene.FACTORS.fore).toFixed(2) + 'px,0,0)';

    // wheels: angle = distance rolled / radius (exact rolling, no slip)
    var rolled = x + motion.carX;
    var blur = clamp((speed - 0.3) / 0.45, 0, 1);
    wheelEls.forEach(function (w) {
      var rot = 'rotate(' + ((rolled / w.r) * DEG % 360).toFixed(2) + 'deg)';
      w.spins.forEach(function (s) {
        s.el.style.transform = rot;
        s.blur.style.opacity = blur.toFixed(2);
        s.sharp.style.opacity = (1 - blur * 0.75).toFixed(2);
      });
    });

    // body: road texture bounce + pitch from acceleration
    var bounce = reduceMotion ? 0 : (Math.sin(rolled * 0.045) * 0.5 + Math.sin(rolled * 0.13) * 0.35) * Math.min(speed, 1) * 1.4;
    el.body.style.transform = 'translate3d(0,' + bounce.toFixed(2) + 'px,0) rotate(' + motion.pitch.toFixed(3) + 'deg)';
    el.car.style.transform = 'translate3d(' + motion.carX.toFixed(1) + 'px,0,0)';

    // street-lamp reflections sliding over the paintwork
    var phase = ((x - stage.lampOffset) % stage.lampSpacing + stage.lampSpacing) % stage.lampSpacing;
    el.sheen.style.transform = 'translate3d(' + (-phase).toFixed(1) + 'px,0,0)';

    // brake lights: glow when slowing down
    var braking = motion.v > 20 && motion.accel < -stage.vmax * 0.4;
    if (braking !== hud.braking) { hud.braking = braking; el.tail.style.opacity = braking ? '1' : '0.45'; }

    // HUD (text only touched when the value changes)
    var kmh = ('00' + Math.round(speed * CFG.topSpeedKmh)).slice(-3);
    if (kmh !== hud.kmh) { hud.kmh = kmh; el.speed.textContent = kmh; }
    var prog = x / stage.maxShift;
    segEls.forEach(function (s, i) {
      s.fill.style.transform = 'scaleX(' + clamp(prog * 5 - i, 0, 1).toFixed(3) + ')';
    });

    // cards: subtle coverflow depending on distance from centre
    if (!flags.exiting || !motion.driveOff) {
      cardEls.forEach(function (c, i) {
        var d = (stage.cardX[i] - x - W / 2) / W;          // -1 … 1 around centre
        if (Math.abs(d) > 1.2) return;
        var dc = clamp(d, -1, 1);
        if (!reduceMotion) {
          c.inner.style.transform = 'perspective(800px) rotateY(' + (-dc * 22).toFixed(2) + 'deg) scale(' + (1 - Math.abs(dc) * 0.1).toFixed(3) + ')';
        }
        c.dim.style.opacity = clamp(Math.abs(d) * 1.2, 0, 0.5).toFixed(2);
        c.glow.style.opacity = clamp(1 - Math.abs(d) * 4, 0, 1).toFixed(2);
        if (!seen[i] && state === 'drive' && Math.abs(d) < CFG.cardFocus) onCardSeen(i);
      });
    }

    if (state === 'drive' && !flags.firstMove && prog >= CFG.firstMoveAt) onFirstMove();
    if (state === 'drive' && !flags.exiting && x >= stage.maxShift - 0.5) startExit();
  }

  /* Teaser: the hero drifts with the pointer / device tilt. */
  var hero = { x: 0, y: 0, tx: 0, ty: 0 };
  function renderTeaser(dt) {
    if (reduceMotion) return;
    hero.x += (hero.tx - hero.x) * ease(dt, 0.25);
    hero.y += (hero.ty - hero.y) * ease(dt, 0.25);
    el.heroParallax.style.transform = 'translate3d(' + (hero.x * 14).toFixed(2) + 'px,' + (hero.y * 10).toFixed(2) + 'px,0) scale(1.05)';
  }

  function frame(t) {
    var dt = motion.lastT ? Math.min((t - motion.lastT) / 1000, 0.05) : 1 / 60;
    motion.lastT = t;
    if (!flags.closed && stage.W) {
      if (state === 'teaser') renderTeaser(dt || 1 / 60);
      else if (state === 'drive') {
        var px = motion.x, pc = motion.carX, pp = motion.pitch;
        step(dt || 1 / 60);
        // nothing moved (car parked, phone held still): skip the style writes
        if (motion.v !== 0 || motion.x !== px || motion.carX !== pc || Math.abs(motion.pitch - pp) > 1e-4) render();
      }
    }
    requestAnimationFrame(frame);
  }

  /* ============================================================
     INPUT
     ============================================================ */
  function onOrientation(e) {
    if (e.gamma === null || e.gamma === undefined) return;
    var angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    var raw = angle === 90 ? e.beta : angle === -90 || angle === 270 ? -e.beta : e.gamma;
    gyro.live = true;

    if (state === 'teaser') {                        // hero parallax before the drive
      hero.tx = clamp(raw / 30, -1, 1);
      hero.ty = clamp(((e.beta || 45) - 45) / 30, -1, 1);
      return;
    }
    gyro.value += (raw - gyro.value) * 0.3;          // low-pass the raw sensor
    if (gyro.baseline === null) {                    // calibrate to how the phone is held
      gyro.samples.push(raw);
      if (gyro.samples.length >= 6) {
        gyro.baseline = gyro.samples.reduce(function (a, b) { return a + b; }, 0) / gyro.samples.length;
        gyro.value = gyro.baseline;
      }
      return;
    }
    // At the start line, tilting "backwards" just re-zeroes the rest angle.
    if (motion.x <= 0.5 && gyro.value < gyro.baseline) gyro.baseline += (gyro.value - gyro.baseline) * 0.08;
  }
  window.addEventListener('deviceorientation', onOrientation);

  // Drag (touch + mouse via Pointer Events)
  el.drive.addEventListener('pointerdown', function (e) {
    if (state !== 'drive' || flags.exiting) return;
    drag.active = true; drag.coasting = false;
    drag.startPointer = e.clientX; drag.startX = motion.x; drag.target = motion.x;
    drag.lastP = e.clientX; drag.lastT = e.timeStamp; drag.vel = 0;
    el.drive.setPointerCapture(e.pointerId);
    el.drive.classList.add('dragging');
  });
  el.drive.addEventListener('pointermove', function (e) {
    if (!drag.active) return;
    drag.target = clamp(drag.startX + (drag.startPointer - e.clientX) * CFG.dragGain, 0, stage.maxShift);
    var dt = (e.timeStamp - drag.lastT) / 1000;
    if (dt > 0.004) {
      drag.vel += (((drag.lastP - e.clientX) * CFG.dragGain / dt) - drag.vel) * 0.5;
      drag.lastP = e.clientX; drag.lastT = e.timeStamp;
    }
  });
  function endDrag(e) {
    if (!drag.active) return;
    drag.active = false;
    el.drive.classList.remove('dragging');
    var idle = e.timeStamp - drag.lastT > 80;      // finger stopped before lifting → no fling
    motion.v = idle ? 0 : clamp(drag.vel, -stage.vmax * 1.2, stage.vmax * 1.2);
    drag.coasting = true;
  }
  el.drive.addEventListener('pointerup', endDrag);
  el.drive.addEventListener('pointercancel', endDrag);

  // Keyboard (desktop review)
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') keys.right = true;
    else if (e.key === 'ArrowLeft') keys.left = true;
    else return;
    if (state === 'drive') e.preventDefault();
  });
  window.addEventListener('keyup', function (e) {
    if (e.key === 'ArrowRight') keys.right = false;
    if (e.key === 'ArrowLeft') keys.left = false;
  });

  // Teaser pointer parallax (desktop)
  $('teaser').addEventListener('pointermove', function (e) {
    var r = ad.getBoundingClientRect();
    hero.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    hero.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });

  /* ---------- Buttons ---------- */
  $('start').addEventListener('click', function () {
    track('first_interaction');
    var DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      // iOS 13+: must be called synchronously inside this tap
      DOE.requestPermission()
        .then(function (res) { track('motion_permission', { result: res }); })
        .catch(function () { track('motion_permission', { result: 'error' }); })
        .then(enterDrive);
    } else {
      enterDrive();
    }
  });

  // Inside a Google ad (DV360 / Studio) the exit must go through the Enabler so the
  // click is counted; on the plain web page the CTA is an ordinary link.
  var cta = $('cta');
  if (cta.tagName === 'A') cta.href = CFG.landingUrl;
  cta.addEventListener('click', function (e) {
    track('cta_click', { url: CFG.landingUrl });
    if (window.Enabler && typeof window.Enabler.exit === 'function') {
      e.preventDefault();
      window.Enabler.exit('CTA', CFG.landingUrl);
    } else if (cta.tagName !== 'A') {
      window.open(CFG.landingUrl, '_blank', 'noopener');
    }
  });

  $('replay').addEventListener('click', function () {
    track('replay');
    enterDrive();
  });

  $('close').addEventListener('click', function () {
    track('close', { state: state });
    flags.closed = true;
    clearTimers();
    ad.classList.add('closing');
    setTimeout(function () {
      ad.hidden = true;
      if (el.closed) el.closed.hidden = false;      // seen only outside an ad server
    }, 320);
    // Inside DV360 / Studio the Enabler dismisses the interstitial
    var E = window.Enabler;
    if (E && typeof E.close === 'function') {
      if (typeof E.reportManualClose === 'function') E.reportManualClose();
      E.close();
    }
  });

  if ($('reopen')) $('reopen').addEventListener('click', function () {
    flags.closed = false;
    resetDrive();
    el.closed.hidden = true;
    ad.classList.remove('closing');
    ad.hidden = false;
    setState('teaser');
    track('impression');
  });

  /* Desktop review: try the layout at different phone ratios. */
  Array.prototype.forEach.call(document.querySelectorAll('[data-ratio]'), function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-ratio]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      device.style.setProperty('--ratio', b.getAttribute('data-ratio'));
      requestAnimationFrame(layout);
    });
  });

  /* ---------- Boot ---------- */
  setState('teaser');
  // Wait (briefly) for the display font so neon / billboard text paints correctly.
  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 900); })]).then(function () {
    layout();
    requestAnimationFrame(frame);
  });

  // Impression = the ad is on screen. Inside Google Web Designer the page stays
  // hidden until the ad framework presents it (after Enabler init + polite load),
  // so wait for GWD's 'pagepresenting'; fall back after 8 s so it can't go missing.
  (function trackImpression() {
    var page = ad.closest ? ad.closest('gwd-page') : null;
    if (!page || page.classList.contains('gwd-play-animation')) { track('impression'); return; }
    var done = false;
    function fire(e) {
      if (done) return;
      done = true;
      document.removeEventListener('pagepresenting', fire, true);
      track('impression', e ? undefined : { fallback: true });
    }
    document.addEventListener('pagepresenting', fire, true);
    setTimeout(function () { fire(null); }, 8000);
  })();
})();

