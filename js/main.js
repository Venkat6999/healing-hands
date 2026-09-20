document.addEventListener('DOMContentLoaded', () => {
  // Mobile nav toggle — bulletproof
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.primary-nav');

  if (toggle && nav) {
    // Prevent body scroll when menu is open
    const lockScroll = () => {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${window.scrollY}px`;
      document.body.style.width = '100%';
    };
    const unlockScroll = () => {
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      if (scrollY) window.scrollTo(0, parseInt(scrollY || '0') * -1);
    };

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = nav.classList.contains('open');
      if (isOpen) {
        nav.classList.remove('open');
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
        unlockScroll();
      } else {
        nav.classList.add('open');
        toggle.classList.add('active');
        toggle.setAttribute('aria-expanded', 'true');
        lockScroll();
      }
    });

    // Close on nav link click
    nav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        nav.classList.remove('open');
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
        unlockScroll();
      });
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
        unlockScroll();
      }
    });

    // Close when clicking outside the nav
    document.addEventListener('click', (e) => {
      if (nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) {
        nav.classList.remove('open');
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
        unlockScroll();
      }
    });
  }

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
      text.split('').forEach((char, i) => {
        const span = document.createElement('span');
        span.className = 'char';
        span.textContent = char === ' ' ? '\u00A0' : char;
        span.style.transitionDelay = `${i * 0.015}s`;
        el.appendChild(span);
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
  });

});
