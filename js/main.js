document.addEventListener('DOMContentLoaded', () => {
  // ============================================================
  // Mobile bottom navigation + "More" sheet
  // ============================================================
  const bnMore = document.querySelector('.bn-more');
  const bnSheet = document.getElementById('mobile-more-menu');
  const bnScrim = document.querySelector('[data-bn-scrim]');

  if (bnMore && bnSheet) {
    const setMore = (open) => {
      bnSheet.classList.toggle('is-open', open);
      bnMore.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (bnScrim) {
        bnScrim.hidden = !open;
        // let the element paint before fading it in
        if (open) requestAnimationFrame(() => bnScrim.classList.add('is-open'));
        else bnScrim.classList.remove('is-open');
      }
    };

    bnMore.addEventListener('click', (e) => {
      e.stopPropagation();
      setMore(!bnSheet.classList.contains('is-open'));
    });

    if (bnScrim) bnScrim.addEventListener('click', () => setMore(false));

    bnSheet.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => setMore(false));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setMore(false);
    });

    // Leaving the mobile breakpoint should not leave the sheet stranded open
    const wide = window.matchMedia('(min-width: 901px)');
    const onBreakpoint = (e) => { if (e.matches) setMore(false); };
    if (wide.addEventListener) wide.addEventListener('change', onBreakpoint);
    else if (wide.addListener) wide.addListener(onBreakpoint);
  }

  // ============================================================
  // Blog cards — open the article in a popup
  // ============================================================
  (function setupBlogModal() {
    const cards = Array.from(document.querySelectorAll('.blog-card[data-blog-body]'));
    if (!cards.length) return;

    // Build the dialog once, lazily, so no page needs the markup duplicated
    const modal = document.createElement('div');
    modal.className = 'condition-modal blog-modal';
    modal.id = 'blog-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('aria-labelledby', 'blog-modal-title');
    modal.innerHTML =
      '<div class="modal-content">' +
        '<button class="modal-close" aria-label="Close article">&times;</button>' +
        '<div class="blog-modal-thumb" id="blog-modal-thumb"></div>' +
        '<div class="modal-header blog-modal-header">' +
          '<span class="blog-tag" id="blog-modal-tag"></span>' +
          '<h2 id="blog-modal-title"></h2>' +
        '</div>' +
        '<div class="modal-body"><div class="blog-modal-body" id="blog-modal-body"></div></div>' +
        '<div class="modal-footer">' +
          '<a href="book-appointment.html" class="btn btn-primary">Book a Consultation <span aria-hidden="true">&rarr;</span></a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    const titleEl = modal.querySelector('#blog-modal-title');
    const tagEl = modal.querySelector('#blog-modal-tag');
    const bodyEl = modal.querySelector('#blog-modal-body');
    const thumbEl = modal.querySelector('#blog-modal-thumb');
    const closeBtn = modal.querySelector('.modal-close');
    let lastFocus = null;

    const cmsText = (key) => {
      if (window.HHContent && typeof HHContent.get === 'function') {
        const v = HHContent.get(key);
        if (v) return v;
      }
      const el = document.querySelector('[data-cms="' + key + '"]');
      return el ? el.textContent : '';
    };

    // Blog cards are rendered from data/blogposts.json and carry data-blog-body="id:<postId>"
    function blogBody(raw) {
      const value = raw || '';
      if (value.indexOf('id:') === 0) {
        const id = value.slice(3);
        const posts = (window.HH && typeof HH.getBlogPosts === 'function') ? HH.getBlogPosts() : [];
        const post = posts.filter(function (p) { return p.id === id; })[0];
        return post ? (post.body || '') : '';
      }
      return cmsText(value);
    }

    function articleParagraphs(key, fallbackEl) {
      const raw = blogBody(key);
      const paras = String(raw || '')
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean);

      if (paras.length) {
        return paras.map((p) => {
          const el = document.createElement('p');
          el.textContent = p;
          return el;
        });
      }
      const el = document.createElement('p');
      el.textContent = fallbackEl ? fallbackEl.textContent : 'This article is coming soon.';
      return [el];
    }

    function close() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function open(card, trigger) {
      const heading = card.querySelector('h3');
      const tag = card.querySelector('.blog-tag, .blog-date');
      const thumb = card.querySelector('.blog-thumb');
      const img = card.querySelector('.blog-img img');

      titleEl.textContent = heading ? heading.textContent : '';
      tagEl.textContent = tag ? tag.textContent : '';
      tagEl.hidden = !tag;

      // reuse the card artwork as the modal banner
      thumbEl.innerHTML = '';
      if (thumb) {
        thumbEl.style.background = thumb.style.background || '';
      } else if (img) {
        thumbEl.style.background = '#0F2A5A url("' + img.getAttribute('src') + '") center/cover no-repeat';
      } else {
        thumbEl.style.background = 'linear-gradient(135deg,#2563EB,#38BDF8)';
      }

      bodyEl.innerHTML = '';
      const summary = card.querySelector('p');
      articleParagraphs(card.getAttribute('data-blog-body'), summary).forEach((p) => bodyEl.appendChild(p));

      lastFocus = trigger || card;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      closeBtn.focus();
    }

    // ---- inline expansion: "Read More" reveals the article under the card ----
    function buildInline(card) {
      if (card.querySelector('.blog-card-full')) return;
      const holder = document.createElement('div');
      holder.className = 'blog-card-full';
      const summary = card.querySelector('p');
      articleParagraphs(card.getAttribute('data-blog-body'), summary).forEach((p) => holder.appendChild(p));
      card.appendChild(holder);
    }

    function toggleInline(card, trigger) {
      buildInline(card);
      const isOpen = card.classList.toggle('is-expanded');
      if (trigger) trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) {
        requestAnimationFrame(() => {
          const holder = card.querySelector('.blog-card-full');
          if (!holder) return;
          const top = holder.getBoundingClientRect().top;
          if (top < 0 || top > window.innerHeight - 140) {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });
      }
    }

    // one delegated handler covers the card, its title and its "Read More"
    document.addEventListener('click', (e) => {
      const more = e.target.closest('.blog-card[data-blog-body] .read-more');
      if (more) {
        e.preventDefault();
        e.stopPropagation();
        toggleInline(more.closest('.blog-card'), more);
        return;
      }

      const card = e.target.closest('.blog-card[data-blog-body]');
      if (card) {
        e.preventDefault();
        open(card, card);
        return;
      }
      if (e.target === modal) close();
    });

    // keyboard support for the card itself
    cards.forEach((card) => {
      card.addEventListener('keydown', (e) => {
        if (e.target !== card) return;
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          open(card, card);
        }
      });
    });

    closeBtn.addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) close();
    });
  })();

  // Header scroll shadow
  const header = document.querySelector('header.site-header');
  if (header) {
    const onScroll = () => {
      header.classList.toggle('scrolled', window.scrollY > 20);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // FAQ accordion
  document.querySelectorAll('.accordion-item').forEach(item => {
    const trigger = item.querySelector('.accordion-trigger');
    const panel = item.querySelector('.accordion-panel');
    if (!trigger || !panel) return;
    trigger.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.accordion-item.open').forEach(other => {
        if (other !== item) {
          other.classList.remove('open');
          other.querySelector('.accordion-panel').style.maxHeight = null;
          other.querySelector('.accordion-trigger').setAttribute('aria-expanded', 'false');
        }
      });
      if (isOpen) {
        item.classList.remove('open');
        panel.style.maxHeight = null;
        trigger.setAttribute('aria-expanded', 'false');
      } else {
        item.classList.add('open');
        panel.style.maxHeight = panel.scrollHeight + 'px';
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Scroll-triggered animations via Intersection Observer
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReducedMotion && 'IntersectionObserver' in window) {
    const animElements = document.querySelectorAll(
      '.anim-fade-up, .anim-fade-left, .anim-fade-right, .anim-scale, .anim-stagger'
    );
    if (animElements.length) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
      animElements.forEach(el => observer.observe(el));
    }
  } else {
    document.querySelectorAll(
      '.anim-fade-up, .anim-fade-left, .anim-fade-right, .anim-scale, .anim-stagger'
    ).forEach(el => el.classList.add('is-visible'));
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const id = anchor.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });


  // Premium scroll reveals — re-trigger for new elements from admin.
  let premiumObserver = null;

  function setupPremiumReveals() {
    const revealTargets = document.querySelectorAll([
      'section:not(.hero) .section-head',
      'section:not(.hero) .two-col > *',
      '.trust-item', '.doctor-card', '.gallery-grid figure',
      '.service-card', '.approach-card', '.blog-card', '.cta-banner'
    ].join(','));

    revealTargets.forEach((element, index) => {
      if (!element.classList.contains('premium-reveal')) {
        element.classList.add('premium-reveal');
        element.style.setProperty('--reveal-delay', `${(index % 4) * 70}ms`);
      }
    });

    if (!prefersReducedMotion && 'IntersectionObserver' in window) {
      if (!premiumObserver) {
        premiumObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-premium-visible');
            premiumObserver.unobserve(entry.target);
          });
        }, { threshold: 0.12, rootMargin: '0px 0px -7% 0px' });
      }
      revealTargets.forEach(element => {
        if (!element.classList.contains('is-premium-visible')) {
          premiumObserver.observe(element);
        }
      });
    } else {
      revealTargets.forEach(element => element.classList.add('is-premium-visible'));
    }
  }
  setupPremiumReveals();

  // Smooth, frame-synchronised parallax for the home hero only.
  const parallaxHero = document.querySelector('.home-hero');
  if (parallaxHero && !prefersReducedMotion) {
    let pointerX = 0;
    let targetPointerX = 0;
    let currentY = 0;
    let targetY = 0;
    let rafId = 0;

    const renderParallax = () => {
      currentY += (targetY - currentY) * 0.09;
      pointerX += (targetPointerX - pointerX) * 0.08;
      parallaxHero.style.setProperty('--hero-parallax-y', `${currentY.toFixed(2)}px`);
      parallaxHero.style.setProperty('--hero-parallax-x', `${pointerX.toFixed(2)}px`);
      parallaxHero.style.setProperty('--content-parallax-y', `${(-currentY * 0.24).toFixed(2)}px`);
      const moving = Math.abs(targetY - currentY) > 0.08 || Math.abs(targetPointerX - pointerX) > 0.08;
      rafId = moving ? requestAnimationFrame(renderParallax) : 0;
    };

    const updateTargets = () => {
      const rect = parallaxHero.getBoundingClientRect();
      const progress = Math.max(-1, Math.min(1, -rect.top / Math.max(rect.height, 1)));
      targetY = progress * 34;
      if (!rafId) rafId = requestAnimationFrame(renderParallax);
    };

    parallaxHero.addEventListener('pointermove', event => {
      if (window.innerWidth < 901) return;
      const rect = parallaxHero.getBoundingClientRect();
      targetPointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 10;
      if (!rafId) rafId = requestAnimationFrame(renderParallax);
    }, { passive: true });

    parallaxHero.addEventListener('pointerleave', () => {
      targetPointerX = 0;
      if (!rafId) rafId = requestAnimationFrame(renderParallax);
    });

    window.addEventListener('scroll', updateTargets, { passive: true });
    window.addEventListener('resize', updateTargets, { passive: true });
    updateTargets();
  }

  // ============================================================
  // Text character-by-character reveal animation (text-anime-style-2)
  // ============================================================
  let textObserver = null;
  if (!prefersReducedMotion && 'IntersectionObserver' in window) {
    textObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('animated');
        textObserver.unobserve(entry.target);
      });
    }, { threshold: 0.3 });
  }

  function setupTextAnimations() {
    document.querySelectorAll('.text-anime-style-2').forEach(el => {
      if (el.querySelector('.char')) return;
      const text = el.textContent.trim();
      el.innerHTML = '';
      let ci = 0;
      text.split(' ').forEach((word, wi, arr) => {
        const w = document.createElement('span');
        w.className = 'word';
        word.split('').forEach((char) => {
          const span = document.createElement('span');
          span.className = 'char';
          span.textContent = char;
          span.style.transitionDelay = `${ci * 0.015}s`;
          ci += 1;
          w.appendChild(span);
        });
        el.appendChild(w);
        if (wi < arr.length - 1) el.appendChild(document.createTextNode(' '));
      });
      if (textObserver) textObserver.observe(el);
      else el.classList.add('animated');
    });
  }
  setupTextAnimations();

  // ============================================================
  // WOW.js compatible scroll animations
  // ============================================================
  const wowElements = document.querySelectorAll('.wow');
  if (!prefersReducedMotion && 'IntersectionObserver' in window && wowElements.length) {
    const wowObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('animated');
        entry.target.style.visibility = 'visible';
        entry.target.style.opacity = '1';
        wowObserver.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -5% 0px' });
    wowElements.forEach(el => {
      el.style.visibility = 'hidden';
      el.style.opacity = '0';
      wowObserver.observe(el);
    });
  } else if (wowElements.length) {
    wowElements.forEach(el => {
      el.style.visibility = 'visible';
      el.style.opacity = '1';
      el.classList.add('animated');
    });
  }

  // ============================================================
  // Parallax scrolling engine — smooth, frame-synced
  // ============================================================
  if (!prefersReducedMotion && 'IntersectionObserver' in window) {
    const parallaxBgs = document.querySelectorAll('.parallax-bg');
    const parallaxFloats = document.querySelectorAll('.parallax-float');
    const sectionTransitions = document.querySelectorAll(
      '.section-transition, .reveal-zoom, .reveal-slide-left, .reveal-slide-right, .reveal-rotate, .reveal-flip, .reveal-blur'
    );

    const PARALLAX_SPEED = 0.35;
    let ticking = false;

    const isMobile = () => window.innerWidth < 768;

    const updateParallax = () => {
      const scrollY = window.pageYOffset;
      const viewH = window.innerHeight;

      parallaxBgs.forEach(bg => {
        const section = bg.closest('.parallax-section');
        if (!section) return;

        // Disable parallax on small screens — just center the image
        if (isMobile()) {
          bg.style.transform = 'translate3d(0, 0, 0) scale(1.15)';
          return;
        }

        const rect = section.getBoundingClientRect();
        const sectionTop = rect.top + scrollY;
        const sectionH = rect.height;

        // Skip sections outside viewport
        if (scrollY + viewH < sectionTop || scrollY > sectionTop + sectionH) return;

        // Correct parallax: background moves SLOWER than foreground
        // When section scrolls up by X pixels, background moves up by X * (1 - PARALLAX_SPEED) pixels
        // This means the background appears to lag behind, creating depth
        const scrolledPast = scrollY - sectionTop + viewH;
        const totalTravel = sectionH + viewH;
        const progress = scrolledPast / totalTravel;

        // Map progress (0→1) to offset that moves the bg DOWN (opposite to scroll direction)
        // At progress=0 (section just entering): bg is slightly below center
        // At progress=1 (section leaving): bg is slightly above center
        // This creates the correct parallax direction
        const offset = (1 - progress) * sectionH * PARALLAX_SPEED * 2;

        bg.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0) scale(1.15)`;
      });

      parallaxFloats.forEach(el => {
        if (isMobile()) {
          el.style.transform = 'translate3d(0, 0, 0)';
          return;
        }
        const speed = parseFloat(el.dataset.parallaxSpeed) || 0.2;
        const section = el.closest('.parallax-section') || el.closest('section');
        if (!section) return;
        const rect = section.getBoundingClientRect();
        const scrolledPast = scrollY - (rect.top + scrollY) + viewH;
        const totalTravel = rect.height + viewH;
        const progress = scrolledPast / totalTravel;
        const yOffset = (1 - progress) * 120 * speed;
        el.style.transform = `translate3d(0, ${yOffset.toFixed(1)}px, 0)`;
      });

      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }, { passive: true });

    // Also update on resize
    window.addEventListener('resize', () => {
      if (!ticking) {
        requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }, { passive: true });

    // Section reveal on scroll — re-triggers each time section enters view
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        entry.target.classList.toggle('is-revealed', entry.isIntersecting);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

    sectionTransitions.forEach(el => revealObserver.observe(el));
  } else {
    document.querySelectorAll(
      '.section-transition, .reveal-zoom, .reveal-slide-left, .reveal-slide-right, .reveal-rotate, .reveal-flip, .reveal-blur'
    ).forEach(el => el.classList.add('is-revealed'));
  }

  // ============================================================
  // Re-initialise animations when admin saves content (same tab or storage event)
  // ============================================================
  window.addEventListener('hh-content-updated', function () {
    // Re-run renderAll to pick up admin changes
    if (window.HH && HH.renderAll) HH.renderAll();
    // Re-observe all animated elements after a short delay for DOM update
    setTimeout(function () {
      setupPremiumReveals();
      setupTextAnimations();
      // Re-apply parallax reveal classes to new elements
      document.querySelectorAll('.section-transition, .reveal-zoom, .reveal-slide-left, .reveal-slide-right, .reveal-rotate, .reveal-flip, .reveal-blur').forEach(function (el) {
        el.classList.remove('is-revealed');
      });
    }, 50);

    // Track width changes when CMS re-renders the specialty cards
    setTimeout(window.HH && window.HH.syncMarqueeSpeed, 80);
  });

  // ============================================================
  // Marquee speed — constant pixels-per-second regardless of item count
  // ============================================================
  const MARQUEE_PX_PER_SEC = 100;
  const MARQUEE_MIN_SEC = 60;
  const MARQUEE_MAX_SEC = 360;

  window.HH = window.HH || {};
  window.HH.syncMarqueeSpeed = function () {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('.services-marquee-track, .conditions-marquee-track').forEach(track => {
      const half = track.scrollWidth / 2;
      if (!half) return;
      const duration = reduce ? 0 : Math.min(MARQUEE_MAX_SEC, Math.max(MARQUEE_MIN_SEC, half / MARQUEE_PX_PER_SEC));
      if (duration === 0) {
        track.style.animation = 'none';
      } else {
        track.style.animationDuration = duration + 's';
      }
    });
  };

  window.HH.syncMarqueeSpeed();

  let marqueeResizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(marqueeResizeTimer);
    marqueeResizeTimer = setTimeout(window.HH.syncMarqueeSpeed, 200);
  });

  window.addEventListener('load', window.HH.syncMarqueeSpeed);

});
