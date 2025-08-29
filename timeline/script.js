// Movie Timeline Demo
// - Dark background
// - Subtle canvas timeline
// - Three dummy covers placed at dates in 2025
// - No visible scrollbar; autoscroll when mouse is near left/right edges

(function () {
  const viewport = document.getElementById('viewport');
  const scroll = document.getElementById('scroll');
  const canvas = document.getElementById('timelineCanvas');
  const content = document.getElementById('content');

  // Data (fetched)
  let events = [];
  let modalOpen = false;

  // Range / scale
  let startDate = null;
  let endDate = null;
  let totalDays = 1;
  const dayMs = 24 * 60 * 60 * 1000;

  // Layout tuning
  let pxPerDay = 12; // horizontal scale (zoomable)
  const MIN_PX_PER_DAY = 1.2;
  const MAX_PX_PER_DAY = 160;
  const basePadding = 200; // base padding inside content
  let padLeft = basePadding;
  let padRight = basePadding;
  let baselineFrac = 0.52; // fraction of height for timeline baseline (moved up from 0.62)
  // Zoom thresholds for ticks/labels
  const ZOOM_DAILY_TICKS = 18; // show small day ticks
  const ZOOM_TEN_TICKS = 24;  // emphasize days divisible by 10
  const ZOOM_DAY_NUM_FIRST = 20; // show day numbers for 1st
  const ZOOM_DAY_NUM_TEN = 28;   // show 10/20/30
  const ZOOM_DAY_NUM_ALL = 40;   // show every day number

  // Autoscroll tuning
  const edgeZone = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--edge-zone')) || 140;
  // px per second at the extreme edge (tweak to taste)
  const maxSpeed = 1200;

  // State
  let rafId = 0;
  let hoverX = -1;
  let lastTs = 0;
  let started = false;
  let dirty = true;
  let lastScrollLeft = -1;
  let lastVW = 0;
  let lastVH = 0;
  let hoveredDayIdx = -1; // disabled for number-hover; kept for future use

  // Compute content width; canvas is viewport-sized and redrawn per frame as needed
  function sizeContent() {
    if (!startDate || !endDate) return;
    const width = padLeft + totalDays * pxPerDay + padRight;
    const height = viewport.clientHeight;

    scroll.style.width = viewport.clientWidth + 'px';
    scroll.style.height = height + 'px';
    content.style.width = width + 'px';
    content.style.height = height + 'px';

    dirty = true;
    placeCovers(width, height);
  }

  function dateToX(date) {
    const days = (date - startDate) / dayMs;
    return Math.round(padLeft + days * pxPerDay);
  }

  function drawTimeline(dpr, width, height) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Colors
    const line = getCss('--timeline', '#334455');
    const lineDim = getCss('--timeline-dim', '#2a3947');
    const lineHi = getCss('--timeline-highlight', '#8fbaff');
    const textDim = getCss('--text-dim', '#9aa4ad');

    // Baseline (subtle)
    const cy = Math.round(height * baselineFrac);
    ctx.strokeStyle = lineDim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
    ctx.stroke();

    // Month ticks and labels (compact top padding, larger font)
    const labelY = 10; // small, consistent padding from top
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.fillStyle = textDim;
    ctx.strokeStyle = line;
    ctx.lineWidth = 3; // thicker for first-day (month) tick

    const visLeft = scroll.scrollLeft;
    const visRight = visLeft + width;
    const monthIter = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
    const endPlus = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, 1));
    while (monthIter <= endPlus) {
      const xContent = dateToX(monthIter);
      const x = xContent - visLeft;
      if (x >= -80 && x <= width + 80) {
        ctx.beginPath();
        ctx.moveTo(x, cy - 12);
        ctx.lineTo(x, cy + 12);
        ctx.stroke();
        // Use UTC to avoid month slippage across timezones (e.g., Aug 1 UTC showing as Jul 31 local)
        const label = monthIter.toLocaleString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
        ctx.fillText(label, x, labelY);
      }
      monthIter.setUTCMonth(monthIter.getUTCMonth() + 1);
    }

    // Precompute lane directions by date for label placement
    const datesAbove = new Set(); // covers above baseline on this date
    const datesBelow = new Set(); // covers below baseline on this date
    const hoverDates = new Set();
    const hoverDayDates = [];
    const watchDays = new Set();
    for (const ev of events) {
      const key = ev.date.toISOString().slice(0,10);
      watchDays.add(key);
      if (ev._laneSign === -1) datesAbove.add(key);
      if (ev._laneSign === 1) datesBelow.add(key);
      if (ev._hover) { hoverDates.add(key); hoverDayDates.push(new Date(ev.date.getTime())); }
    }

    // Day ticks and numbers when sufficiently zoomed (visible range only)
    if (pxPerDay >= ZOOM_DAILY_TICKS) {
      const firstDayIdx = Math.max(0, Math.floor((visLeft - padLeft) / pxPerDay) - 2);
      const lastDayIdx = Math.min(totalDays, Math.ceil((visRight - padLeft) / pxPerDay) + 2);
      for (let di = firstDayIdx; di <= lastDayIdx; di++) {
        const dayDate = new Date(startDate.getTime() + di * dayMs);
        const d = dayDate.getUTCDate();
        const x = Math.round(padLeft + di * pxPerDay - visLeft) + 0.5; // crisp

        // Tick sizing
        let len = 6, lw = 1, col = lineDim;
        if (d % 10 === 0 && pxPerDay >= ZOOM_TEN_TICKS) { len = 10; lw = 2; col = line; }
        // First days are already drawn above with thicker tick; keep small tick to minimal
        if (d !== 1) {
          ctx.strokeStyle = col;
          ctx.lineWidth = lw;
          ctx.beginPath();
          // still draw varying tick lengths for emphasis
          ctx.moveTo(x, cy - len);
          ctx.lineTo(x, cy + len);
          ctx.stroke();
        }

        // Day numbers with progressive visibility but only on watch days; poster-hover always shows
        let showNum = false;
        const key = dayDate.toISOString().slice(0,10);
        const isWatch = watchDays.has(key);
        const hovered = hoverDates.has(key); // only poster-hover causes highlight/show
        if (hovered) showNum = true; // show regardless of zoom when hovering poster
        else if (isWatch && (pxPerDay >= ZOOM_DAY_NUM_FIRST)) showNum = true; // show watch-day numbers when reasonably zoomed
        if (hovered) showNum = true;
        if (showNum) {
          // Place above by default; if any cover above on this date, place below
          const placeBelow = datesAbove.has(key) && !datesBelow.has(key) ? true : false;
          // Use a vertical offset based on dot radius to avoid overlap
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          // smaller font for day numbers for clarity
          const dayFontSize = 12;
          ctx.font = `${dayFontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
          ctx.fillStyle = hovered ? lineHi : textDim;
          if (hovered) { ctx.shadowColor = 'rgba(140,180,255,0.7)'; ctx.shadowBlur = 10; }
          const dotRadius = hovered ? 7 : 5;
          const margin = 6;
          const y = placeBelow ? (cy + dotRadius + margin) : (cy - dotRadius - margin - dayFontSize);
          ctx.fillText(String(d), x, y);
          ctx.restore();
        }
      }
    }

    // Ensure hovered day numbers are drawn even when zoomed out beyond daily thresholds
    if (hoverDayDates.length > 0 && pxPerDay < ZOOM_DAILY_TICKS) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const dayDate of hoverDayDates) {
        const key = dayDate.toISOString().slice(0,10);
        const di = Math.round((dayDate - startDate) / dayMs);
        const x = Math.round(padLeft + di * pxPerDay - visLeft) + 0.5;
        // clamp draw in view
        if (x < -50 || x > width + 50) continue;
        const placeBelow = datesAbove.has(key) && !datesBelow.has(key) ? true : false;
        ctx.fillStyle = lineHi;
        ctx.shadowColor = 'rgba(140,180,255,0.7)'; ctx.shadowBlur = 10;
        const dayFontSize = 12;
        ctx.font = `${dayFontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
        const dnum = dayDate.getUTCDate();
        const dotRadius = 7; // hovered appearance
        const margin = 6;
        const y = placeBelow ? (cy + dotRadius + margin) : (cy - dotRadius - margin - dayFontSize);
        ctx.fillText(String(dnum), x, y);
      }
      ctx.restore();
    }

    // Soft glow under timeline for depth
    const grad = ctx.createLinearGradient(0, cy - 30, 0, cy + 60);
    grad.addColorStop(0, 'rgba(51,68,85,0)');
    grad.addColorStop(0.6, 'rgba(51,68,85,0.15)');
    grad.addColorStop(1, 'rgba(51,68,85,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, cy - 30, width, 90);

    // Connector lines from cover edge to baseline (visible events only)
    for (const ev of events) {
      const x = dateToX(ev.date) - visLeft;
      if (x < -10 || x > width + 10) continue;
      if (typeof ev._edgeY === 'number') {
        const hovered = !!ev._hover;
        ctx.strokeStyle = hovered ? lineHi : lineDim;
        ctx.lineWidth = hovered ? 4 : 2;
        if (hovered) {
          ctx.shadowColor = 'rgba(140,180,255,0.7)';
          ctx.shadowBlur = 10;
        }
        ctx.beginPath();
        ctx.moveTo(x, cy);
        ctx.lineTo(x, ev._edgeY);
        ctx.stroke();
        if (hovered) {
          ctx.shadowBlur = 0;
          ctx.shadowColor = 'transparent';
        }
      }
    }

    // Anchor dots for movie positions (only visible)
    for (const ev of events) {
      const x = dateToX(ev.date) - visLeft;
      if (x < -10 || x > width + 10) continue;
      const hovered = !!ev._hover;
      const r = hovered ? 7 : 5;
      if (hovered) {
        ctx.shadowColor = 'rgba(140,180,255,0.7)';
        ctx.shadowBlur = 10;
      }
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = hovered ? getCss('--timeline-highlight', '#8fbaff') : line;
      ctx.fill();
      if (hovered) {
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }
    }
  }

  function placeCovers(width, height) {
    // Build or update covers without recreating DOM every time
    const cy = Math.round(height * baselineFrac);
    const laneOffset = Math.min(Math.round(height * 0.25), 220); // distance from baseline

    const needed = new Set();
    events.forEach((ev, idx) => {
      const id = 'cover-' + ev.id;
      needed.add(id);
      let cover = document.getElementById(id);
      if (!cover) {
        cover = document.createElement('div');
        cover.id = id;
        cover.className = 'cover';
        cover.addEventListener('mouseenter', () => { cover.classList.add('hover'); ev._hover = true; dirty = true; });
        cover.addEventListener('mouseleave', () => { cover.classList.remove('hover'); ev._hover = false; dirty = true; });
        cover.addEventListener('click', (e) => { e.stopPropagation(); openDetail(ev); });
        if (ev.cover_url) {
          const img = document.createElement('img');
          img.src = ev.cover_url;
          img.alt = `${ev.title} cover`;
          img.decoding = 'async';
          img.loading = 'lazy';
          cover.appendChild(img);
        }
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = `${ev.title}${ev.year ? ' (' + ev.year + ')' : ''}`;
        cover.appendChild(label);
        content.appendChild(cover);
      }
      cover.style.left = `${dateToX(ev.date)}px`;
      const laneSign = (idx % 2 === 0) ? -1 : 1; // alternate above/below
      const centerY = cy + laneSign * laneOffset;
      cover.style.top = `${centerY}px`;
      // scale based on zoom level
      cover.style.setProperty('--cover-scale', String(computeCoverScale(pxPerDay)));
      // Measure cover size to compute connector edge Y
      const rect = cover.getBoundingClientRect();
      const h = rect.height || cover.offsetHeight || 0;
      const edgeY = centerY - laneSign * (h / 2);
      ev._edgeY = edgeY;
      ev._centerY = centerY;
      ev._laneSign = laneSign;
    });

    // Remove covers no longer needed
    content.querySelectorAll('.cover').forEach((el) => {
      if (!needed.has(el.id)) el.remove();
    });

    // Schedule a re-measure on next frame to ensure transforms have been applied
    scheduleEdgeRecalc();
  }

  function computeCoverScale(px) {
    // Map pxPerDay to a smooth scale between 0.75 and ~1.08 (slightly above legacy size)
    const minS = 0.75, maxS = 1.20;
    const a = 8, b = 42; // px/day range where scaling ramps
    const t = Math.max(0, Math.min(1, (px - a) / (b - a)));
    // ease
    const eased = t * t * (3 - 2 * t);
    return minS + (maxS - minS) * eased;
  }

  let edgeRaf = 0;
  function scheduleEdgeRecalc() {
    if (edgeRaf) cancelAnimationFrame(edgeRaf);
    edgeRaf = requestAnimationFrame(recomputeCoverEdges);
  }
  function recomputeCoverEdges() {
    edgeRaf = 0;
    const height = viewport.clientHeight;
    const cy = Math.round(height * baselineFrac);
    const laneOffset = Math.min(Math.round(height * 0.25), 220);
    events.forEach((ev, idx) => {
      const cover = document.getElementById('cover-' + ev.id);
      if (!cover) return;
      const laneSign = ev._laneSign ?? ((idx % 2 === 0) ? -1 : 1);
      const centerY = cy + laneSign * laneOffset;
      const rect = cover.getBoundingClientRect();
      const h = rect.height || cover.offsetHeight || 0;
      ev._centerY = centerY;
      ev._edgeY = centerY - laneSign * (h / 2);
    });
    dirty = true;
  }

  function getCss(varName, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(varName);
    return (v && v.trim()) || fallback;
  }

  // Autoscroll + redraw loop
  function loop(ts) {
    rafId = requestAnimationFrame(loop);
    if (lastTs === 0) lastTs = ts;
    const dt = Math.max(0, (ts - lastTs) / 1000);
    lastTs = ts;

    const vw = viewport.clientWidth;
    const insideLeft = hoverX >= 0 && hoverX < edgeZone;
    const insideRight = hoverX >= 0 && hoverX > (vw - edgeZone);
    let speed = 0;

    if (!modalOpen && insideLeft) {
      const t = 1 - hoverX / edgeZone; // 0..1
      speed = -maxSpeed * easeOutCubic(t);
    } else if (!modalOpen && insideRight) {
      const dist = vw - hoverX;
      const t = 1 - dist / edgeZone; // 0..1
      speed = maxSpeed * easeOutCubic(t);
    } else {
      speed = 0;
    }

    if (speed !== 0) {
      const next = clamp(scroll.scrollLeft + speed * dt, 0, scroll.scrollWidth - viewport.clientWidth);
      if (next !== scroll.scrollLeft) {
        scroll.scrollLeft = next;
        dirty = true;
      }
    }

    // Redraw visible slice if anything changed
    const vh = viewport.clientHeight;
    if (dirty || lastScrollLeft !== scroll.scrollLeft || lastVW !== vw || lastVH !== vh) {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) {
        canvas.style.width = vw + 'px';
        canvas.style.height = vh + 'px';
        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
      }
      drawTimeline(dpr, vw, vh);
      lastScrollLeft = scroll.scrollLeft;
      lastVW = vw;
      lastVH = vh;
      dirty = false;
    }
  }

  function easeOutCubic(t) {
    const p = 1 - Math.max(0, Math.min(1, t));
    return 1 - p * p * p;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // Track mouse position relative to viewport for edge zones
  viewport.addEventListener('mousemove', (e) => {
    const rect = viewport.getBoundingClientRect();
    hoverX = e.clientX - rect.left;
    // Disable number-hover highlight; only poster hover lights up numbers
    hoveredDayIdx = -1;
  });
  viewport.addEventListener('mouseleave', () => { hoverX = -1; hoveredDayIdx = -1; });

  // Resize handling
  const ro = new ResizeObserver(() => { sizeContent(); });
  ro.observe(viewport);

  // Lock scrolling when modal is open
  scroll.addEventListener('scroll', () => {
    if (modalOpen) {
      // reset scroll to locked position
      scroll.scrollLeft = lockedScrollLeft;
    } else {
      dirty = true;
    }
  });

  const blockIfModal = (e) => { if (modalOpen) { e.preventDefault(); e.stopPropagation(); } };
  scroll.addEventListener('wheel', blockIfModal, { passive: false });
  scroll.addEventListener('touchmove', blockIfModal, { passive: false });

  function setRangeFromEvents() {
    if (!events || events.length === 0) return false;
    const minTime = Math.min(...events.map((e) => e.date.getTime()));
    const maxTime = Math.max(...events.map((e) => e.date.getTime()));
    const padDays = 10;
    startDate = new Date(minTime - padDays * dayMs);
    endDate = new Date(maxTime + padDays * dayMs);
    normalizeRange();
    return true;
  }

  function setDefaultRange() {
    const now = new Date();
    const y = now.getUTCFullYear();
    startDate = new Date(Date.UTC(y, 0, 1));
    endDate = new Date(Date.UTC(y, 11, 31));
    normalizeRange();
  }

  function normalizeRange() {
    startDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    endDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
    totalDays = Math.max(1, Math.round((endDate - startDate) / dayMs));
  }

  function startRender() {
    sizeContent();
    if (!started) {
      started = true;
      rafId = requestAnimationFrame(loop);
    }
  }

  function scrollToDate(date, align = 0.6) {
    if (!date || !startDate || !endDate) return;
    const px = dateToX(date);
    const target = Math.max(0, Math.min(scroll.scrollWidth - viewport.clientWidth, px - viewport.clientWidth * align));
    scroll.scrollLeft = target;
    dirty = true;
  }

  function showBanner(msg) {
    const el = document.createElement('div');
    el.className = 'banner';
    el.textContent = msg;
    viewport.appendChild(el);
  }

  // Fetch events from static content (for static hosting)
  fetch('content/movies.json')
    .then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then((items) => {
      events = (items || []).map((it) => ({
        id: it.id,
        title: it.title,
        year: it.year,
        date: new Date(it.watched_date + 'T00:00:00Z'),
        watched_date: it.watched_date,
        rating: it.rating,
        cover_url: it.cover_url || null,
        review_text: it.review_text || null,
        summary: it.review_summary || null,
        // RT fields removed
      }));
      if (!setRangeFromEvents()) {
        setDefaultRange();
      }
      startRender();
      // Default focus: latest movie
      try {
        const latest = events.reduce((a,b)=> (a && a.date > b.date) ? a : b, null);
        if (latest) setTimeout(() => scrollToDate(latest.date, 0.7), 0);
      } catch (_) {}
    })
    .catch((err) => {
      console.error('Failed to load static content:', err);
      showBanner('Could not load content/movies.json. If viewing via file://, run a static server.');
      setDefaultRange();
      startRender();
    });

  // Zoom with mouse wheel; recenter view to cursor's timeline point
  viewport.addEventListener('wheel', (e) => {
    // Only zoom; prevent page scroll
    e.preventDefault();
    if (!startDate || !endDate || modalOpen) return;

    const rect = viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left; // x within viewport

    // Compute date under cursor before zoom
    const daysUnderMouse = (scroll.scrollLeft + mx - padLeft) / pxPerDay;

    // Update zoom
    const factor = Math.exp(-e.deltaY * 0.0015); // wheel down -> zoom in
    const newPx = Math.max(MIN_PX_PER_DAY, Math.min(MAX_PX_PER_DAY, pxPerDay * factor));
    if (Math.abs(newPx - pxPerDay) < 0.01) return;
    pxPerDay = newPx;

    // Ensure enough side padding so the cursor anchor can be maintained
    const needLeft = Math.max(0, mx - padLeft);
    const needRight = Math.max(0, (viewport.clientWidth - mx) - padRight);
    if (needLeft > 0) padLeft += needLeft;
    if (needRight > 0) padRight += needRight;

    // Resize content and mark for redraw
    sizeContent();

    // Keep date under cursor stationary (anchored at mx)
    const targetX = padLeft + daysUnderMouse * pxPerDay;
    let newScrollLeft = targetX - mx;
    const maxScroll = Math.max(0, scroll.scrollWidth - viewport.clientWidth);
    newScrollLeft = Math.max(0, Math.min(maxScroll, newScrollLeft));
    scroll.scrollLeft = newScrollLeft;
    dirty = true;
  }, { passive: false });

  // Mark dirty on manual scroll to trigger redraw
  scroll.addEventListener('scroll', () => { if (!modalOpen) dirty = true; });

  // Cleanup on hot-reload (if any)
  window.addEventListener('beforeunload', () => cancelAnimationFrame(rafId));
  // Expose minimal debug hooks
  window.timelineDebug = {
    getPxPerDay: () => pxPerDay,
    setPxPerDay: (v) => { pxPerDay = Math.max(MIN_PX_PER_DAY, Math.min(MAX_PX_PER_DAY, v)); sizeContent(); dirty = true; },
    setEvents: (items) => {
      try {
        events = (items || []).map((it, i) => ({
          id: it.id ?? i + 1,
          title: it.title || 'Untitled',
          year: it.year || null,
          date: new Date((it.watched_date || it.date) + 'T00:00:00Z'),
          rating: it.rating || null,
          cover_url: it.cover_url || null,
          review_text: it.review_text || null,
        }));
        if (!setRangeFromEvents()) setDefaultRange();
        startRender();
        dirty = true;
      } catch (e) { console.error('setEvents failed', e); }
    },
    scrollToEnd: () => { scroll.scrollLeft = Math.max(0, scroll.scrollWidth - viewport.clientWidth); dirty = true; },
    dateAtViewportX: (x) => {
      if (!startDate) return null;
      const days = (scroll.scrollLeft + x - padLeft) / pxPerDay;
      const d = new Date(startDate.getTime() + Math.round(days) * dayMs);
      return d.toISOString().slice(0,10);
    },
    dateAtCenter: () => {
      if (!startDate) return null;
      const x = viewport.clientWidth / 2;
      const days = (scroll.scrollLeft + x - padLeft) / pxPerDay;
      const d = new Date(startDate.getTime() + Math.round(days) * dayMs);
      return d.toISOString().slice(0,10);
    },
    scrollToDateStr: (s) => { try { scrollToDate(new Date(s+'T00:00:00Z'), 0.5); } catch(_){} },
    getBaselineY: () => Math.round(viewport.clientHeight * baselineFrac),
    setBaseline: (f) => {
      const v = Math.max(0.40, Math.min(0.72, Number(f)));
      if (!Number.isFinite(v)) return;
      baselineFrac = v;
      // Reposition covers and redraw
      const width = padLeft + totalDays * pxPerDay + padRight;
      const height = viewport.clientHeight;
      placeCovers(width, height);
      dirty = true;
    },
    sampleCanvas: (xr, yr) => {
      try {
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        const x = Math.max(0, Math.min(vw - 1, Math.floor(vw * xr)));
        const y = Math.max(0, Math.min(vh - 1, Math.floor(vh * yr)));
        const ctx = canvas.getContext('2d');
        // sample a 3x3 around target
        const ix = Math.max(0, Math.floor(x * dpr) - 1);
        const iy = Math.max(0, Math.floor(y * dpr) - 1);
        const w = Math.min(canvas.width - ix, 3);
        const h = Math.min(canvas.height - iy, 3);
        const data = ctx.getImageData(ix, iy, w, h).data;
        // return max alpha and avg RGB
        let maxA = 0, sumR = 0, sumG = 0, sumB = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a > maxA) maxA = a;
          sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2]; n++;
        }
        return [Math.round(sumR / n), Math.round(sumG / n), Math.round(sumB / n), maxA];
      } catch (e) { return null; }
    },
  };

  // Details view
  const overlay = document.getElementById('detailOverlay');

  function openDetail(ev) {
    modalOpen = true;
    lockedScrollLeft = scroll.scrollLeft;
    viewport.classList.add('modal-open');
    overlay.innerHTML = '';
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('open');

    // Left: large cover
    const leftWrap = document.createElement('div');
    leftWrap.className = 'detail-left';
    const cover = document.createElement('div');
    cover.className = 'detail-cover';
    if (ev.cover_url) {
      const img = document.createElement('img');
      img.src = ev.cover_url;
      img.alt = `${ev.title} cover`;
      cover.appendChild(img);
    }
    leftWrap.appendChild(cover);
    overlay.appendChild(leftWrap);

    // Right: large typography content
    const right = document.createElement('div');
    right.className = 'detail-right';

    const title = document.createElement('div');
    title.className = 'detail-title text-scan';
    animateText(title, ev.title || '');
    right.appendChild(title);

    if (ev.year) {
      const meta = document.createElement('div');
      meta.className = 'detail-meta text-scan';
      animateText(meta, `Released ${ev.year}`);
      right.appendChild(meta);
    }

    // Watched date (local format)
    if (ev.date) {
      const metaW = document.createElement('div');
      metaW.className = 'detail-meta text-scan';
      const local = new Date(ev.date);
      const formatted = local.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      animateText(metaW, `Watched ${formatted}`);
      right.appendChild(metaW);
    }

    // Ratings row (user stars + RottenTomatoes)
    if (ev.rating) {
      const ratings = document.createElement('div');
      ratings.className = 'ratings';
      ratings.appendChild(renderStars(ev.rating));
      right.appendChild(ratings);
    }
    if (ev.summary) {
      const sec = document.createElement('div');
      sec.className = 'detail-section';
      const h = document.createElement('h4'); h.textContent = 'Synopsis';
      const b = document.createElement('div'); b.className = 'detail-body text-scan';
      animateText(b, ev.summary, { mode: 'word' });
      sec.appendChild(h); sec.appendChild(b); right.appendChild(sec);
    }
    if (ev.review_text) {
      const sec = document.createElement('div');
      sec.className = 'detail-section';
      const h = document.createElement('h4'); h.textContent = 'My Review';
      const b = document.createElement('div'); b.className = 'detail-body text-scan';
      animateText(b, ev.review_text, { mode: 'word' });
      sec.appendChild(h); sec.appendChild(b); right.appendChild(sec);
    }
    overlay.appendChild(right);

    // Close on any click inside overlay
    overlay.addEventListener('click', onAnyOverlayClick, { once: true });
    document.addEventListener('keydown', onEsc, { once: true });
  }

  function onAnyOverlayClick() { closeDetail(); }

  function onEsc(e) {
    if (e.key === 'Escape') closeDetail();
  }

  function closeDetail() {
    // remove possible pending click handler
    overlay.removeEventListener('click', onAnyOverlayClick);
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    viewport.classList.remove('modal-open');
    modalOpen = false;
    // Restore lock
    scroll.scrollLeft = lockedScrollLeft;
    dirty = true;
  }

  // Utility: animate text letter-by-letter with fade/slide
  function animateText(container, text, opts = {}) {
    const mode = opts.mode || 'char'; // 'char' | 'word'
    const step = opts.step ?? (mode === 'word' ? 0.03 : 0.008);
    const limit = opts.limit ?? 1500;
    const content = (text || '').toString();
    const clipped = content.slice(0, limit);
    const rest = content.slice(limit);
    const frag = document.createDocumentFragment();
    let i = 0;
    if (mode === 'word') {
      const parts = clipped.split(/(\s+)/); // keep whitespace tokens
      for (const token of parts) {
        if (!token) continue;
        if (/^\s+$/.test(token)) {
          frag.appendChild(document.createTextNode(token));
        } else {
          const span = document.createElement('span');
          span.className = 'word';
          span.textContent = token;
          span.style.animationDelay = `${Math.min(i * step, 1.0)}s`;
          frag.appendChild(span);
          i++;
        }
      }
    } else {
      for (; i < clipped.length; i++) {
        const ch = clipped[i];
        if (ch === ' ') { // preserve natural spacing and wrapping
          frag.appendChild(document.createTextNode(' '));
          continue;
        }
        const span = document.createElement('span');
        span.className = 'char';
        span.textContent = ch;
        span.style.animationDelay = `${Math.min(i * step, 0.8)}s`;
        frag.appendChild(span);
      }
    }
    container.innerHTML = '';
    container.appendChild(frag);
    if (rest) {
      const tail = document.createElement('span');
      tail.textContent = rest;
      container.appendChild(tail);
    }
  }

  // Render user's star rating (0-5, supports halves)
  function renderStars(rating) {
    const wrap = document.createElement('div');
    wrap.className = 'stars';
    const val = Number(rating) || 0;
    const full = Math.floor(val);
    const half = val - full >= 0.5 ? 1 : 0;
    const total = 5;
    for (let i = 0; i < total; i++) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.classList.add('star');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.6 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z');
      svg.appendChild(path);
      if (i < full) svg.classList.add('filled');
      else if (i === full && half) {
        // mask half star by clipPath
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
        clip.setAttribute('id', `half-${Math.random().toString(36).slice(2)}`);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', '0'); rect.setAttribute('y', '0'); rect.setAttribute('width', '12'); rect.setAttribute('height', '24');
        clip.appendChild(rect); defs.appendChild(clip); svg.appendChild(defs);
        path.setAttribute('clip-path', `url(#${clip.getAttribute('id')})`);
        svg.classList.add('filled');
      }
      wrap.appendChild(svg);
    }
    return wrap;
  }

  // Removed Rotten Tomatoes integration
})();
