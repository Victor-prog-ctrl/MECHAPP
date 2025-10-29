(function () {
  function createWorkshopCard(workshop) {
    const article = document.createElement('article');
    article.className = 'workshop-card';

    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'workshop-card__image';
    const image = document.createElement('img');
    image.src = workshop.photo;
    image.alt = `Imagen del taller ${workshop.name}`;
    image.loading = 'lazy';
    imageWrapper.appendChild(image);
    article.appendChild(imageWrapper);

    const body = document.createElement('div');
    body.className = 'workshop-card__body';

    const heading = document.createElement('h3');
    heading.textContent = workshop.name;
    body.appendChild(heading);

    const description = document.createElement('p');
    description.textContent = workshop.shortDescription;
    body.appendChild(description);

    const specialties = document.createElement('ul');
    specialties.className = 'workshop-card__specialties';
    workshop.specialties.slice(0, 3).forEach((specialty) => {
      const item = document.createElement('li');
      item.textContent = specialty;
      specialties.appendChild(item);
    });
    body.appendChild(specialties);

    const rating = document.createElement('p');
    rating.className = 'workshop-card__rating';
    rating.innerHTML = `<strong>${workshop.rating.toFixed(1)}</strong> · ${workshop.reviewsCount} reseñas`;
    body.appendChild(rating);

    const actions = document.createElement('div');
    actions.className = 'workshop-card__actions';
    const profileLink = document.createElement('a');
    profileLink.className = 'button ghost';
    profileLink.href = `./perfil-taller.html?id=${encodeURIComponent(workshop.id)}`;
    profileLink.textContent = 'Ver más';
    profileLink.setAttribute('aria-label', `Ver perfil del taller ${workshop.name}`);
    actions.appendChild(profileLink);
    body.appendChild(actions);

    article.appendChild(body);
    return article;
  }

  function renderHomeWorkshops() {
    const container = document.querySelector('[data-home-workshops]');
    if (!container || !window.Mechapp?.workshops?.getSummary) {
      return;
    }

    const summary = window.Mechapp.workshops.getSummary();
    const fragment = document.createDocumentFragment();
    summary.forEach((workshop) => {
      fragment.appendChild(createWorkshopCard(workshop));
    });
    container.innerHTML = '';
    container.appendChild(fragment);
  }

  document.addEventListener('DOMContentLoaded', renderHomeWorkshops);
})();
