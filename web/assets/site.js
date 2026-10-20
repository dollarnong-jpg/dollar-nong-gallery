/* Dollar Nong 摄影站 · 前台脚本（无依赖） */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var DATA = window.__ALBUMS__ || null;
  if (!DATA || !DATA.albums) { renderEmpty(); return; }

  var SITE = DATA.site || {};
  var ALBUMS = DATA.albums || [];
  var BY_SLUG = {};
  ALBUMS.forEach(function (a) { BY_SLUG[a.slug] = a; });

  /* ------------------------------------------------------------------ 站点文案 */
  function renderSite() {
    document.title = (SITE.title || 'DOLLAR NONG') + ' · 摄影作品';
    if (SITE.intro) {
      var m = document.querySelector('meta[name="description"]');
      if (m) m.setAttribute('content', SITE.intro);
    }
    setText('#logo', SITE.title || 'DOLLAR NONG');
    setText('#heroKicker', (SITE.subtitle || 'PHOTOGRAPHY').split(/[·|,，]/)[0].trim().toUpperCase() || 'PHOTOGRAPHY');
    setText('#heroTitle', SITE.titleCn || SITE.title || 'DOLLAR NONG');
    setText('#heroSub', SITE.intro || '');
    setText('#worksDesc', SITE.worksDesc || ('共 ' + ALBUMS.length + ' 个主题 · ' + (DATA.photoCount || 0) + ' 张作品'));
    setText('#aboutBody', SITE.about || '');
    setText('#contactLead', SITE.contactLead || '有拍摄需求，欢迎直接联系。');
    setText('#footerTitle', '© ' + new Date().getFullYear() + ' ' + (SITE.title || 'DOLLAR NONG'));
    setText('#footerNote', SITE.footerNote || '');

    var meta = [];
    if (SITE.location) meta.push(['所在地', SITE.location]);
    if (SITE.services) meta.push(['服务范围', SITE.services]);
    if (SITE.gear) meta.push(['常用器材', SITE.gear]);
    $('#aboutMeta').innerHTML = meta.map(function (row) {
      return '<li><b>' + esc(row[0]) + '</b><span>' + esc(row[1]) + '</span></li>';
    }).join('');

    var contacts = [];
    if (SITE.wechat) contacts.push(['微信', SITE.wechat, '']);
    if (SITE.phone) contacts.push(['电话', SITE.phone, 'tel:' + SITE.phone.replace(/\s/g, '')]);
    if (SITE.email) contacts.push(['邮箱', SITE.email, 'mailto:' + SITE.email]);
    if (SITE.xiaohongshu) contacts.push(['小红书', SITE.xiaohongshu, '']);
    if (SITE.instagram) contacts.push(['Instagram', SITE.instagram, '']);
    $('#contactList').innerHTML = contacts.map(function (row) {
      var inner = '<strong>' + esc(row[1]) + '</strong>';
      if (row[2]) inner = '<a href="' + esc(row[2]) + '">' + inner + '</a>';
      return '<div class="contact-item"><span>' + esc(row[0]) + '</span>' + inner + '</div>';
    }).join('');
    if (!contacts.length) {
      $('#contactList').innerHTML = '<div class="contact-item"><span>联系方式</span><strong>请在管理台里填写微信 / 电话 / 邮箱</strong></div>';
    }
  }

  function setText(sel, text) {
    var el = $(sel);
    if (el) el.textContent = text;
  }

  function bg(el, photo) {
    if (!el || !photo) return;
    if (photo.lqip) el.style.backgroundImage = 'url(' + photo.lqip + ')';
    var img = new Image();
    img.onload = function () {
      el.style.backgroundImage = 'url("' + photo.src + '")';
      el.classList.add('loaded');
    };
    img.src = photo.src;
  }

  /* ------------------------------------------------------------------ 首屏轮播 */
  function renderHero() {
    var pool = [];
    ALBUMS.forEach(function (a) {
      a.photos.slice(0, 3).forEach(function (p) { pool.push(p); });
    });
    pool = pool.filter(function (p, i) { return i % 3 === 0; }).slice(0, 6);
    if (!pool.length) return;

    var box = $('#heroSlides');
    box.innerHTML = pool.map(function (p, i) {
      var bg = p.lqip ? 'background-image:url(' + p.lqip + ')' : '';
      return '<div class="hero-slide' + (i === 0 ? ' on' : '') + '" style="' + bg + '"></div>';
    }).join('');

    var slides = box.querySelectorAll('.hero-slide');
    Array.prototype.forEach.call(slides, function (el, i) {
      var photo = pool[i];
      var img = new Image();
      img.onload = function () { el.style.backgroundImage = 'url("' + photo.src + '")'; };
      img.src = photo.src;
    });

    if (slides.length > 1) {
      var idx = 0;
      setInterval(function () {
        slides[idx].classList.remove('on');
        idx = (idx + 1) % slides.length;
        slides[idx].classList.add('on');
      }, 6200);
    }
  }

  /* ------------------------------------------------------------------ 相册列表 */
  function renderAlbums() {
    var box = $('#albums');
    if (!ALBUMS.length) {
      box.outerHTML = '<div class="empty">还没有作品。<br>打开管理台上传照片，或把照片放进 <code>content/albums/</code> 后执行一次构建。</div>';
      return;
    }
    box.innerHTML = ALBUMS.map(function (a) {
      var cover = a.coverLqip ? 'style="background-image:url(' + a.coverLqip + ')"' : '';
      return '<article class="album-card reveal" data-slug="' + esc(a.slug) + '">' +
        '<div class="cover" ' + cover + '><img alt="' + esc(a.title) + '" data-src="' + esc(a.cover) + '"></div>' +
        '<span class="num">' + (a.count || 0) + ' 张</span>' +
        '<div class="meta"><h3>' + esc(a.title) + '</h3><p>' + esc(a.subtitle || a.description || '') + '</p></div>' +
        '</article>';
    }).join('');

    box.querySelectorAll('.album-card').forEach(function (card) {
      var img = card.querySelector('img');
      img.onload = function () { img.classList.add('ready'); };
      img.src = img.dataset.src;
      card.addEventListener('click', function () { location.hash = '#/a/' + card.dataset.slug; });
    });
  }

  /* ------------------------------------------------------------------ 关于图 */
  function renderAboutMedia() {
    if (ALBUMS.length) bg($('#aboutMedia'), ALBUMS[0].photos[Math.min(1, ALBUMS[0].photos.length - 1)]);
  }

  /* ------------------------------------------------------------------ 刚好布局 */
  function justified(container, photos, opts) {
    var target = (opts && opts.target) || 380;
    var gap = window.innerWidth < 700 ? 8 : 14;
    container.innerHTML = '';
    if (!photos.length) return;

    var width = container.clientWidth || container.parentElement.clientWidth;
    var rows = [], cur = [], sum = 0;

    photos.forEach(function (p) {
      cur.push(p); sum += (p.ratio || 1.5);
      var h = (width - gap * (cur.length - 1)) / sum;
      if (h <= target) { rows.push({ items: cur, h: h }); cur = []; sum = 0; }
    });
    if (cur.length) rows.push({ items: cur, h: target, last: true });

    var frag = document.createDocumentFragment();
    rows.forEach(function (row) {
      var rowEl = document.createElement('div');
      rowEl.className = 'row';
      var h = Math.max(140, Math.round(row.h));
      rowEl.style.height = h + 'px';
      row.items.forEach(function (p) {
        var fig = document.createElement('figure');
        var w = Math.round((p.ratio || 1.5) * h);
        fig.style.width = Math.round(w) + 'px';
        fig.style.height = h + 'px';
        if (p.lqip) fig.style.backgroundImage = 'url(' + p.lqip + ')';
        fig.style.backgroundSize = 'cover';
        var img = document.createElement('img');
        img.alt = p.title || '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.onload = function () { img.classList.add('ready'); };
        img.src = p.thumb;
        fig.appendChild(img);
        fig.addEventListener('click', function () { openLightbox(photos, photos.indexOf(p)); });
        rowEl.appendChild(fig);
      });
      frag.appendChild(rowEl);
    });
    container.appendChild(frag);

    if (!container.dataset.bound) {
      container.dataset.bound = '1';
      var t;
      window.addEventListener('resize', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          if ($('#albumView').classList.contains('open') && currentAlbum) {
            justified(container, currentAlbum.photos);
          }
        }, 220);
      });
    }
  }

  /* ------------------------------------------------------------------ 相册详情 */
  var currentAlbum = null;

  function openAlbum(slug) {
    var album = BY_SLUG[slug];
    if (!album) { location.hash = '#/'; return; }
    currentAlbum = album;
    setText('#albumTitle', album.title);
    setText('#albumSub', album.subtitle || '');
    setText('#albumDesc', album.description || '');
    setText('#albumCount', album.photos.length + ' 张');
    document.title = album.title + ' · ' + (SITE.title || 'DOLLAR NONG');
    var view = $('#albumView');
    view.classList.add('open');
    view.setAttribute('aria-hidden', 'false');
    document.body.classList.add('locked');
    $('#albumScroll').scrollTop = 0;
    justified($('#albumGrid'), album.photos);
  }

  function closeAlbum() {
    var view = $('#albumView');
    view.classList.remove('open');
    view.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('locked');
    currentAlbum = null;
    document.title = (SITE.title || 'DOLLAR NONG') + ' · 摄影作品';
  }

  /* ------------------------------------------------------------------ 灯箱缩放 */
  var LB_ZMAX = 5;
  var lz = { k: 1, x: 0, y: 0, drag: null, pinch: null, tap: null, lastTap: 0, hinted: false };

  function lbBox() {
    var st = $('#lbStage');
    if (!st) return null;
    var cs = getComputedStyle(st);
    var pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
    var pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
    var r = st.getBoundingClientRect();
    var w = Math.max(0, st.clientWidth - pl - pr), h = Math.max(0, st.clientHeight - pt - pb);
    return { cx: r.left + pl + w / 2, cy: r.top + pt + h / 2, w: w, h: h };
  }

  function clampLz() {
    var box = lbBox(), img = $('#lbImg');
    if (!box || !img) return;
    var w = img.offsetWidth * lz.k, h = img.offsetHeight * lz.k;
    var mx = Math.max(0, (w - box.w) / 2), my = Math.max(0, (h - box.h) / 2);
    lz.x = Math.min(mx, Math.max(-mx, lz.x));
    lz.y = Math.min(my, Math.max(-my, lz.y));
  }

  function paintLz() {
    var img = $('#lbImg'), st = $('#lbStage');
    if (!img || !st) return;
    img.style.transform = (lz.k === 1 && !lz.x && !lz.y) ? '' :
      'translate3d(' + lz.x.toFixed(1) + 'px,' + lz.y.toFixed(1) + 'px,0) scale(' + lz.k.toFixed(3) + ')';
    st.classList.toggle('zoomed', lz.k > 1.01);
    setText('#lbZoom', Math.round(lz.k * 100) + '%');
    var zin = $('#lbZoomIn'), zout = $('#lbZoomOut');
    if (zin) zin.disabled = lz.k >= LB_ZMAX - 0.001;
    if (zout) zout.disabled = lz.k <= 1.001;
  }

  function setZoom(k, cx, cy, smooth) {
    var box = lbBox();
    if (!box) return;
    k = Math.max(1, Math.min(LB_ZMAX, k));
    var prev = lz.k;
    if (Math.abs(k - prev) < 0.001) return;
    cx = (cx == null) ? box.cx : cx;
    cy = (cy == null) ? box.cy : cy;
    var px = cx - box.cx, py = cy - box.cy;
    lz.x = px - (px - lz.x) * (k / prev);
    lz.y = py - (py - lz.y) * (k / prev);
    lz.k = k;
    if (k <= 1.001) { lz.k = 1; lz.x = 0; lz.y = 0; }
    clampLz();
    paintLz();
    var st = $('#lbStage');
    if (smooth && st) {
      st.classList.add('smooth');
      setTimeout(function () { st.classList.remove('smooth'); }, 220);
    }
  }

  function resetZoom() {
    lz.k = 1; lz.x = 0; lz.y = 0; lz.drag = null; lz.pinch = null;
    var st = $('#lbStage'), img = $('#lbImg');
    if (st) st.classList.remove('smooth', 'dragging', 'zoomed');
    if (img) img.style.transform = '';
    setText('#lbZoom', '100%');
    var zin = $('#lbZoomIn'), zout = $('#lbZoomOut');
    if (zin) zin.disabled = false;
    if (zout) zout.disabled = true;
  }

  function actualZoom() {
    var img = $('#lbImg');
    if (!img || !img.offsetWidth) return 2;
    return Math.max(2, Math.min(LB_ZMAX, img.naturalWidth / img.offsetWidth));
  }

  function toggleZoom(cx, cy) {
    if (lz.k > 1.01) resetZoom(); else setZoom(actualZoom(), cx, cy, true);
  }

  function hintOnce() {
    if (lz.hinted) return;
    lz.hinted = true;
    var h = $('#lbHint');
    if (!h) return;
    h.classList.add('show');
    setTimeout(function () { h.classList.remove('show'); }, 3800);
  }

  /* ------------------------------------------------------------------ 灯箱 */
  var lbList = [], lbIdx = 0;

  function openLightbox(list, index) {
    lbList = list; lbIdx = index;
    var lb = $('#lightbox');
    lb.classList.add('open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.classList.add('locked');
    renderThumbs();
    show(lbIdx);
    setTimeout(hintOnce, 400);
  }

  function closeLightbox() {
    $('#lightbox').classList.remove('open');
    $('#lightbox').setAttribute('aria-hidden', 'true');
    if (!$('#albumView').classList.contains('open')) document.body.classList.remove('locked');
    $('#lbImg').removeAttribute('src');
    resetZoom(false);
  }

  function show(i) {
    if (!lbList.length) return;
    lbIdx = (i + lbList.length) % lbList.length;
    var p = lbList[lbIdx];
    var img = $('#lbImg');
    resetZoom(false);
    img.classList.remove('ready');
    img.onload = function () { img.classList.add('ready'); };
    img.src = p.src;
    img.alt = p.caption || ((currentAlbum ? currentAlbum.title : '作品') + ' 第 ' + (lbIdx + 1) + ' 张');
    setText('#lbCap', p.caption || '');
    setText('#lbIdx', (lbIdx + 1) + ' / ' + lbList.length);
    var thumbs = $('#lbThumbs').children;
    for (var k = 0; k < thumbs.length; k++) thumbs[k].classList.toggle('on', k === lbIdx);
    if (thumbs[lbIdx]) thumbs[lbIdx].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    [lbIdx + 1, lbIdx - 1].forEach(function (n) {
      var q = lbList[(n + lbList.length) % lbList.length];
      if (q) { var pre = new Image(); pre.src = q.src; }
    });
  }

  function renderThumbs() {
    $('#lbThumbs').innerHTML = lbList.map(function (p, i) {
      return '<img src="' + p.thumb + '" data-i="' + i + '" alt="">';
    }).join('');
    $('#lbThumbs').querySelectorAll('img').forEach(function (t) {
      t.addEventListener('click', function () { show(parseInt(t.dataset.i, 10)); });
    });
  }

  /* ------------------------------------------------------------------ 路由 */
  function route() {
    var hash = location.hash || '#/';
    var m = hash.match(/^#\/a\/(.+)$/);
    if (m) { openAlbum(decodeURIComponent(m[1])); return; }
    closeAlbum();
    if (hash === '#about') scrollTo('#about');
    if (hash === '#contact') scrollTo('#contact');
    if (hash === '#works') scrollTo('#works');
  }

  function scrollTo(sel) {
    var el = document.querySelector(sel);
    if (el) setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
  }

  /* ------------------------------------------------------------------ 滚动效果 */
  function bindScroll() {
    var nav = $('#nav');
    var onScroll = function () { nav.classList.toggle('solid', window.scrollY > 40); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .05 });
    document.querySelectorAll('.reveal, .section-head, .about-grid, .contact-inner').forEach(function (el) {
      el.classList.add('reveal'); io.observe(el);
    });
  }

  function renderEmpty() {
    var works = $('#albums');
    if (works) works.outerHTML = '<div class="empty">还没有作品数据。<br>运行 <code>python3 tools/photosite.py build</code> 生成一次，或打开管理台上传照片。</div>';
  }

  /* ------------------------------------------------------------------ 启动 */
  renderSite();
  renderHero();
  renderAlbums();
  renderAboutMedia();
  bindScroll();

  $('#albumBack').addEventListener('click', function () { location.hash = '#/'; });
  $('#lbClose').addEventListener('click', closeLightbox);
  $('#lbPrev').addEventListener('click', function () { show(lbIdx - 1); });
  $('#lbNext').addEventListener('click', function () { show(lbIdx + 1); });
  $('#lbStage').addEventListener('click', function (e) {
    if (lz.moved) { lz.moved = false; return; }
    if (e.target.id === 'lbStage' && lz.k <= 1.01) closeLightbox();
  });

  /* ---- 缩放交互：按钮 / 滚轮 / 双击 / 拖动 / 双指 ---- */
  $('#lbZoomIn').addEventListener('click', function (e) {
    e.stopPropagation(); setZoom(lz.k * 1.4, null, null, true);
  });
  $('#lbZoomOut').addEventListener('click', function (e) {
    e.stopPropagation(); setZoom(lz.k / 1.4, null, null, true);
  });
  $('#lbZoom').addEventListener('click', function (e) {
    e.stopPropagation(); toggleZoom(null, null);
  });

  var lbSt = $('#lbStage');

  lbSt.addEventListener('wheel', function (e) {
    if (!$('#lightbox').classList.contains('open')) return;
    e.preventDefault();
    setZoom(lz.k * Math.exp(-e.deltaY * 0.0018), e.clientX, e.clientY, false);
  }, { passive: false });

  lbSt.addEventListener('dblclick', function (e) {
    if (e.target.id !== 'lbImg') return;
    e.preventDefault();
    toggleZoom(e.clientX, e.clientY);
  });

  lbSt.addEventListener('mousedown', function (e) {
    if (lz.k <= 1.01 || e.button !== 0) return;
    lz.drag = { x: e.clientX, y: e.clientY, tx: lz.x, ty: lz.y };
    lz.moved = false;
    lbSt.classList.add('dragging');
    e.preventDefault();
  });
  window.addEventListener('mousemove', function (e) {
    if (!lz.drag) return;
    var dx = e.clientX - lz.drag.x, dy = e.clientY - lz.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) lz.moved = true;
    lz.x = lz.drag.tx + dx;
    lz.y = lz.drag.ty + dy;
    clampLz(); paintLz();
  });
  window.addEventListener('mouseup', function () {
    if (!lz.drag) return;
    lz.drag = null;
    lbSt.classList.remove('dragging');
  });

  document.addEventListener('keydown', function (e) {
    if (!$('#lightbox').classList.contains('open')) {
      if (e.key === 'Escape' && $('#albumView').classList.contains('open')) { location.hash = '#/'; }
      return;
    }
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') show(lbIdx - 1);
    if (e.key === 'ArrowRight') show(lbIdx + 1);
    if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(lz.k * 1.4, null, null, true); }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(lz.k / 1.4, null, null, true); }
    if (e.key === '0') { e.preventDefault(); resetZoom(); }
  });

  /* 触屏：双指缩放 / 放大后拖动 / 双击放大 / 未放大时左右滑动换图 */
  lbSt.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      var a = e.touches[0], b = e.touches[1];
      lz.pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, k: lz.k };
      lz.tap = null; lz.drag = null;
      return;
    }
    if (e.touches.length !== 1) return;
    var t = e.touches[0];
    lz.pinch = null;
    lz.tap = { x: t.clientX, y: t.clientY, time: Date.now(), moved: false };
    if (lz.k > 1.01) {
      lz.drag = { x: t.clientX, y: t.clientY, tx: lz.x, ty: lz.y };
      lbSt.classList.add('dragging');
    }
  }, { passive: true });

  lbSt.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && lz.pinch) {
      e.preventDefault();
      var a = e.touches[0], b = e.touches[1];
      var d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      setZoom(lz.pinch.k * (d / lz.pinch.d), (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, false);
      return;
    }
    if (e.touches.length === 1 && lz.drag) {
      e.preventDefault();
      var t = e.touches[0];
      var dx = t.clientX - lz.drag.x, dy = t.clientY - lz.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4 && lz.tap) lz.tap.moved = true;
      lz.x = lz.drag.tx + dx;
      lz.y = lz.drag.ty + dy;
      clampLz(); paintLz();
    }
  }, { passive: false });

  lbSt.addEventListener('touchend', function (e) {
    var wasPinch = !!lz.pinch;
    if (e.touches.length === 0) lz.pinch = null;
    if (lz.drag) { lz.drag = null; lbSt.classList.remove('dragging'); }
    if (!lz.tap) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - lz.tap.x, dy = t.clientY - lz.tap.y;
    var isTap = !lz.tap.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8 && (Date.now() - lz.tap.time) < 320;
    if (isTap && !wasPinch) {
      var now = Date.now();
      if (now - lz.lastTap < 320) { toggleZoom(t.clientX, t.clientY); lz.lastTap = 0; }
      else { lz.lastTap = now; }
    } else if (!wasPinch && lz.k <= 1.01 && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) {
      show(lbIdx + (dx < 0 ? 1 : -1));
    }
    lz.tap = null;
  }, { passive: true });

  window.addEventListener('hashchange', route);
  route();
})();
