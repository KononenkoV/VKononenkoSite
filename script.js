// Header shadow on scroll
const siteHeader = document.querySelector('.site-header');
if (siteHeader) {
  const toggleHeaderShadow = () => siteHeader.classList.toggle('is-scrolled', window.scrollY > 4);
  toggleHeaderShadow();
  window.addEventListener('scroll', toggleHeaderShadow, { passive: true });
}

// Hero parallax — three layers, three speeds. The heading travels furthest
// and blurs hardest, the lead follows at roughly half that rate, and the
// portrait drifts the opposite way, so the stack visibly separates instead
// of sliding as one block. Values go into CSS custom properties; the
// stylesheet composes the final transform (the portrait also carries a
// centring translateX on mobile that must survive).
const heroSection = document.querySelector('.hero');
const heroLayers = [
  { el: document.querySelector('.hero-title'), shift: -195, blur: 9.1 },
  { el: document.querySelector('.hero-lead'), shift: -62, blur: 3.5 },
  { el: document.querySelector('.hero-photo-wrap'), shift: 34, blur: 0 },
].filter((layer) => layer.el);

if (heroSection && heroLayers.length && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let queued = false;
  let settleTimer;
  let wasOffscreen = false;
  let lifted = false;
  // Cached, not read per frame: offsetHeight forces a synchronous layout, and
  // doing that inside the scroll rAF — between the style writes below — is a
  // read-write-read cycle on every single frame. On a mid-range phone that is
  // enough to make the drift visibly stutter.
  let heroHeight = heroSection.offsetHeight || 1;

  function measureHero() {
    heroHeight = heroSection.offsetHeight || 1;
    drawParallax();
  }

  function drawParallax() {
    queued = false;
    const progress = Math.min(Math.max(window.scrollY / heroHeight, 0), 1);

    // Once the hero is fully scrolled past there is nothing to look at, so
    // stop repainting blurred text and drop the filters entirely.
    const offscreen = progress >= 1;
    if (offscreen && wasOffscreen) return;
    wasOffscreen = offscreen;

    heroLayers.forEach(({ el, shift, blur }) => {
      el.style.setProperty('--parallax-y', (progress * shift).toFixed(1) + 'px');
      if (blur) {
        // Blur ramps in only after the first eighth of the scroll, so the
        // hero stays crisp while it is still the thing being read.
        const ramp = Math.max(0, (progress - 0.12) / 0.88);
        el.style.setProperty('--parallax-blur', (ramp * blur).toFixed(2) + 'px');
      }
    });
  }

  // will-change is only worth its GPU memory while the scroll is active, but
  // it must be written only when the state actually flips. Assigning it on
  // every scroll event re-promotes the layers over and over, and each
  // promote/demote is a repaint the eye catches as a hitch.
  function lift(on) {
    if (on === lifted) return;
    lifted = on;
    heroLayers.forEach(({ el }) => {
      el.style.willChange = on ? 'transform, filter' : '';
    });
  }

  function onHeroScroll() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(drawParallax);
    }
    lift(true);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => lift(false), 180);
  }

  drawParallax();
  window.addEventListener('scroll', onHeroScroll, { passive: true });
  window.addEventListener('resize', measureHero);
}

// Mobile nav — full-screen overlay
const burger = document.getElementById('burger');
const nav = document.getElementById('nav');

if (burger && nav) {
  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    burger.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    // The overlay covers the page, so the page behind it must not scroll.
    document.body.classList.toggle('menu-open', open);
    if (open) {
      nav.querySelector('a')?.focus();
    }
  }

  burger.addEventListener('click', () => {
    setMenu(!nav.classList.contains('is-open'));
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setMenu(false));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      setMenu(false);
      burger.focus();
    }
  });

  // Rotating to landscape (or resizing past the breakpoint) hides the burger;
  // without this the body would stay scroll-locked with no way to unlock it.
  matchMedia('(max-width: 720px)').addEventListener('change', (e) => {
    if (!e.matches) setMenu(false);
  });
}

// Scroll reveal — plain rect check on scroll/resize so fast or
// programmatic jumps (anchor nav, "scroll to") can't skip elements
// the way an IntersectionObserver can when it never sees an
// intermediate frame with the element inside the viewport.
const revealEls = Array.from(document.querySelectorAll('.reveal'));

function checkReveal() {
  const vh = window.innerHeight;
  revealEls.forEach((el) => {
    if (el.classList.contains('is-visible')) return;
    if (el.getBoundingClientRect().top < vh * 0.94) {
      el.classList.add('is-visible');
    }
  });
}

if (revealEls.length) {
  checkReveal();
  window.addEventListener('scroll', checkReveal, { passive: true });
  window.addEventListener('resize', checkReveal);
}

// Advantages — all five numerals share one height, set to 130% of the tallest
// card's text block, and each is centred on its own copy. The copy starts just
// past the numeral's ink, so the gap is what the eye reads, not the glyph box:
// a "1" is far narrower than a "4", and padding off the box would leave the
// narrow ones stranded. The fit is circular — a wider numeral indents the copy,
// which makes it taller, which grows the numeral — hence the passes.
const advantageCards = Array.from(document.querySelectorAll('.advantage-card'));

if (advantageCards.length) {
  const INK_OVERSHOOT = 1.3;   // numeral ink height ÷ tallest copy block
  const INK_GAP = 14;          // px between the numeral's ink and the copy
  const MAX_INK_SHARE = 0.38;  // widest the numeral may get, as a share of the card
  const PROBE_PX = 100;

  const probe = document.createElement('canvas').getContext('2d');
  let metrics = null;

  // Font-relative geometry of a digit, taken once. The CSS box of the numeral
  // is not the glyph: it carries half-leading above and the font's descent
  // below, and both the centring and the gap need the ink, not the box.
  function readMetrics() {
    probe.font = `700 ${PROBE_PX}px "Oswald", sans-serif`;
    const m = probe.measureText('8');
    if (!m.actualBoundingBoxAscent) return null;
    const halfLeading = (PROBE_PX - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2;
    const baseline = halfLeading + m.fontBoundingBoxAscent;
    const inkTop = baseline - m.actualBoundingBoxAscent;
    const inkBottom = baseline + m.actualBoundingBoxDescent;
    return {
      inkHeight: (inkBottom - inkTop) / PROBE_PX,
      inkCentre: ((inkTop + inkBottom) / 2) / PROBE_PX,
      // Right edge of each glyph's ink, per em — "1" ends much sooner than "4".
      inkRight: (digit) => probe.measureText(digit).actualBoundingBoxRight / PROBE_PX,
    };
  }

  function layoutAdvantages() {
    metrics = metrics || readMetrics();
    if (!metrics) return; // no usable metrics — the CSS fallback stands

    const parts = advantageCards.map((card) => ({
      card,
      body: card.querySelector('.advantage-body'),
      digit: (card.querySelector('.advantage-num') || {}).textContent || '8',
    })).filter((part) => part.body);
    if (!parts.length) return;

    const inset = (size, digit) => size * metrics.inkRight(digit) + INK_GAP;

    // Try a numeral size and report the size the 130% rule would then demand.
    // The two disagree because the numeral and the copy share one line of
    // width: a bigger glyph leaves less room, the copy wraps taller, and the
    // rule asks for a bigger glyph again.
    function demandAt(size) {
      parts.forEach((part) => {
        part.card.style.setProperty('--num-inset', inset(size, part.digit).toFixed(1) + 'px');
      });
      const heights = parts.map((part) => part.body.getBoundingClientRect().height);
      return {
        heights,
        demand: (Math.max.apply(null, heights) * INK_OVERSHOOT) / metrics.inkHeight,
      };
    }

    // Ceiling: past roughly a third of the card the copy is squeezed into a
    // ribbon, so the numeral stops growing even if the rule still asks for more.
    const cardW = parts[0].card.getBoundingClientRect().width;
    const widest = Math.max.apply(null, parts.map((part) => metrics.inkRight(part.digit)));
    const hi = Math.max(80, (cardW * MAX_INK_SHARE - INK_GAP) / widest);

    // Bisect for the size that asks for itself. demand() falls below the
    // candidate exactly once across the range, so halving converges fast.
    let size = hi;
    let probeAt = demandAt(hi);
    if (probeAt.demand < hi) {
      let lo = 60;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + size) / 2;
        if (demandAt(mid).demand > mid) lo = mid; else size = mid;
      }
      probeAt = demandAt(size);
    }

    const inkH = size * metrics.inkHeight;
    parts.forEach((part, i) => {
      const copyH = probeAt.heights[i];
      // Shorter cards need more padding to swallow the numeral than the
      // tallest one does, so the overhang stays per-card.
      const overhang = Math.max(0, (inkH - copyH) / 2);
      part.card.style.setProperty('--num-size', size.toFixed(1) + 'px');
      part.card.style.setProperty('--num-overhang', overhang.toFixed(1) + 'px');
      // Centre the ink — not the line box — on the middle of the copy.
      part.card.style.setProperty('--num-top', (overhang + copyH / 2 - size * metrics.inkCentre).toFixed(1) + 'px');
    });
  }

  layoutAdvantages();
  // Metrics are wrong until Oswald itself has loaded, so redo the pass then.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { metrics = null; layoutAdvantages(); });
  }

  let advResizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(advResizeTimer);
    advResizeTimer = setTimeout(layoutAdvantages, 120);
  });
}

// ===== Section motion: staggered entrance + per-element exit parallax =====
// Shared by Advantages and About. Entrance is one flag on the section; the
// exit drift is timed off each element's own position rather than the
// section's, because the elements at the top reach the upper edge long before
// the block as a whole does.
const calmMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const EXIT_START = 0.23; // drift begins once an element's top is this far down the viewport
const EXIT_RANGE = 0.5;  // …and completes as it clears the top edge

// Replays: the flag is dropped once the section is fully out of sight in
// either direction, so coming back plays the sequence again instead of
// showing everything already in place.
function watchSectionEntrance(section, threshold) {
  function check() {
    const rect = section.getBoundingClientRect();
    const vh = window.innerHeight;
    if (rect.bottom <= 0 || rect.top >= vh) {
      section.classList.remove('is-in');
    } else if (rect.top < vh * threshold) {
      section.classList.add('is-in');
    }
  }
  check();
  window.addEventListener('scroll', check, { passive: true });
  window.addEventListener('resize', check);
}

// Per-element entrance, for blocks that are taller than the viewport: one
// trigger on the section would play the last items' arrival while they are
// still far below the fold, and by the time the reader gets there they are
// simply present. Items crossing the line together are collected into one
// batch and dealt out in order, so the cascade survives being split across
// several scroll positions.
function watchItemsEntrance(items, threshold, step) {
  let batch = [];
  let pending = 0;

  function check() {
    const vh = window.innerHeight;

    items.forEach((el) => {
      const rect = el.getBoundingClientRect();
      // Reset only on the way out of the TOP, never off the bottom. An
      // accordion opening above pushes everything below it off-screen, and
      // treating that as "left the viewport" blanks tiles the reader is
      // about to scroll back to.
      if (rect.bottom <= 0) {
        el.classList.remove('is-in');
        return;
      }
      if (rect.top < vh * threshold && !el.classList.contains('is-in') && !batch.includes(el)) {
        batch.push(el);
      }
    });

    // Flushed on the next frame, and only if one is not already booked. The
    // first version cancelled and re-booked the flush on every scroll event,
    // which on a desk is harmless and on a phone is the whole bug: momentum
    // scrolling fires the event continuously, so the flush was pushed back for
    // as long as the finger's throw lasted and the block arrived already
    // opaque, with its fade spent off-screen. A frame is also the right unit
    // for the grouping — everything that crossed the line in the same frame
    // belongs to the same cascade.
    if (!batch.length || pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      batch.forEach((el, i) => {
        el.style.setProperty('--enter-delay', i * step + 'ms');
        el.classList.add('is-in');
      });
      batch = [];
    });
  }

  check();
  window.addEventListener('scroll', check, { passive: true });
  window.addEventListener('resize', check);
  // Handed back for layout changes that move items into view without any
  // scrolling — collapsing a panel above them, for instance.
  return check;
}

// `drift` and `defocus` are read per call, so a caller can swap the arrays on
// a breakpoint. Returns a refresh handle for callers whose element positions
// move after load.
function watchExitParallax(elements, getDrift, getDefocus) {
  let queued = false;
  let settle;
  let baseTops = [];

  // Measured with the drift zeroed, otherwise each frame's own transform
  // would feed back into the next frame's position.
  function measure() {
    elements.forEach((el) => el.style.setProperty('--parallax-y', '0px'));
    baseTops = elements.map((el) => el.getBoundingClientRect().top + window.scrollY);
  }

  function draw() {
    queued = false;
    const vh = window.innerHeight;
    const scrolled = window.scrollY;
    const drift = getDrift();
    const defocus = getDefocus();

    elements.forEach((el, i) => {
      const viewportTop = baseTops[i] - scrolled;
      const progress = Math.min(Math.max((vh * EXIT_START - viewportTop) / (vh * EXIT_RANGE), 0), 1);
      el.style.setProperty('--parallax-y', (progress * drift[i % drift.length]).toFixed(1) + 'px');
      el.style.setProperty('--parallax-blur', (progress * defocus[i % defocus.length]).toFixed(2) + 'px');
    });
  }

  function onScroll() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(draw);
    }
    // will-change is only worth its GPU memory while the scroll is active.
    elements.forEach((el) => { el.style.willChange = 'transform, filter'; });
    clearTimeout(settle);
    settle = setTimeout(() => {
      elements.forEach((el) => { el.style.willChange = ''; });
    }, 180);
  }

  function refresh() {
    measure();
    draw();
  }

  refresh();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', refresh);
  return refresh;
}

// ---- Advantages ----
const advSection = document.querySelector('.advantages');

if (advSection) {
  watchSectionEntrance(advSection, 0.82);

  const cards = Array.from(advSection.querySelectorAll('.advantage-card'));

  if (cards.length && !calmMotion) {
    const DRIFT = [-230, -190, -260, -150, -120];
    // Same travel window, longer distance — cards 1, 3 and 4 simply move
    // faster. Only the three-column desktop grid uses these; the narrower
    // layouts stack the cards differently, so the positions they refer to
    // no longer exist there.
    const DRIFT_WIDE = [-264.5, -190, -312, -172.5, -120];
    const DEFOCUS = [6.2, 5, 7, 4, 3.2];
    const wideGrid = matchMedia('(min-width: 901px)');

    const refreshAdvantages = watchExitParallax(
      cards,
      () => (wideGrid.matches ? DRIFT_WIDE : DRIFT),
      () => DEFOCUS,
    );

    // The numerals are sized from font metrics, so the cards change height once
    // Oswald lands — the cached tops have to be taken again after that.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(refreshAdvantages);
    }
  }
}

// ---- About ----
const aboutSection = document.querySelector('.about');

if (aboutSection) {
  watchSectionEntrance(aboutSection, 0.86);

  const items = Array.from(aboutSection.querySelectorAll('.motion-item'));
  // The entrance order is the reading order, so the delay comes from the
  // element's index rather than a stack of nth-child rules that would need
  // rewriting every time a paragraph is added.
  items.forEach((el, i) => el.style.setProperty('--enter-delay', i * 110 + 'ms'));

  if (items.length && !calmMotion) {
    // Uneven on purpose: a single rate would read as the whole column sliding.
    const DRIFT = [-210, -170, -135, -180, -145, -165, -120, -100, -85];
    const DEFOCUS = [5.4, 4.4, 3.5, 4.6, 3.8, 4.2, 3.1, 2.6, 2.2];
    watchExitParallax(items, () => DRIFT, () => DEFOCUS);
  }
}

// ---- Experience ----
// Entrance only, no exit drift. The parallax works from cached positions, and
// this block is the one whose positions move on their own: every tile below
// an accordion panel shifts as it opens or closes. Re-measuring around that
// was never reliable enough, and the effect is not worth the cost here.
const expSection = document.querySelector('.experience');
let checkExperienceEntrance = null;

if (expSection) {
  checkExperienceEntrance = watchItemsEntrance(
    Array.from(expSection.querySelectorAll('.motion-item')), 0.9, 90,
  );
}

// ---- Projects ----
// Entrance only — no exit drift and no defocus here. The screenshots decide
// the block's height, so positions are not known until the images have
// loaded — the watcher runs off live rects on every scroll, and `load` covers
// the case where an image finishes after the reader has scrolled past its slot.
//
// The step is much longer than in Experience because this block has only two
// items: the heading and the carousel. Experience deals its 90ms out over a
// column of tiles, where the cascade is what reads; two items 80ms apart
// inside a 560ms fade simply arrive together. 220ms lets the heading land
// first and the card follow it.
const projSection = document.querySelector('.portfolio-section');

if (projSection) {
  const checkProjects = watchItemsEntrance(
    Array.from(projSection.querySelectorAll('.motion-item')), 0.9, 220,
  );
  projSection.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', checkProjects, { once: true });
  });
}

// ---- Skills ----
// The same two-beat entrance as Projects — heading, then the cloud — and the
// same long step, because there are only the two of them. Entrance only: no
// exit drift and no defocus.
// Every block of this kind on the page, not the first one: the markup is
// duplicated below the original, and each copy has to run its own entrance.
document.querySelectorAll('.skills').forEach((skillsSection) => {
  watchItemsEntrance(Array.from(skillsSection.querySelectorAll('.motion-item')), 0.9, 220);
});

// Projects carousel — one case per screen. Position comes from the track's
// own scrollLeft rather than a stored index, so a swipe, a scrollbar drag and
// the arrow buttons all report the same slide and cannot drift apart.
const caseTrack = document.querySelector('[data-case-track]');

if (caseTrack) {
  const slides = Array.from(caseTrack.querySelectorAll('.case'));
  const prevBtn = document.querySelector('[data-case-prev]');
  const nextBtn = document.querySelector('[data-case-next]');
  // Not a visible counter any more — a live region, so a screen reader is
  // told which project it landed on when the arrows move the track.
  const current = document.querySelector('[data-case-current]');
  const steps = Array.from(document.querySelectorAll('[data-case-step]'));

  // Slide pitch, not slide width: the gap is part of the distance travelled,
  // and reading it back from the DOM keeps the step right when the breakpoint
  // changes the gap.
  function pitch() {
    if (slides.length < 2) return caseTrack.clientWidth;
    return slides[1].offsetLeft - slides[0].offsetLeft;
  }

  function index() {
    return Math.round(caseTrack.scrollLeft / pitch());
  }

  // The track is a fixed-height box so the section below it never moves; the
  // height it is fixed to is the one the visible slide actually needs.
  // The track is border-box and carries vertical padding for the cards'
  // shadow, so that padding has to be added back or every slide is clipped
  // by exactly the padding — and it is not the same at every breakpoint.
  function fit(i) {
    const cs = getComputedStyle(caseTrack);
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    caseTrack.style.height = slides[i].offsetHeight + pad + 'px';
  }

  function sync() {
    const i = Math.min(Math.max(index(), 0), slides.length - 1);
    fit(i);
    if (current) current.textContent = String(i + 1);
    steps.forEach((s, si) => {
      if (si === i) s.setAttribute('aria-current', 'true');
      else s.removeAttribute('aria-current');
    });
    // A 1px tolerance: sub-pixel scroll positions would otherwise leave the
    // last slide's button enabled with nowhere left to go.
    const max = caseTrack.scrollWidth - caseTrack.clientWidth;
    if (prevBtn) prevBtn.disabled = caseTrack.scrollLeft <= 1;
    if (nextBtn) nextBtn.disabled = caseTrack.scrollLeft >= max - 1;
  }

  // Grow before the slide arrives — waiting for the scroll handler would
  // clip the incoming card's last lines for the length of the animation.
  function go(step) {
    goTo(index() + step);
  }

  function goTo(target) {
    const i = Math.min(Math.max(target, 0), slides.length - 1);
    fit(i);
    caseTrack.scrollTo({ left: i * pitch(), behavior: calmMotion ? 'auto' : 'smooth' });
  }

  if (prevBtn) prevBtn.addEventListener('click', () => go(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => go(1));
  steps.forEach((s) => {
    s.addEventListener('click', () => goTo(Number(s.dataset.caseStep)));
  });

  caseTrack.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });

  let ticking = false;
  caseTrack.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; sync(); });
  }, { passive: true });

  window.addEventListener('resize', sync);
  // Slide heights are not final until the screenshots have their real size.
  caseTrack.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', sync, { once: true });
  });
  sync();
}

// Experience accordion — one role open at a time, so the block stays a
// scannable list of companies instead of a wall of every job at once.
// The panel height is handled entirely in CSS (grid-template-rows 0fr->1fr);
// this only flips the class and keeps aria-expanded honest.
const timeline = document.querySelector('.timeline');

if (timeline) {
  const jobs = Array.from(timeline.querySelectorAll('.job'));

  timeline.addEventListener('click', (e) => {
    const btn = e.target.closest('.job-summary');
    if (!btn) return;
    const target = btn.closest('.job');
    // A second click on the open row closes it and leaves nothing open.
    const opening = !target.classList.contains('is-open');

    // Opening a role below the open one pulls the whole list upwards as the
    // one above collapses, and the tile you just clicked slides off the top
    // of the screen. Measure how much is about to disappear ABOVE the target
    // before the classes change — after the toggle the panel is already
    // animating and its height no longer reflects what was there.
    // Both readings have to happen BEFORE the classes change. After the
    // toggle the answer depends on whether the collapse is still animating:
    // with motion on the old height is still in the layout, with reduced
    // motion it is already gone — and subtracting it then counts it twice.
    const openIndex = jobs.findIndex((job) => job.classList.contains('is-open'));
    const targetIndex = jobs.indexOf(target);
    const collapsingAbove = opening && openIndex > -1 && openIndex < targetIndex
      ? jobs[openIndex].querySelector('.job-panel').getBoundingClientRect().height
      : 0;
    const targetTop = target.getBoundingClientRect().top + window.scrollY;

    jobs.forEach((job) => {
      const open = job === target && opening;
      job.classList.toggle('is-open', open);
      job.querySelector('.job-summary').setAttribute('aria-expanded', String(open));
    });

    // Collapsing a panel lifts everything under it back into view without a
    // scroll event, so the entrance watcher has to be told to look again —
    // once now and once after the panel has finished moving.
    if (checkExperienceEntrance) {
      checkExperienceEntrance();
      setTimeout(checkExperienceEntrance, 470);
    }

    if (!opening) return;
    // Land the opened tile's header just under the sticky bar — the same
    // offset anchor jumps use, so both kinds of navigation stop in the same
    // place.
    const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 76;
    const top = Math.max(0, targetTop - collapsingAbove - headerH - 12);
    window.scrollTo({ top, behavior: calmMotion ? 'auto' : 'smooth' });
  });
}


// Logo -> back to the very top.
// The href points at the header, but the header is sticky: its top edge sits
// at the viewport top at every scroll position, so the browser reads the jump
// as "already there" and nothing moves. Scrolling the window itself is the
// only reliable target.
const brandLink = document.querySelector('.brand');

if (brandLink) {
  brandLink.addEventListener('click', (e) => {
    e.preventDefault();
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
  });
}


// ===== Skills: the cloud =====
// The skills laid on a turning ellipse, after the icon-cloud reference. The reference is a React wrapper around TagCanvas; this is the
// same mechanics written straight against the DOM, because the site has no
// build step, no React and no npm — pulling in a framework and a canvas
// library to spin thirty-two <span>s would cost more than the whole page
// currently weighs. What is copied is the behaviour: a sphere of items, the
// spin steered by where the pointer sits over the block rather than by
// dragging, perspective giving the front row its size, and a slow drift when
// nothing is pointing at it.
//
// The elements stay exactly the plates the stylesheet lays out on its own —
// same markup, same labels — so with the script off the block is still a
// readable grid of skills rather than a heap.
//
// On a phone it is the same cloud, with two differences the screen forces.
// The ellipse stands on end rather than lying on its side, because the screen
// does. And there is no pointer to steer it with, so a finger does — but only
// over the middle of the block: claiming the whole cloud for the gesture would
// leave a band of the page you cannot scroll past.
const sphereCloud = document.querySelector('[data-sphere]');

if (sphereCloud) {
  const sTags = Array.from(sphereCloud.querySelectorAll('.tag'));
  const sSection = sphereCloud.closest('.section');
  const sNarrow = matchMedia('(max-width: 720px)');
  const sHover = matchMedia('(hover: hover)');
  const sCalm = matchMedia('(prefers-reduced-motion: reduce)');

  // Camera distance in radii. The whole look of the thing is this number:
  // small and the front labels swell out of the block, large and the globe
  // flattens into a disc of evenly sized words.
  const DIST = 2.4;
  // Depth is carried by four things at once, all off the same number: size,
  // opacity, focus and colour. The far side is grey and soft, the near side is
  // the site's accent and sharp — which is also the only place on the page
  // where the accent is used at this size, so the front of the cloud reads as
  // the thing being said and the back as the thing turning away.
  const BACK = [82, 88, 95];      // --ink-soft, the grey the page reads in
  const FRONT = [0, 166, 157];    // --accent
  const MAX_BLUR = 2.2;           // px, at the very back of the turn

  const MAX_SPIN = 0.0153;   // radians per frame with the pointer at the edge
  const IDLE_X = -0.00136;   // the drift it settles into, left to itself
  const IDLE_Y = 0.00357;

  const pts = [];
  // Two radii, not one: the cloud is an ellipse, and which way up it lies
  // follows the screen. On a wide one it lies on its side — as wide as the
  // block allows, flattened vertically. On a phone it stands on end.
  let RX = 420;
  let RY = 190;
  let sFrame = null;
  let sRunning = false;
  let sLast = 0;
  let spinX = IDLE_X;
  let spinY = IDLE_Y;
  let aimX = IDLE_X;
  let aimY = IDLE_Y;
  let hot = null;
  let turns = 0;
  // A drag in progress, and the last shove it carried: on a touch screen the
  // cloud keeps whatever heading the finger gave it rather than easing back to
  // the drift it starts in.
  let drag = null;
  let push = null;

  // Fibonacci lattice. Points spaced by the golden angle land evenly over the
  // sphere; the obvious alternative — even steps of latitude and longitude —
  // crowds them at the poles, which on a word cloud shows up as two knots of
  // overlapping labels top and bottom.
  (function seed() {
    const n = sTags.length;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i += 1) {
      const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = golden * i;
      pts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r });
    }
  })();

  // The points carry the rotation themselves rather than a pair of angles
  // being kept and the whole set rebuilt from the seed each frame: it is the
  // same arithmetic either way, and this way the sphere can be nudged from
  // several places without them having to agree on an origin.
  function turn(ax, ay) {
    const ca = Math.cos(ax);
    const sa = Math.sin(ax);
    const cb = Math.cos(ay);
    const sb = Math.sin(ay);
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i];
      const y1 = p.y * ca - p.z * sa;
      let z1 = p.y * sa + p.z * ca;
      const x1 = p.x * cb + z1 * sb;
      z1 = -p.x * sb + z1 * cb;
      p.x = x1;
      p.y = y1;
      p.z = z1;
    }
    // Rounding creeps into the radius over a long session. Cheap to correct,
    // and left alone it would slowly deflate the globe.
    turns += 1;
    if (turns % 240 === 0) {
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i];
        const d = Math.hypot(p.x, p.y, p.z) || 1;
        p.x /= d; p.y /= d; p.z /= d;
      }
    }
  }

  function place() {
    for (let i = 0; i < sTags.length; i += 1) {
      const p = pts[i];
      const el = sTags[i];
      // Perspective: nearer the camera, further from the centre and larger.
      const per = DIST / (DIST - p.z);
      const x = p.x * RX * per;
      const y = p.y * RY * per;
      // How far forward the label is, 0 at the back of the turn and 1 at the
      // front. Everything that fades with distance is taken off this one
      // number, so size, colour, blur and opacity always agree about where
      // the label is.
      const t = Math.max(0, Math.min(1, (per - 0.706) / 1.008));
      // Eased rather than switched, so the label is seen to grow under the
      // pointer instead of jumping a size while it is already moving.
      // Only the near face answers the pointer. A label on the back of the
      // turn is small, pale and soft, and lighting it up there would mean
      // reaching past whatever is in front of it to something that reads as
      // being behind the block.
      const live = t >= 0.29;
      if (el.__pe !== live) {
        el.__pe = live;
        el.style.pointerEvents = live ? '' : 'none';
      }
      if (!live && el === hot) hot = null;

      const want = el === hot ? 1.35 : 1;
      const ease = sRunning ? 0.18 : 1;
      let lift = el.__lift === undefined ? 1 : el.__lift;
      lift += (want - lift) * ease;
      if (Math.abs(want - lift) < 0.002) lift = want;
      el.__lift = lift;

      // Colour and focus, both mixed from the same distance. Smoothstepped so
      // the accent belongs to the labels that have really come forward rather
      // than washing over the whole front half. Quantised to 1/32 and only
      // written when the step changes: colour and blur both force the label to
      // be painted again, and at sixty frames a second on thirty-two of them
      // that is worth not doing for a change nobody can see.
      // The hover state is folded into the key, or picking a label up and
      // putting it down again would leave it in whatever colour the last step
      // happened to write.
      const q = Math.round(t * 32) + (el === hot ? 1000 : 0);
      if (el.__q !== q) {
        el.__q = q;
        const k = (q % 1000) / 32;
        const s = k * k * (3 - 2 * k);
        // The colour is the label's depth and nothing else — the pointer does
        // not recolour it. What the pointer does is bring it into focus and
        // make it bigger.
        el.style.color = 'rgb(' + Math.round(BACK[0] + (FRONT[0] - BACK[0]) * s) + ','
          + Math.round(BACK[1] + (FRONT[1] - BACK[1]) * s) + ','
          + Math.round(BACK[2] + (FRONT[2] - BACK[2]) * s) + ')';
        // Frozen, a permanently soft label is just an unreadable one, so
        // reduced motion gets a fraction of the blur for the same reason it
        // gets a higher opacity floor.
        const blur = el === hot ? 0 : (1 - k) * (sCalm.matches ? MAX_BLUR * 0.35 : MAX_BLUR);
        el.style.filter = blur > 0.05 ? 'blur(' + blur.toFixed(2) + 'px)' : 'none';
      }
      // The back of the turn is left where it was and the front reaches
      // further: 0.66 up to 1.40, so a label gains a little over half its size
      // again on the way round. Compressed against the raw perspective figure
      // all the same — at full strength the back labels would be too small to
      // read as words at all.
      const scale = (0.66 + t * 0.737) * lift;
      // The far side is faint, as on the reference — but only because it is
      // about to turn to the front. Frozen, that fade would leave a third of
      // the list permanently too pale to read, so under reduced motion the
      // floor comes up and depth is carried by size alone.
      const floor = sCalm.matches ? 0.62 : 0.22;
      const fade = el === hot ? 1 : Math.min(1, floor + (per - 0.706) * 0.78);
      el.style.transform = 'translate3d(calc(-50% + ' + x.toFixed(1) + 'px), calc(-50% + '
        + y.toFixed(1) + 'px), 0) scale(' + scale.toFixed(3) + ')';
      el.style.opacity = fade.toFixed(3);
      el.style.zIndex = String(Math.round(per * 100));
    }
  }

  function sTick(time) {
    sFrame = null;
    const dt = sLast ? Math.min(48, time - sLast) : 16;
    sLast = time;
    // Eased rather than set: the spin follows the pointer without snapping to
    // it, and lets go just as gently when the pointer leaves.
    spinX += (aimX - spinX) * 0.06;
    spinY += (aimY - spinY) * 0.06;
    turn(spinX * (dt / 16), spinY * (dt / 16));
    place();
    if (sRunning) sFrame = requestAnimationFrame(sTick);
  }

  function sStart() {
    if (sRunning || sCalm.matches) return;
    sRunning = true;
    sLast = 0;
    sFrame = requestAnimationFrame(sTick);
  }

  function sStop() {
    sRunning = false;
    if (sFrame) cancelAnimationFrame(sFrame);
    sFrame = null;
  }

  // Anything of two words or more is broken across lines, at the points that
  // leave the lines closest in width — split as "Управление" over
  // "распределёнными командами" a label is a wedge, and thirty wedges read as
  // a ragged mess rather than a cloud. Two lines is the usual answer; a label
  // whose best two lines still leave one of them over the cap goes to three,
  // which is what puts "Управление распределёнными командами" on three lines
  // and leaves the rest of the list on two. The unbroken label is kept on the
  // node, so re-running this after the web fonts land measures the words
  // themselves rather than a line that has already been cut once.
  const rule = document.createElement('canvas').getContext('2d');
  const LINE_CAP = 10.5;   // in ems: about as long a line as the cloud can take

  // Every way of cutting n words into k lines, the widest line of each
  // measured, the arrangement with the narrowest widest line kept. The labels
  // here run to four words, so the whole search is a handful of combinations.
  function balance(words, k) {
    const n = words.length;
    let best = { cuts: [n], widest: Infinity };
    function walk(start, left, cuts) {
      if (left === 1) {
        const all = cuts.concat([n]);
        let prev = 0;
        let widest = 0;
        for (let i = 0; i < all.length; i += 1) {
          widest = Math.max(widest, rule.measureText(words.slice(prev, all[i]).join(' ')).width);
          prev = all[i];
        }
        if (widest < best.widest) best = { cuts: all, widest };
        return;
      }
      for (let c = start + 1; c <= n - left + 1; c += 1) walk(c, left - 1, cuts.concat([c]));
    }
    walk(0, k, []);
    return best;
  }

  function breakLabel(el) {
    const inner = el.querySelector('.tag-in');
    if (!inner) return;
    if (inner.dataset.flat === undefined) inner.dataset.flat = inner.textContent.trim();
    const words = inner.dataset.flat.split(/\s+/);
    if (words.length < 2) return;
    const cs = getComputedStyle(inner);
    rule.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    const cap = parseFloat(cs.fontSize) * LINE_CAP;
    let pick = null;
    for (let k = 2; k <= words.length; k += 1) {
      pick = balance(words, k);
      if (pick.widest <= cap) break;
    }
    inner.textContent = '';
    let prev = 0;
    for (let i = 0; i < pick.cuts.length; i += 1) {
      if (i) inner.appendChild(document.createElement('br'));
      inner.appendChild(document.createTextNode(words.slice(prev, pick.cuts[i]).join(' ')));
      prev = pick.cuts[i];
    }
  }

  // The horizontal radius is whatever is left of the block once the widest
  // label has room to hang off the end of it: perspective throws a label out
  // to 1.1 radii at the widest point of the turn, so that figure — plus half
  // the widest label — is what has to equal half the block.
  //
  // The vertical radius is taken from the screen rather than from the width:
  // the block has to stand in one screenful, so the cloud is given whatever
  // the viewport has left after the heading, the section's own padding and
  // the sticky header — and takes all of it, which is what stops the block
  // from sitting in a short band with a field of empty page under it. The
  // ratio to the width is only a ceiling, so a tall window cannot round the
  // ellipse back into a circle.
  function sLayout() {
    const w = sphereCloud.clientWidth || 1;
    let widest = 0;
    let tallest = 0;
    for (let i = 0; i < sTags.length; i += 1) {
      widest = Math.max(widest, sTags[i].offsetWidth);
      tallest = Math.max(tallest, sTags[i].offsetHeight);
    }
    // 6px of air at each end so a label at the widest point of the turn does
    // not sit against the edge of the screen. The floor keeps the cloud from
    // collapsing when the longest label eats most of the width — but it has to
    // be a floor the screen can hold, or on a phone it is the thing that pushes
    // the block wider than the viewport.
    RX = Math.max(Math.min(180, w * 0.3), (w / 2 - widest / 2 - 6) / 1.1);

    // The block has to stand in one screenful — heading, menu and all — so the
    // cloud gets exactly what the viewport has left after the sticky header,
    // the section's own padding and the heading, and it takes all of it. That
    // is what makes the height follow the window as well as the width.
    const head = document.querySelector('.site-header');
    // Everything in the section that is not the cloud: padding, heading, gap.
    const rest = sSection.offsetHeight - sphereCloud.offsetHeight;
    // …and one deliberate cheat, on wide screens only. The block keeps the
    // site's 88px of air above the heading, but the sum below is told the
    // screen is half that taller than it is. The block then runs a little past
    // the fold instead of stopping just short of it, which is what stops a
    // strip of the contact panel from showing under the cloud. The padding you
    // see is untouched; only the arithmetic is bent.
    const cheat = sNarrow.matches ? 0
      : parseFloat(getComputedStyle(sSection).paddingTop) / 2 || 0;
    const room = window.innerHeight - rest - (head ? head.offsetHeight : 0) - 8 + cheat;
    // The ratio is only a ceiling — portrait on a phone, landscape on anything
    // wider — and on a very tall window it is what stops the ellipse from
    // stretching past the shape it is meant to be.
    const shape = sNarrow.matches ? 2.1 : 0.8;
    RY = Math.max(120, Math.min((room - tallest - 12) / 2.2, RX * shape));
    sphereCloud.style.height = Math.round(RY * 2.2 + tallest + 12) + 'px';
    place();
  }

  function onScreen() {
    const r = sSection.getBoundingClientRect();
    return r.bottom > -200 && r.top < window.innerHeight + 200;
  }

  function sSync() {
    if (!sphereCloud.classList.contains('is-sphere')) return;
    if (sCalm.matches || !onScreen()) sStop();
    else sStart();
  }

  function sphereOn() {
    sphereCloud.classList.add('is-sphere');
    // The grid script may have nudged the short last row along a column or
    // two; absolute positioning ignores it, but it is not left behind either.
    sTags.forEach((el) => {
      el.style.gridColumnStart = '';
      // After the class, not before: the break point is measured in the type
      // the sphere sets, which is not the type the plates are set in.
      breakLabel(el);
    });
    sLayout();
    sSync();
  }

  // Where a finger turns it. Built here rather than written into the HTML: it
  // is a control for something only the script knows how to drive, and on a
  // pointer device the stylesheet keeps it out of the way entirely.
  const grip = document.createElement('div');
  grip.className = 'tagcloud-grip';
  grip.setAttribute('aria-hidden', 'true');
  sphereCloud.appendChild(grip);

  grip.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    grip.setPointerCapture(e.pointerId);
  });

  // Direction and speed both come off the drag: which way the finger is going
  // and how fast. A flick can push it past the speed a pointer can ask for —
  // it is a shove, not a hover.
  grip.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    const cap = MAX_SPIN * 2.4;
    aimY = Math.max(-cap, Math.min(cap, (dx * MAX_SPIN) / 22));
    aimX = Math.max(-cap, Math.min(cap, (-dy * MAX_SPIN) / 22));
    // The last move with real travel in it is the shove. Read straight off the
    // final sample, a finger that slows to a stop before it lifts would leave
    // the cloud dead still.
    if (Math.hypot(dx, dy) > 3) push = { x: aimX, y: aimY };
    if (!sRunning) sSync();
  });

  // The shove stands. Whatever heading and speed the finger left behind is the
  // cloud's own from then on — it does not slide back to the drift it started
  // in, and the next shove is what changes it again. Held above a floor so a
  // gesture that ends in almost no travel cannot leave it frozen.
  function letGo() {
    if (!drag) return;
    drag = null;
    if (!push) return;
    const mag = Math.hypot(push.x, push.y);
    const floor = MAX_SPIN * 0.22;
    const k = mag < floor ? floor / (mag || 1) : 1;
    aimX = push.x * k;
    aimY = push.y * k;
    push = null;
  }
  grip.addEventListener('pointerup', letGo);
  grip.addEventListener('pointercancel', letGo);

  // Steered by where the pointer rests over the block, not by dragging — the
  // reference leaves dragControl off, and the cloud turns towards whichever
  // edge you are nearest.
  sphereCloud.addEventListener('pointermove', (e) => {
    // A pointer only. A finger reaches the cloud through the grip, and letting
    // touch through here as well would have every scroll past the block spin
    // it on the way.
    if (!sRunning || !sHover.matches || e.pointerType === 'touch') return;
    const r = sphereCloud.getBoundingClientRect();
    const px = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
    const py = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
    aimY = px * MAX_SPIN;
    aimX = -py * MAX_SPIN;
  }, { passive: true });

  sphereCloud.addEventListener('pointerleave', () => {
    hot = null;
    // Only a pointer hands the cloud back to its drift. A finger leaving the
    // block is not letting go of anything — the shove it gave still stands.
    if (!sHover.matches) return;
    aimX = IDLE_X;
    aimY = IDLE_Y;
  });

  // No hover without a pointer to hover with: on a touch screen the labels are
  // inert and nothing lights up under a finger.
  sphereCloud.addEventListener('mouseover', (e) => {
    if (!sHover.matches) return;
    const t = e.target.closest('.tag');
    if (t && sphereCloud.classList.contains('is-sphere')) {
      hot = t;
      // Standing still — under reduced motion, or parked off-screen — there is
      // no next frame to pick the change up, so paint it here.
      if (!sRunning) place();
    }
  });
  sphereCloud.addEventListener('mouseout', (e) => {
    if (hot && e.target.closest('.tag') === hot) {
      hot = null;
      if (!sRunning) place();
    }
  });

  sNarrow.addEventListener('change', sLayout);
  sCalm.addEventListener('change', () => {
    // The blur and the opacity floor both differ under reduced motion, and the
    // cached step would otherwise hold the old pair until the label happened
    // to move on to the next one.
    sTags.forEach((el) => { el.__q = undefined; });
    sSync();
    if (!sRunning) place();
  });
  window.addEventListener('scroll', sSync, { passive: true });
  window.addEventListener('resize', () => {
    sLayout();
    sSync();
  });
  // The label boxes are the fallback face's until the web fonts land, and the
  // tallest of them is what the height of the globe is measured against.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      sTags.forEach(breakLabel);
      sLayout();
    });
  }
  sphereOn();
}
