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
  }

  function closeLightbox() {
    $('#lightbox').classList.remove('open');
    $('#lightbox').setAttribute('aria-hidden', 'true');
    if (!$('#albumView').classList.contains('open')) document.body.classList.remove('locked');
    $('#lbImg').removeAttribute('src');
  }

  function show(i) {
    if (!lbList.length) return;
    lbIdx = (i + lbList.length) % lbList.length;
    var p = lbList[lbIdx];
    var img = $('#lbImg');
    img.classList.remove('ready');
    img.onload = function () { img.classList.add('ready'); };
    img.src = p.src;
    img.alt = p.title || '';
    setText('#lbCap', p.title || '');
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
  $('#lbStage').addEventListener('click', function (e) { if (e.target.id === 'lbStage') closeLightbox(); });

  document.addEventListener('keydown', function (e) {
    if (!$('#lightbox').classList.contains('open')) {
      if (e.key === 'Escape' && $('#albumView').classList.contains('open')) { location.hash = '#/'; }
      return;
    }
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') show(lbIdx - 1);
    if (e.key === 'ArrowRight') show(lbIdx + 1);
  });

  var touchX = null;
  $('#lbStage').addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
  $('#lbStage').addEventListener('touchend', function (e) {
    if (touchX == null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 55) show(lbIdx + (dx < 0 ? 1 : -1));
    touchX = null;
  }, { passive: true });

  window.addEventListener('hashchange', route);
  route();
})();
