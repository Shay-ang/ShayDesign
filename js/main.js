(function () {
  'use strict';

  var IS_PREVIEW    = /[?&]preview=1/.test(location.search);
  var CONFIG        = null;
  var _previewRoute = '';
  var _previewBP    = 'desktop'; // breakpoint set by admin, used instead of window.innerWidth in preview

  // ── Social icon SVGs ─────────────────────────────────────────────────────
  var SOCIAL_ICONS = {
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none"/></svg>',
    linkedin:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>',
    mail:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>',
    behance:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 7h-7V5h7v2zm1.726 10c-.442 1.297-2.029 3-5.101 3-3.074 0-5.564-1.729-5.564-5.675 0-3.91 2.325-5.92 5.466-5.92 3.082 0 4.964 1.782 5.375 4.426.078.506.109 1.188.095 2.14H15.97c.13 1.202.58 1.662 1.573 1.662.671 0 1.148-.238 1.368-.607H23v.974zM15.998 13h3.796c-.104-1.196-.71-1.81-1.86-1.81-1.12 0-1.797.628-1.936 1.81zM8.221 11.717c1.492-.326 2.145-1.3 2.145-2.655 0-2.078-1.567-3.062-3.516-3.062H2v12h4.857c2.2 0 4.07-1.08 4.07-3.378 0-1.494-.667-2.595-2.706-2.905zM5.5 8.5H7c.667 0 1.2.3 1.2 1 0 .7-.567 1-1.2 1H5.5V8.5zm1.667 6H5.5v-2.25h1.667C8 12.25 8.5 12.75 8.5 13.5s-.5 1-1.333 1z"/></svg>',
  };

  // ── Refs ─────────────────────────────────────────────────────────────────
  var app;
  var lbAssets = [];
  var lbPos    = 0;

  // ── Utilities ─────────────────────────────────────────────────────────────
  function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function mediaHTML(asset, inLightbox) {
    if (asset.type === 'video') {
      var attrs = inLightbox ? 'controls' : 'autoplay muted loop playsinline';
      return '<video src="' + escAttr(asset.file) + '" ' + attrs + ' preload="none"></video>';
    }
    var loading = inLightbox ? '' : ' loading="lazy"';
    return '<img src="' + escAttr(asset.file) + '" alt="' + escAttr(asset.name || '') + '"' + loading + '>';
  }

  // ── Breakpoint detection ─────────────────────────────────────────────────
  function getBreakpoint() {
    return window.innerWidth <= 640 ? 'mobile' : window.innerWidth <= 1024 ? 'tablet' : 'desktop';
  }

  // ── Resolve grid config for current breakpoint ───────────────────────────
  function resolveGrid(rawGrid) {
    var g = rawGrid || {};
    var base = {
      columns:       g.columns       != null ? g.columns       : 3,
      gap:           g.gap           != null ? g.gap           : 10,
      width:         g.width         != null ? g.width         : 100,
      maxWidth:      g.maxWidth      != null ? g.maxWidth      : 0,
      paddingTop:    g.paddingTop    != null ? g.paddingTop    : 40,
      paddingBottom: g.paddingBottom != null ? g.paddingBottom : 0,
      rowHeight:     g.rowHeight     != null ? g.rowHeight     : 0,
      columnRatio:   g.columnRatio   != null ? g.columnRatio   : null,
    };
    // In preview mode, use the breakpoint the admin has selected rather than the
    // actual iframe window width (which can be narrower than 1024px even in "Desktop" mode).
    var bp = IS_PREVIEW ? _previewBP : getBreakpoint();
    if (bp !== 'desktop' && g[bp]) return Object.assign({}, base, g[bp]);
    return base;
  }

  // ── Grid inline style ────────────────────────────────────────────────────
  function gridColTemplate(g) {
    if (g.columns === 2 && g.columnRatio != null) {
      return g.columnRatio + 'fr ' + (100 - g.columnRatio) + 'fr';
    }
    return 'repeat(' + g.columns + ',1fr)';
  }

  // Style for each .asset-row wrapper (2-col only), ratio may be null for 50/50
  function rowGridStyle(g, ratio) {
    var colTemplate = ratio != null ? (ratio + 'fr ' + (100 - ratio) + 'fr') : '1fr 1fr';
    var parts = [
      'display:grid',
      'grid-template-columns:' + colTemplate,
      'gap:' + g.gap + 'px',
    ];
    if (g.rowHeight) {
      parts.push('grid-auto-rows:' + g.rowHeight + 'px');
      parts.push('align-items:stretch');
    }
    return parts.join(';');
  }

  // Outer #asset-grid style — flex-column for 2-col, CSS grid otherwise
  function gridStyle(g) {
    if (g.columns === 2) {
      var parts = [
        'display:flex', 'flex-direction:column',
        'gap:' + g.gap + 'px',
        'width:' + g.width + '%',
        'padding-top:' + g.paddingTop + 'px',
        'padding-bottom:' + g.paddingBottom + 'px',
        'margin:0 auto',
      ];
      if (g.maxWidth) parts.push('max-width:' + g.maxWidth + 'px');
      return parts.join(';');
    }
    var parts = [
      'display:grid',
      'grid-template-columns:' + gridColTemplate(g),
      'gap:' + g.gap + 'px',
      'width:' + g.width + '%',
      'padding-top:' + g.paddingTop + 'px',
      'padding-bottom:' + g.paddingBottom + 'px',
      'margin:0 auto',
      g.rowHeight ? 'align-items:stretch' : 'align-items:start',
    ];
    if (g.maxWidth)  parts.push('max-width:' + g.maxWidth + 'px');
    if (g.rowHeight) parts.push('grid-auto-rows:' + g.rowHeight + 'px');
    return parts.join(';');
  }

  // ── Google Fonts loader ───────────────────────────────────────────────────
  var FONT_QUERIES = {
    'DM Sans':            'DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,300',
    'Inter':              'Inter:wght@300;400;500;600;700',
    'Montserrat':         'Montserrat:ital,wght@0,300;0,400;0,500;0,700;1,300',
    'Space Grotesk':      'Space+Grotesk:wght@300;400;500;600;700',
    'Plus Jakarta Sans':  'Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,700;1,300',
    'Cormorant Garamond': 'Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300',
    'Playfair Display':   'Playfair+Display:ital,wght@0,400;0,500;0,700;1,400',
    'Syne':               'Syne:wght@400;500;600;700',
    'Heebo':              'Heebo:wght@300;400;500;700',
  };

  function loadGoogleFont(family) {
    if (!family || family === 'DM Sans') return;
    var id = 'gfont-' + family.replace(/\s+/g, '-').toLowerCase();
    if (document.getElementById(id)) return;
    var q = FONT_QUERIES[family];
    if (!q) return;
    var lnk = document.createElement('link');
    lnk.id = id; lnk.rel = 'stylesheet';
    lnk.href = 'https://fonts.googleapis.com/css2?family=' + q + '&display=swap';
    document.head.appendChild(lnk);
  }

  // ── Apply designer styles as CSS custom properties ────────────────────────
  function applyStylesObj(s) {
    var r = document.documentElement;
    function set(prop, val, suffix) {
      if (val != null) r.style.setProperty(prop, val + (suffix || ''));
      else             r.style.removeProperty(prop);
    }
    // Font family
    loadGoogleFont(s.fontFamily);
    if (s.fontFamily && s.fontFamily !== 'DM Sans') {
      r.style.setProperty('--font-family', "'" + s.fontFamily + "', sans-serif");
    } else {
      r.style.removeProperty('--font-family');
    }
    set('--hero-title-size',     s.heroTitleSize,     'px');
    set('--hero-title-weight',   s.heroTitleWeight != null ? String(s.heroTitleWeight) : null, '');
    set('--hero-title-color',    s.heroTitleColor,    '');
    set('--hero-subtitle-size',  s.heroSubtitleSize,  'px');
    set('--hero-subtitle-color', s.heroSubtitleColor, '');
    set('--hero-pt',             s.heroPaddingTop,    'px');
    set('--hero-pb',             s.heroPaddingBottom, 'px');
    set('--proj-title-size',        s.projectTitleSize,        'px');
    set('--proj-title-size-tablet', s.projectTitleSizeTablet,  'px');
    set('--proj-title-size-mobile', s.projectTitleSizeMobile,  'px');
    set('--proj-title-weight',      s.projectTitleWeight != null ? String(s.projectTitleWeight) : null, '');
    set('--proj-title-color',       s.projectTitleColor, '');
    // Social icon size
    set('--social-icon-size', s.socialIconSize, 'px');
    // Back button size
    set('--back-btn-size', s.backBtnSize, 'px');
    // Nav logo gap + text styling
    set('--nav-logo-gap',    s.navLogoGap,    'px');
    set('--nav-text-size',   s.navTextSize,   'px');
    set('--nav-text-weight', s.navTextWeight != null ? String(s.navTextWeight) : null, '');
    set('--nav-text-color',  s.navTextColor,  '');
    if (s.navTextHidden)    r.style.setProperty('--nav-text-display',   'none');
    else                    r.style.removeProperty('--nav-text-display');
    // Hero title visibility
    if (s.heroTitleHidden)  r.style.setProperty('--hero-title-display', 'none');
    else                    r.style.removeProperty('--hero-title-display');
    // Home grid columns per breakpoint
    set('--home-cols',        s.homeColsDesktop != null ? String(s.homeColsDesktop) : null, '');
    set('--home-cols-tablet', s.homeColsTablet  != null ? String(s.homeColsTablet)  : null, '');
    set('--home-cols-mobile', s.homeColsMobile  != null ? String(s.homeColsMobile)  : null, '');
    // Home tile styles
    set('--home-tile-gap',     s.homeTileGap,       'px');
    set('--home-tile-row-h',   s.homeTileRowHeight, 'px');
    set('--home-tile-padding', s.homeTilePadding,   'px');
    set('--home-tile-radius',  s.homeTileRadius,    'px');
    set('--home-tile-bg',      s.homeTileBg,        '');
    if (s.homeTileShadow != null && s.homeTileShadow > 0) {
      var sh = s.homeTileShadow;
      r.style.setProperty('--home-tile-shadow', '0 ' + Math.round(sh * 0.4) + 'px ' + sh + 'px rgba(0,0,0,0.10)');
    } else {
      r.style.removeProperty('--home-tile-shadow');
    }
  }

  function applyDesignerStyles() {
    if (!CONFIG) return;
    applyStylesObj(CONFIG.designer.styles || {});
  }

  // ── Persistent page info ─────────────────────────────────────────────────
  function renderPageInfo() {
    var d = CONFIG.designer;
    document.title = d.name;

    var navLogo = document.getElementById('nav-logo');
    if (d.logo) {
      navLogo.innerHTML = '<img src="' + escAttr(d.logo) + '" alt="" class="nav-logo-img"><span class="nav-logo-text">' + esc(d.name) + '</span>';
    } else {
      navLogo.textContent = d.name;
    }

    var links = '';
    Object.keys(d.social || {}).forEach(function (key) {
      var url = d.social[key];
      if (url && SOCIAL_ICONS[key]) {
        links += '<a href="' + escAttr(url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + key + '" class="social-link">' + SOCIAL_ICONS[key] + '</a>';
      }
    });
    if (d.email) {
      links += '<a href="mailto:' + escAttr(d.email) + '" aria-label="email" class="social-link">' + SOCIAL_ICONS.mail + '</a>';
    }
    document.getElementById('footer-social').innerHTML = links;
  }

  // ── Breadcrumb ────────────────────────────────────────────────────────────
  function setBreadcrumb(label) {
    var el = document.getElementById('nav-breadcrumb');
    if (label) { el.textContent = '/ ' + label; el.classList.add('visible'); }
    else        { el.textContent = '';            el.classList.remove('visible'); }
  }

  // ── Logo path helper ──────────────────────────────────────────────────────
  function clientLogoPath(client) {
    if (client.logo) return client.logo;
    var first = client.assets[0] && client.assets[0].file;
    if (!first) return '';
    return first.substring(0, first.lastIndexOf('/')) + '/logo.png';
  }

  // ── HOME PAGE ─────────────────────────────────────────────────────────────
  function renderHome() {
    setBreadcrumb('');

    var tiles = CONFIG.clients.map(function (client, i) {
      if (client.hidden) return '';
      var logo     = clientLogoPath(client);
      var size     = client.tileSize || 'featured';
      var logoH    = client.logoSize || 120;
      var imgErr   = ' onerror="this.style.display=\'none\'"';
      var logoHtml = logo
        ? '<img src="' + escAttr(logo) + '" alt="' + escAttr(client.name) + '" loading="lazy"' + imgErr + '>'
        : '';

      return (
        '<a href="#client/' + escAttr(client.id) + '" class="bento-item client-tile" data-size="' + size + '" data-index="' + i + '">' +
          '<div class="tile-logo-wrap" style="max-height:' + logoH + 'px">' + logoHtml + '</div>' +
        '</a>'
      );
    }).join('');

    app.innerHTML = (
      '<header class="hero page-enter">' +
        '<h1>' + esc(CONFIG.designer.name) + '</h1>' +
        '<p>'  + esc(CONFIG.designer.tagline || '') + '</p>' +
      '</header>' +
      '<section class="page-section">' +
        '<div class="container">' +
          '<div class="bento bento-home page-enter">' + tiles + '</div>' +
        '</div>' +
      '</section>'
    );

    if (IS_PREVIEW) {
      // Intercept tile clicks — notify parent instead of navigating
      app.querySelectorAll('.client-tile').forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          window.parent.postMessage({ type: 'tile-click', index: parseInt(el.dataset.index, 10) }, '*');
        });
      });
    }
  }

  // ── CLIENT PAGE ───────────────────────────────────────────────────────────
  function renderClient(clientId) {
    var client = CONFIG.clients.find(function (c) { return c.id === clientId; });
    if (!client) { renderHome(); return; }

    setBreadcrumb(client.name);
    lbAssets = client.assets;

    var g     = resolveGrid(client.grid);
    var style = gridStyle(g);
    var items;

    if (g.columns === 2) {
      // Row-wrapper rendering: each pair of assets gets its own grid div with its own ratio
      var rowsHtml = '';
      var ai = 0, rowIdx = 0;
      while (ai < client.assets.length) {
        var rowAssets = [];
        var colsUsed = 0;
        while (ai < client.assets.length) {
          var span = Math.min(client.assets[ai].cols || 1, 2);
          if (colsUsed + span > 2) break;
          rowAssets.push({ asset: client.assets[ai], index: ai, span: span });
          colsUsed += span;
          ai++;
        }
        if (rowAssets.length === 0) { ai++; continue; }
        var firstAsset = rowAssets[0].asset;
        var ratio = firstAsset.rowRatio != null ? firstAsset.rowRatio
                    : (g.columnRatio != null ? g.columnRatio : null);
        var tilesHtml = rowAssets.map(function (item) {
          var colAttr    = item.span > 1 ? ' style="grid-column:span ' + item.span + '"' : '';
          var draggable  = IS_PREVIEW ? ' draggable="true"' : '';
          var transpAttr = item.asset.transparent ? ' data-transparent' : '';
          return '<div class="asset-tile"' + colAttr + transpAttr + draggable + ' data-index="' + item.index + '">' +
            mediaHTML({ file: item.asset.file, type: item.asset.type, name: client.name }, false) +
          '</div>';
        }).join('');
        rowsHtml += '<div class="asset-row" data-row="' + rowIdx + '" style="' + rowGridStyle(g, ratio) + '">' + tilesHtml + '</div>';
        rowIdx++;
      }
      items = rowsHtml;
    } else {
      items = client.assets.map(function (asset, i) {
        var clampedCols = Math.min(asset.cols || 1, g.columns);
        var colSpan     = clampedCols > 1 ? 'grid-column:span ' + clampedCols : '';
        var rowSpan     = asset.rows > 1  ? 'grid-row:span '    + asset.rows  : '';
        var spanCSS     = [colSpan, rowSpan].filter(Boolean).join(';');
        var styleAttr   = spanCSS ? ' style="' + spanCSS + '"' : '';
        var rowsAttr    = asset.rows > 1 ? ' data-rows="' + asset.rows + '"' : '';
        var draggable   = IS_PREVIEW ? ' draggable="true"' : '';
        var transpAttr  = asset.transparent ? ' data-transparent' : '';
        return (
          '<div class="asset-tile"' + styleAttr + rowsAttr + transpAttr + draggable + ' data-index="' + i + '">' +
            mediaHTML({ file: asset.file, type: asset.type, name: client.name }, false) +
          '</div>'
        );
      }).join('');
    }

    app.innerHTML = (
      '<section class="page-section client-page">' +
        '<div class="container">' +
          '<div class="client-page-header page-enter">' +
            '<a href="#" class="back-btn">&#8592; All Work</a>' +
            '<div>' +
              '<h2 class="client-page-title">' + esc(client.name) + '</h2>' +
              (client.category ? '<span class="client-page-category">' + esc(client.category) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="asset-grid page-enter" id="asset-grid" style="' + style + '">' + items + '</div>' +
        '</div>' +
      '</section>'
    );

    var grid = document.getElementById('asset-grid');

    if (IS_PREVIEW) {
      // Click → select asset, or deselect on empty area (no lightbox in preview)
      grid.addEventListener('click', function (e) {
        if (e.target.closest('.asset-ctrl-strip')) return;
        var tile = e.target.closest('.asset-tile');
        if (tile) {
          window.parent.postMessage({ type: 'asset-click', index: parseInt(tile.dataset.index, 10) }, '*');
        } else {
          window.parent.postMessage({ type: 'asset-deselect' }, '*');
        }
      });

      // Back button → tell parent to show home
      var backBtn = app.querySelector('.back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', function (e) {
          e.preventDefault();
          window.parent.postMessage({ type: 'navigate-home' }, '*');
        });
      }

      // Drag-to-reorder
      var dragSrcIndex = -1;
      grid.addEventListener('dragstart', function (e) {
        var tile = e.target.closest('.asset-tile');
        if (!tile) return;
        dragSrcIndex = parseInt(tile.dataset.index, 10);
        e.dataTransfer.effectAllowed = 'move';
        tile.style.opacity = '0.4';
      });
      grid.addEventListener('dragend', function (e) {
        var tile = e.target.closest('.asset-tile');
        if (tile) tile.style.opacity = '';
        grid.querySelectorAll('.drag-over-preview').forEach(function (el) { el.classList.remove('drag-over-preview'); });
      });
      grid.addEventListener('dragover', function (e) {
        e.preventDefault();
        var tile = e.target.closest('.asset-tile');
        grid.querySelectorAll('.drag-over-preview').forEach(function (el) { el.classList.remove('drag-over-preview'); });
        if (tile && parseInt(tile.dataset.index, 10) !== dragSrcIndex) tile.classList.add('drag-over-preview');
      });
      grid.addEventListener('drop', function (e) {
        e.preventDefault();
        var tile = e.target.closest('.asset-tile');
        if (!tile) return;
        var dest = parseInt(tile.dataset.index, 10);
        if (dragSrcIndex === dest) return;
        window.parent.postMessage({ type: 'asset-drop', from: dragSrcIndex, to: dest }, '*');
      });

    } else {
      // Live site: click opens lightbox
      grid.addEventListener('click', function (e) {
        var tile = e.target.closest('.asset-tile');
        if (!tile) return;
        openLightbox(parseInt(tile.dataset.index, 10));
      });
    }
  }

  // ── Route helper (without scroll) ─────────────────────────────────────────
  function renderByRoute(r) {
    if (r.startsWith('client/')) renderClient(r.slice(7));
    else renderHome();
  }

  // ── LIGHTBOX ──────────────────────────────────────────────────────────────
  var lb = {};

  function initLightbox() {
    lb.el      = document.getElementById('lightbox');
    lb.media   = document.getElementById('lightbox-media');
    lb.label   = document.getElementById('lightbox-label');
    lb.counter = document.getElementById('lightbox-counter');
    lb.prev    = document.getElementById('lightbox-prev');
    lb.next    = document.getElementById('lightbox-next');

    lb.el.addEventListener('click', function (e) { if (e.target === lb.el) closeLightbox(); });
    document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
    lb.prev.addEventListener('click', function () { navigate(-1); });
    lb.next.addEventListener('click', function () { navigate(1); });

    document.addEventListener('keydown', function (e) {
      if (!lb.el.classList.contains('active')) return;
      if (e.key === 'Escape')     closeLightbox();
      if (e.key === 'ArrowLeft')  navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    });

    var touchStartX = 0;
    lb.el.addEventListener('touchstart', function (e) {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    lb.el.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) navigate(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function openLightbox(index) {
    lbPos = index;
    renderLightboxItem();
    lb.el.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lb.el.classList.remove('active');
    document.body.style.overflow = '';
    lb.media.innerHTML = '';
  }

  function navigate(dir) {
    var next = lbPos + dir;
    if (next < 0 || next >= lbAssets.length) return;
    lbPos = next;
    renderLightboxItem();
  }

  function renderLightboxItem() {
    var asset = lbAssets[lbPos];
    lb.media.innerHTML = mediaHTML({ file: asset.file, type: asset.type }, true);
    var clientName = '';
    CONFIG.clients.forEach(function (c) {
      c.assets.forEach(function (a) { if (a.file === asset.file) clientName = c.name; });
    });
    lb.label.textContent   = clientName;
    lb.counter.textContent = (lbPos + 1) + ' / ' + lbAssets.length;
    lb.prev.style.visibility = lbPos === 0                   ? 'hidden' : '';
    lb.next.style.visibility = lbPos === lbAssets.length - 1 ? 'hidden' : '';
  }

  // ── ROUTER ────────────────────────────────────────────────────────────────
  function route() {
    var hash = location.hash.slice(1);
    renderByRoute(hash);
    if (!IS_PREVIEW) window.scrollTo(0, 0);
  }

  function rerender() {
    renderByRoute(location.hash.slice(1));
  }

  var _lastBP = getBreakpoint();
  window.addEventListener('resize', function () {
    var bp = getBreakpoint();
    if (bp !== _lastBP) {
      _lastBP = bp;
      if (IS_PREVIEW) renderByRoute(_previewRoute);
      else rerender();
    }
  });

  // ── postMessage handler (admin preview) ───────────────────────────────────
  window.addEventListener('message', function (e) {
    if (!e.data) return;
    var msg = e.data;

    if (msg.type === 'preview-update') {
      CONFIG = msg.config;
      _previewRoute = msg.route != null ? msg.route : '';
      _previewBP    = msg.bp    != null ? msg.bp    : 'desktop';
      applyDesignerStyles();
      renderPageInfo();
      renderByRoute(_previewRoute);
      return;
    }

    if (msg.type === 'preview-select') {
      document.querySelectorAll('.preview-selected').forEach(function (el) {
        el.classList.remove('preview-selected');
      });
      document.querySelectorAll('.asset-ctrl-strip').forEach(function (el) {
        el.remove();
      });
      if (msg.page === 'asset' && msg.index >= 0) {
        var assetEls = document.querySelectorAll('.asset-tile');
        var selTile  = assetEls[msg.index];
        if (selTile) {
          selTile.classList.add('preview-selected');
          var stripIdx  = msg.index;
          var stripCols = msg.cols || 1;
          var stripRows = msg.rows || 1;
          var strip = document.createElement('div');
          strip.className = 'asset-ctrl-strip';
          strip.innerHTML =
            '<span class="strip-ctrl">' +
              '<button class="strip-btn" data-delta-col="-1">&#8592;</button>' +
              '<span class="strip-count strip-col-count">' + stripCols + '</span>' +
              '<span class="strip-label">col</span>' +
              '<button class="strip-btn" data-delta-col="1">&#8594;</button>' +
            '</span>' +
            '<span class="strip-ctrl">' +
              '<button class="strip-btn" data-delta-row="-1">&#8593;</button>' +
              '<span class="strip-count strip-row-count">' + stripRows + '</span>' +
              '<span class="strip-label">row</span>' +
              '<button class="strip-btn" data-delta-row="1">&#8595;</button>' +
            '</span>' +
            '<button class="strip-btn strip-remove" title="Remove from grid">&#215;</button>';
          strip.querySelectorAll('[data-delta-col]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
              e.stopPropagation();
              window.parent.postMessage({ type: 'asset-span-delta', index: stripIdx, colDelta: parseInt(btn.dataset.deltaCol, 10), rowDelta: 0 }, '*');
            });
          });
          strip.querySelectorAll('[data-delta-row]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
              e.stopPropagation();
              window.parent.postMessage({ type: 'asset-span-delta', index: stripIdx, colDelta: 0, rowDelta: parseInt(btn.dataset.deltaRow, 10) }, '*');
            });
          });
          strip.querySelector('.strip-remove').addEventListener('click', function (e) {
            e.stopPropagation();
            window.parent.postMessage({ type: 'asset-remove', index: stripIdx }, '*');
          });
          selTile.appendChild(strip);
        }
      } else if (msg.page === 'tile' && msg.index >= 0) {
        var selTileEl = document.querySelector('.client-tile[data-index="' + msg.index + '"]');
        if (selTileEl) selTileEl.classList.add('preview-selected');
      }
      return;
    }

    // Targeted updates — no re-render, no blink ──────────────────────────────

    if (msg.type === 'styles-update') {
      applyStylesObj(msg.styles || {});
      if (CONFIG) CONFIG.designer.styles = msg.styles;
      return;
    }

    if (msg.type === 'hero-text-update') {
      if (CONFIG) { CONFIG.designer.name = msg.name; CONFIG.designer.tagline = msg.tagline; }
      document.title = msg.name;
      var navLogoEl = document.getElementById('nav-logo');
      if (navLogoEl) {
        var navTextSpan = navLogoEl.querySelector('.nav-logo-text');
        if (navTextSpan) navTextSpan.textContent = msg.name;
        else if (!navLogoEl.querySelector('img')) navLogoEl.textContent = msg.name;
      }
      var heroH1 = app && app.querySelector('.hero h1');
      if (heroH1) heroH1.textContent = msg.name;
      var heroP = app && app.querySelector('.hero p');
      if (heroP) heroP.textContent = msg.tagline || '';
      return;
    }

    if (msg.type === 'project-text-update') {
      var titleEl = app && app.querySelector('.client-page-title');
      if (titleEl) titleEl.textContent = msg.name;
      var catEl = app && app.querySelector('.client-page-category');
      if (catEl) catEl.textContent = msg.category || '';
      setBreadcrumb(msg.name);
      return;
    }

    if (msg.type === 'logo-size-update') {
      var logoTile = app ? app.querySelector('.client-tile[data-index="' + msg.clientIndex + '"]') : null;
      if (logoTile) {
        var wrap = logoTile.querySelector('.tile-logo-wrap');
        if (wrap) wrap.style.maxHeight = msg.size + 'px';
      }
      return;
    }

    if (msg.type === 'tile-attr-update') {
      var attrTile = app ? app.querySelector('.client-tile[data-index="' + msg.clientIndex + '"]') : null;
      if (attrTile) attrTile.dataset.size = msg.tileSize;
      return;
    }

    if (msg.type === 'asset-span-update') {
      var assetTiles = app ? app.querySelectorAll('.asset-tile') : [];
      var spanTile = assetTiles[msg.assetIndex];
      if (spanTile) {
        var colSpan = msg.cols > 1 ? 'grid-column:span ' + Math.min(msg.cols, msg.totalCols) : '';
        var rowSpan = msg.rows > 1 ? 'grid-row:span '    + msg.rows                           : '';
        spanTile.style.cssText = [colSpan, rowSpan].filter(Boolean).join(';');
        var colCount = spanTile.querySelector('.strip-col-count');
        var rowCount = spanTile.querySelector('.strip-row-count');
        if (colCount) colCount.textContent = msg.cols;
        if (rowCount) rowCount.textContent = msg.rows;
      }
      return;
    }

    if (msg.type === 'grid-style-update') {
      var gridEl = document.getElementById('asset-grid');
      if (gridEl) {
        gridEl.setAttribute('style', msg.style);
        // For 2-col row-wrapper grids, also update each row's gap/rowHeight
        if (msg.rowStyle) {
          gridEl.querySelectorAll('.asset-row').forEach(function (row) {
            var cols = row.style.gridTemplateColumns;
            row.setAttribute('style', msg.rowStyle);
            if (cols) row.style.gridTemplateColumns = cols;
          });
        }
      }
      return;
    }

    if (msg.type === 'row-ratio-update') {
      var rowEl = document.querySelector('#asset-grid .asset-row[data-row="' + msg.rowIndex + '"]');
      if (rowEl) rowEl.style.gridTemplateColumns = msg.ratio + 'fr ' + (100 - msg.ratio) + 'fr';
      return;
    }
  });

  // ── INIT ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    app = document.getElementById('app');

    if (!IS_PREVIEW) {
      initLightbox();
      window.addEventListener('hashchange', route);
    }

    fetch('js/config.json?v=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (config) {
        CONFIG = config;
        applyDesignerStyles();
        renderPageInfo();
        route();
      })
      .catch(function () {
        app.innerHTML = '<p style="padding:4rem 2rem;color:#888">Could not load portfolio config.</p>';
      });
  });

}());
