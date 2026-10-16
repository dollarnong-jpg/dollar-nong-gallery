/* 摄影站管理台 · 前端逻辑 */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };

  var state = { albums: [], current: null, site: {}, config: {} };

  function toast(msg, kind) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast ' + (kind || '');
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 3600);
  }

  function busy(on, kind) {
    $('#dot').className = 'dot' + (on ? ' busy' : (kind === 'err' ? ' err' : ''));
    ['#buildBtn', '#publishBtn'].forEach(function (s) { $(s).disabled = !!on; });
  }

  function api(path, body, method) {
    return fetch(path, {
      method: method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw new Error(j.error || '操作失败');
      return j;
    });
  }

  /* ---------------------------------------------------------------- 状态 */
  function load() {
    return fetch('/api/state').then(function (r) { return r.json(); }).then(function (d) {
      state.albums = d.albums || [];
      state.site = d.site || {};
      state.config = d.config || {};
      $('#contentPath').textContent = d.contentDir;
      if (state.current) {
        state.current = state.albums.filter(function (a) { return a.folder === state.current.folder; })[0] || null;
      }
      if (!state.current && state.albums.length) state.current = state.albums[0];
      renderAlbums();
      renderCurrent();
    });
  }

  /* ---------------------------------------------------------------- 相册列表 */
  function renderAlbums() {
    var ul = $('#albumList');
    if (!state.albums.length) { ul.innerHTML = '<li style="color:#8e939c">还没有相册，点右上角新建</li>'; return; }
    ul.innerHTML = state.albums.map(function (a) {
      return '<li data-folder="' + esc(a.folder) + '" class="' + (state.current && state.current.folder === a.folder ? 'on' : '') + '">' +
        '<b style="font-weight:500">' + esc(a.title) + '</b><span class="n">' + a.count + '</span></li>';
    }).join('');
    ul.querySelectorAll('li').forEach(function (li) {
      li.addEventListener('click', function () {
        state.current = state.albums.filter(function (a) { return a.folder === li.dataset.folder; })[0];
        renderAlbums(); renderCurrent();
      });
    });
  }

  function renderCurrent() {
    var a = state.current;
    var edit = $('#albumEdit');
    if (!a) {
      edit.hidden = true;
      $('#photoGrid').innerHTML = '';
      $('#photoHint').hidden = false;
      $('#photoHint').textContent = '先新建一个相册';
      return;
    }
    edit.hidden = false;
    $('#fTitle').value = a.title || '';
    $('#fSlug').value = a.slug || '';
    $('#fSub').value = a.subtitle || '';
    $('#fDesc').value = a.description || '';
    $('#fHidden').checked = !!a.hidden;
    $('#photoHint').hidden = a.files.length > 0;
    $('#photoHint').textContent = '这个相册还是空的，把照片拖到上面';

    var files = a.files.slice();
    if (a.order && a.order.length) {
      var rank = {}; a.order.forEach(function (n, i) { rank[n] = i; });
      files.sort(function (x, y) { return (rank[x] === undefined ? 999 : rank[x]) - (rank[y] === undefined ? 999 : rank[y]); });
    }
    $('#photoGrid').innerHTML = files.map(function (f, i) {
      var isCover = a.cover === f;
      return '<div class="card' + (isCover ? ' cover' : '') + '" draggable="true" data-file="' + esc(f) + '" data-i="' + i + '">' +
        (isCover ? '<span class="badge">封面</span>' : '') +
        '<img src="/api/thumb?album=' + encodeURIComponent(a.slug) + '&file=' + encodeURIComponent(f) + '" alt="" loading="lazy">' +
        '<span class="name">' + esc(f) + '</span>' +
        '<span class="acts"><button data-act="cover" title="设为封面">★</button><button data-act="del" title="删除">✕</button></span>' +
        '</div>';
    }).join('');

    $('#photoGrid').querySelectorAll('.card').forEach(function (card) {
      card.querySelectorAll('button').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (btn.dataset.act === 'cover') return setCover(card.dataset.file);
          if (btn.dataset.act === 'del') return delPhoto(card.dataset.file);
        });
      });
      card.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', card.dataset.i); card.style.opacity = '.35'; });
      card.addEventListener('dragend', function () { card.style.opacity = ''; });
      card.addEventListener('dragover', function (e) { e.preventDefault(); });
      card.addEventListener('drop', function (e) {
        e.preventDefault();
        var from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        var to = parseInt(card.dataset.i, 10);
        if (isNaN(from) || from === to) return;
        var arr = files.slice();
        arr.splice(to, 0, arr.splice(from, 1)[0]);
        api('/api/photo/order', { folder: a.folder, order: arr }).then(load).then(function () { toast('顺序已保存', 'ok'); });
      });
    });
  }

  function setCover(file) {
    api('/api/album/update', { folder: state.current.folder, cover: file }).then(load).then(function () { toast('封面已设置', 'ok'); });
  }

  function delPhoto(file) {
    if (!confirm('删除这张照片？原图会从内容目录移除。\n\n' + file)) return;
    api('/api/photo/delete', { folder: state.current.folder, file: file }).then(load).then(function () { toast('已删除', 'ok'); });
  }

  /* ---------------------------------------------------------------- 上传 */
  function uploadFiles(fileList) {
    var album = state.current;
    if (!album) { toast('先选中一个相册', 'err'); return; }
    var files = Array.prototype.slice.call(fileList).filter(function (f) { return /\.(jpe?g|png|tiff?|heic|webp|bmp|gif|cr2|cr3|nef|arw|dng|raf|rw2|orf)$/i.test(f.name); });
    if (!files.length) { toast('没有可识别的图片格式', 'err'); return; }
    var wrap = $('#progressWrap'), bar = $('#progressBar'), txt = $('#progressTxt');
    wrap.hidden = false;
    busy(true);

    var done = 0;
    var next = function () {
      if (!files.length) {
        busy(false);
        wrap.hidden = true;
        toast('上传完成，共 ' + done + ' 张。记得点「生成」和「发布到线上」', 'ok');
        return load();
      }
      var file = files.shift();
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload?album=' + encodeURIComponent(album.slug) + '&name=' + encodeURIComponent(file.name));
      xhr.upload.onprogress = function (e) {
        if (!e.lengthComputable) return;
        var pct = ((done + e.loaded / e.total) / (done + files.length + 1)) * 100;
        bar.style.right = (100 - pct) + '%';
        txt.textContent = Math.round(pct) + '%　' + file.name;
      };
      xhr.onload = function () {
        try {
          var j = JSON.parse(xhr.responseText);
          if (!j.ok) toast(file.name + '：' + (j.error || '上传失败'), 'err');
        } catch (err) { toast(file.name + '：上传失败', 'err'); }
        done++;
        next();
      };
      xhr.onerror = function () { toast(file.name + '：网络错误', 'err'); done++; next(); };
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.send(file);
    };
    next();
  }

  /* ---------------------------------------------------------------- 弹窗 */
  function modal(title, fields, onOk) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = fields.map(function (f) {
      if (f.type === 'textarea') return '<label>' + esc(f.label) + '<textarea id="m_' + f.key + '">' + esc(f.value || '') + '</textarea></label>';
      return '<label>' + esc(f.label) + '<input id="m_' + f.key + '" type="text" value="' + esc(f.value || '') + '"></label>';
    }).join('');
    $('#modal').hidden = false;
    $('#modalOk').onclick = function () {
      var out = {};
      fields.forEach(function (f) { out[f.key] = $('#m_' + f.key).value; });
      Promise.resolve(onOk(out)).then(function (r) {
        if (r !== false) { $('#modal').hidden = true; load(); }
      }).catch(function (e) { toast(e.message, 'err'); });
    };
  }

  function closeModal() { $('#modal').hidden = true; }

  /* ---------------------------------------------------------------- 日志 */
  function pullLog() {
    fetch('/api/log').then(function (r) { return r.json(); }).then(function (d) {
      var pre = $('#log');
      var atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 40;
      pre.textContent = (d.lines || []).join('\n');
      if (atBottom) pre.scrollTop = pre.scrollHeight;
    }).catch(function () {});
  }

  /* ---------------------------------------------------------------- 绑定 */
  $('#pickBtn').addEventListener('click', function () { $('#fileInput').click(); });
  $('#dropzone').addEventListener('click', function (e) { if (e.target.id === 'dropzone' || e.target.className === 'dz-main') $('#fileInput').click(); });
  $('#fileInput').addEventListener('change', function () { uploadFiles(this.files); this.value = ''; });

  var dz = $('#dropzone');
  ['dragenter', 'dragover'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('hot'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('hot'); });
  });
  dz.addEventListener('drop', function (e) { if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); });

  $('#newAlbumBtn').addEventListener('click', function () {
    modal('新建相册', [
      { key: 'name', label: '相册名字（例如：人像、美食、航拍）', value: '' }
    ], function (v) {
      if (!v.name.trim()) throw new Error('请填写名字');
      return api('/api/album/create', { name: v.name.trim() }).then(function () { toast('相册已创建', 'ok'); });
    });
  });

  $('#saveAlbumBtn').addEventListener('click', function () {
    if (!state.current) return;
    api('/api/album/update', {
      folder: state.current.folder,
      title: $('#fTitle').value, slug: $('#fSlug').value, subtitle: $('#fSub').value,
      description: $('#fDesc').value, hidden: $('#fHidden').checked
    }).then(function () { toast('相册信息已保存', 'ok'); return load(); });
  });

  $('#delAlbumBtn').addEventListener('click', function () {
    if (!state.current) return;
    if (!confirm('删除相册「' + state.current.title + '」？里面的原图也会一起删除。')) return;
    api('/api/album/delete', { folder: state.current.folder }).then(function () {
      state.current = null; toast('相册已删除', 'ok'); return load();
    });
  });

  $('#siteBtn').addEventListener('click', function () {
    modal('站点信息与联系方式', [
      { key: 'title', label: '英文站名', value: state.site.title || 'DOLLAR NONG' },
      { key: 'titleCn', label: '中文站名', value: state.site.titleCn || '' },
      { key: 'subtitle', label: '副标题', value: state.site.subtitle || '' },
      { key: 'intro', label: '首屏一句话介绍', type: 'textarea', value: state.site.intro || '' },
      { key: 'about', label: '关于我', type: 'textarea', value: state.site.about || '' },
      { key: 'location', label: '所在地', value: state.site.location || '' },
      { key: 'services', label: '服务范围', value: state.site.services || '' },
      { key: 'wechat', label: '微信号', value: state.site.wechat || '' },
      { key: 'phone', label: '电话', value: state.site.phone || '' },
      { key: 'email', label: '邮箱', value: state.site.email || '' },
      { key: 'xiaohongshu', label: '小红书', value: state.site.xiaohongshu || '' },
      { key: 'footerNote', label: '页脚备注（版权声明等）', value: state.site.footerNote || '' }
    ], function (v) {
      return api('/api/site', v).then(function () { toast('站点信息已保存', 'ok'); });
    });
  });

  $('#configBtn').addEventListener('click', function () {
    modal('内容目录设置', [
      { key: 'content', label: '原图目录（可填 NAS 挂载路径，例如 /Volumes/photo/摄影站/content）', value: state.config.content || '' },
      { key: 'web', label: '网站输出目录', value: state.config.web || '' },
      { key: 'thumbSize', label: '缩略图最长边（像素）', value: state.config.thumbSize || 900 },
      { key: 'fullSize', label: '大图最长边（像素）', value: state.config.fullSize || 2048 }
    ], function (v) {
      v.thumbSize = parseInt(v.thumbSize, 10) || 900;
      v.fullSize = parseInt(v.fullSize, 10) || 2048;
      return api('/api/config', v).then(function () { toast('设置已保存，重启管理台后生效', 'ok'); });
    });
  });

  $('#buildBtn').addEventListener('click', function () {
    busy(true); toast('正在生成缩略图和页面数据…');
    api('/api/build').then(function (r) {
      busy(false); toast('生成完成：' + r.albumCount + ' 个相册 / ' + r.photoCount + ' 张照片', 'ok'); pullLog();
    }).catch(function (e) { busy(false, 'err'); toast(e.message, 'err'); });
  });

  $('#publishBtn').addEventListener('click', function () {
    if (!confirm('发布会把生成的网站提交并推送到 GitHub，线上几分钟后更新。继续？')) return;
    busy(true); toast('正在发布…');
    api('/api/publish', {}).then(function () {
      busy(false); toast('已推送。稍等 1-2 分钟刷新线上站点', 'ok'); pullLog();
    }).catch(function (e) { busy(false, 'err'); toast(e.message, 'err'); pullLog(); });
  });

  $('#modalCancel').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', function (e) { if (e.target.id === 'modal') closeModal(); });
  $('#clearLog').addEventListener('click', function () { $('#log').textContent = ''; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  load();
  pullLog();
  setInterval(pullLog, 2500);
})();
