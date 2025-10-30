(function () {
  const EMPTY_MESSAGE = '<p class="featured-services__empty">Aún no hay servicios registrados.</p>';
  const ERROR_MESSAGE = '<p class="featured-services__empty">No pudimos cargar los servicios destacados.</p>';

  function normalizeText(value) {
    return value
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ñ/g, 'n');
  }

  function createServiceCard(entry) {
    const article = document.createElement('article');
    article.className = 'featured-service-card';

    const title = document.createElement('h3');
    title.className = 'featured-service-card__title';
    title.textContent = entry.name;
    article.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'featured-service-card__meta';
    const suffix = entry.count === 1 ? 'taller lo ofrece' : 'talleres lo ofrecen';
    meta.textContent = `${entry.count} ${suffix}`;
    article.appendChild(meta);

    return article;
  }

  function setNavDisabled(container, disabled) {
    if (!container) {
      return;
    }

    const buttons = container.querySelectorAll('[data-featured-prev], [data-featured-next]');
    buttons.forEach((button) => {
      button.disabled = disabled;
    });
  }

  async function fetchWorkshops() {
    const response = await fetch('/api/workshops');
    if (!response.ok) {
      throw new Error('No se pudieron cargar los talleres');
    }
    return response.json();
  }

  function buildServiceEntries(workshops) {
    const map = new Map();

    workshops.forEach((workshop) => {
      const services = Array.isArray(workshop?.services) ? workshop.services : [];
      const seen = new Set();

      services.forEach((serviceName) => {
        if (!serviceName || typeof serviceName !== 'string') {
          return;
        }

        const trimmed = serviceName.trim().replace(/\s+/g, ' ');
        if (!trimmed) {
          return;
        }

        const key = normalizeText(trimmed).replace(/\s+/g, ' ');
        if (!key || seen.has(key)) {
          return;
        }

        seen.add(key);

        if (!map.has(key)) {
          map.set(key, { key, name: trimmed, count: 0 });
        }

        const entry = map.get(key);
        entry.count += 1;
      });
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.count === a.count) {
        return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      }
      return b.count - a.count;
    });
  }

  function getScrollAmount(track, wrapper) {
    const firstCard = track.querySelector('.featured-service-card');
    if (!firstCard) {
      return wrapper.clientWidth;
    }

    const cardWidth = firstCard.getBoundingClientRect().width;
    const styles = window.getComputedStyle(track);
    const gapValues = [styles.columnGap, styles.gap, styles.rowGap];
    const gap = gapValues
      .map((value) => {
        const parsed = Number.parseFloat(value);
        return Number.isNaN(parsed) ? 0 : parsed;
      })
      .find((value) => value > 0) || 0;

    return cardWidth + gap;
  }

  function setupCarousel(track) {
    const container = track.closest('[data-featured-services]');
    if (!container) {
      return;
    }

    const wrapper = container.querySelector('.featured-services-track-wrapper');
    const prevButton = container.querySelector('[data-featured-prev]');
    const nextButton = container.querySelector('[data-featured-next]');

    if (!wrapper || !prevButton || !nextButton) {
      return;
    }

    const updateButtons = () => {
      const hasContent = track.children.length > 0 && !track.classList.contains('featured-services-track--empty');
      const maxScroll = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
      const currentScroll = wrapper.scrollLeft;
      prevButton.disabled = !hasContent || currentScroll <= 0;
      nextButton.disabled = !hasContent || currentScroll >= maxScroll - 1;
    };

    const scrollByAmount = (direction) => {
      const amount = getScrollAmount(track, wrapper);
      if (!amount) {
        return;
      }
      wrapper.scrollBy({ left: direction * amount, behavior: 'smooth' });
    };

    prevButton.addEventListener('click', () => scrollByAmount(-1));
    nextButton.addEventListener('click', () => scrollByAmount(1));
    wrapper.addEventListener('scroll', updateButtons, { passive: true });
    window.addEventListener('resize', updateButtons);

    requestAnimationFrame(updateButtons);
  }

  async function renderFeaturedServices() {
    const track = document.querySelector('[data-featured-track]');
    if (!track) {
      return;
    }

    const container = track.closest('[data-featured-services]');
    if (container) {
      container.setAttribute('aria-busy', 'true');
    }

    try {
      const data = await fetchWorkshops();
      const workshops = Array.isArray(data?.workshops) ? data.workshops : [];
      const services = buildServiceEntries(workshops);

      if (!services.length) {
        track.classList.add('featured-services-track--empty');
        track.innerHTML = EMPTY_MESSAGE;
        setNavDisabled(container, true);
        return;
      }

      const fragment = document.createDocumentFragment();
      services.forEach((service) => {
        fragment.appendChild(createServiceCard(service));
      });

      track.classList.remove('featured-services-track--empty');
      track.innerHTML = '';
      track.appendChild(fragment);
      setupCarousel(track);
      setNavDisabled(container, false);
    } catch (error) {
      console.error(error);
      track.classList.add('featured-services-track--empty');
      track.innerHTML = ERROR_MESSAGE;
      setNavDisabled(container, true);
    } finally {
      if (container) {
        container.removeAttribute('aria-busy');
      }
    }
  }

  document.addEventListener('DOMContentLoaded', renderFeaturedServices);
})();
