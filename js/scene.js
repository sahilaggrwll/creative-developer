/* ============================================================
   AETHER GT-E · Scene painter
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
    g.addColorStop(0, '#02040a');
    g.addColorStop(0.4, '#081022');
    g.addColorStop(0.72, '#161b33');
    g.addColorStop(0.9, '#33263a');
    g.addColorStop(1, '#4c3334');
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
      glow(ctx, 0, 0, rw, '150,100,110', between(r, 0.05, 0.12));
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
          if (r() < 0.07) {
            ctx.fillStyle = 'rgba(255,214,150,' + between(r, 0.25, 0.6) + ')';
            ctx.fillRect(wx, wy, 1, 1.4);
          }
        }
      }
      x += bw + between(r, -4, 6);
    }
    // atmospheric haze toward the ground
    var g = ctx.createLinearGradient(0, h * 0.35, 0, h);
    g.addColorStop(0, 'rgba(60,48,78,0)');
    g.addColorStop(1, 'rgba(84,60,78,0.62)');
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
        if (r() < 0.32) {
          var len = bw * between(r, 0.3, 1);
          var start = x + between(r, 0, bw - len);
          ctx.fillStyle = 'rgba(' + pick(r, COOL) + ',' + between(r, 0.35, 0.75) + ')';
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
    var palette = r() > 0.4 ? WARM : COOL;
    for (var y = top + 8; y < top + bh - rowH; y += rowH) {
      var occ = r() < 0.18 ? 0 : between(r, 0.15, 0.85);
      for (var c = 0; c < cols; c++) {
        var wx = ox + c * colW;
        if (r() < occ) {
          ctx.fillStyle = 'rgba(' + pick(r, palette) + ',' + between(r, 0.55, 0.95) + ')';
          ctx.fillRect(wx, y, ww, wh);
          // interior depth: darker lower half of some windows
          if (r() < 0.4) { ctx.fillStyle = 'rgba(20,14,10,0.35)'; ctx.fillRect(wx, y + wh * 0.6, ww, wh * 0.4); }
        } else {
          ctx.fillStyle = 'rgba(60,80,120,0.16)';
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
    ctx.fillText('AETHER GT-E', x + 8, y + h * 0.5);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(120,215,255,0.9)';
    ctx.font = '600 ' + Math.round(h * 0.17) + 'px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText('720 KM  ·  ZERO EMISSIONS', x + 8, y + h * 0.78);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function paintMid(ctx, w, h, H, r, beacons) {
    var x = -20, billboardAt = w * 0.42, billboardDone = false;
    while (x < w) {
      var bw = between(r, 44, 112);
      var tall = r() > 0.82;
      var bh = (tall ? between(r, 0.46, 0.62) : between(r, 0.18, 0.42)) * H;
      bh = Math.min(bh, h - 6);
      var top = h - bh;
      var base = Math.floor(between(r, 11, 19));
      var g = ctx.createLinearGradient(0, top, 0, h);
      g.addColorStop(0, 'rgb(' + (base + 2) + ',' + (base + 6) + ',' + (base + 20) + ')');
      g.addColorStop(1, 'rgb(' + base + ',' + (base + 2) + ',' + (base + 10) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(x, top, bw, bh);
      // rim light from the city glow
      ctx.fillStyle = 'rgba(150,170,220,0.12)';
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

      if (!billboardDone && x > billboardAt && bh < 0.36 * H) {
        paintBillboard(ctx, x + 4, top - 70, 128, 50);
        billboardDone = true;
      } else if (r() < 0.3 && bh > 0.2 * H) {
        var n = pick(r, NEON);
        paintNeon(ctx, x + between(r, 4, Math.max(5, bw - 50)), top + between(r, 14, bh * 0.5), n[0], n[1]);
      }
      x += bw + (r() < 0.3 ? between(r, 2, 10) : 0);
    }
    var hz = ctx.createLinearGradient(0, h * 0.55, 0, h);
    hz.addColorStop(0, 'rgba(40,30,50,0)');
    hz.addColorStop(1, 'rgba(60,40,52,0.45)');
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
      m.lamps.push(lx);
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
   * @returns {object}  stage metrics the app needs (road / ground lines, lamp positions)
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
      lamps: [],
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
