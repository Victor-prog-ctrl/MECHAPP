const statusClassMap = {
  pendiente: 'status-pendiente',
  validado: 'status-validado',
  rechazado: 'status-rechazado',
};

const dashboardState = {
  users: [],
};

function formatDate(dateString) {
  if (!dateString) return '—';

  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch (error) {
    console.error('No se pudo formatear la fecha de registro', error);
    return dateString;
  }
}

async function fetchWithHandling(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });

  if (response.status === 401) {
    window.location.href = './login.html';
    return null;
  }

  if (response.status === 403) {
    window.location.href = './paginainicio.html';
    return null;
  }

  if (!response.ok) {
    let message = 'Ocurrió un error.';
    try {
      const data = await response.json();
      message = data.error || message;
    } catch (error) {
      console.error('No se pudo interpretar la respuesta', error);
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function fetchProfile() {
  return fetchWithHandling('/api/profile');
}

async function fetchUsers() {
  const data = await fetchWithHandling('/api/admin/users');
  return data?.users ?? [];
}

function updateStatusIndicator(indicator, status) {
  indicator.className = 'status-indicator';
  if (statusClassMap[status]) {
    indicator.classList.add(statusClassMap[status]);
  }
}

function createStatCard({ title, value, footnote }) {
  const container = document.createElement('article');
  container.className = 'stat-card';

  const titleElement = document.createElement('p');
  titleElement.className = 'stat-title';
  titleElement.textContent = title;

  const valueElement = document.createElement('p');
  valueElement.className = 'stat-value';
  valueElement.textContent = value;

  const footnoteElement = document.createElement('p');
  footnoteElement.className = 'stat-footnote';
  footnoteElement.textContent = footnote;

  container.append(titleElement, valueElement, footnoteElement);
  return container;
}

function renderStats(users) {
  const statsContainer = document.getElementById('dashboard-stats');
  if (!statsContainer) return;

  const totalUsers = users.length;
  const totalMechanics = users.filter((user) => user.account_type === 'mecanico').length;
  const totalAdmins = users.filter((user) => user.account_type === 'admin').length;
  const validatedCertificates = users.filter((user) => user.certificate_status === 'validado').length;
  const pendingCertificates = users.filter((user) => user.certificate_status === 'pendiente').length;

  const stats = [
    {
      title: 'Usuarios registrados',
      value: totalUsers,
      footnote: `${totalMechanics} mecánicos · ${totalAdmins} administradores`,
    },
    {
      title: 'Certificados validados',
      value: validatedCertificates,
      footnote: `${pendingCertificates} pendientes de revisión`,
    },
  ];

  statsContainer.replaceChildren(...stats.map(createStatCard));
}

function renderUsers(users) {
  const tbody = document.getElementById('users-table-body');
  const emptyState = document.getElementById('users-empty-state');
  const template = document.getElementById('user-row-template');

  if (!tbody || !template) return;

  if (!users.length) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.hidden = false;
    return;
  }

  if (emptyState) emptyState.hidden = true;

  const rows = users.map((user) => {
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector('[data-user-row]');
    const nameCell = fragment.querySelector('[data-user-name]');
    const emailCell = fragment.querySelector('[data-user-email]');
    const accountSelect = fragment.querySelector('[data-account-select]');
    const certificateSelect = fragment.querySelector('[data-certificate-select]');
    const certificateIndicator = fragment.querySelector('[data-certificate-indicator]');
    const dateCell = fragment.querySelector('[data-user-date]');

    if (row) row.dataset.userId = user.id;
    if (nameCell) nameCell.textContent = user.name || 'Sin nombre';
    if (emailCell) emailCell.textContent = user.email;

    if (accountSelect) {
      accountSelect.value = user.account_type;
      accountSelect.dataset.originalValue = user.account_type;
      accountSelect.setAttribute('aria-label', `Tipo de cuenta de ${user.name}`);
    }

    if (certificateSelect) {
      certificateSelect.value = user.certificate_status || 'pendiente';
      certificateSelect.dataset.originalValue = user.certificate_status || 'pendiente';
      certificateSelect.setAttribute('aria-label', `Estado del certificado de ${user.name}`);
    }

    if (certificateIndicator) {
      updateStatusIndicator(certificateIndicator, user.certificate_status || 'pendiente');
    }

    if (dateCell) {
      dateCell.textContent = formatDate(user.created_at);
    }

    return fragment;
  });

  tbody.replaceChildren(...rows);
}

function applyFilters(users) {
  const accountFilter = document.getElementById('filter-account-type');
  const certificateFilter = document.getElementById('filter-certificate-status');

  const selectedAccount = accountFilter?.value || 'todos';
  const selectedCertificate = certificateFilter?.value || 'todos';

  return users.filter((user) => {
    const matchesAccount =
      selectedAccount === 'todos' || user.account_type === selectedAccount;
    const matchesCertificate =
      selectedCertificate === 'todos' || user.certificate_status === selectedCertificate;
    return matchesAccount && matchesCertificate;
  });
}

function showRowFeedback(row, message, type = 'success') {
  if (!row) return;
  const feedbackElement = row.querySelector('[data-row-feedback]');

  if (!feedbackElement) return;

  feedbackElement.textContent = message;
  feedbackElement.hidden = false;
  feedbackElement.classList.remove('success', 'error');
  feedbackElement.classList.add(type);

  setTimeout(() => {
    feedbackElement.hidden = true;
  }, 4000);
}

async function updateCertificateStatus(row) {
  const userId = row?.dataset?.userId;
  const select = row?.querySelector('[data-certificate-select]');
  const indicator = row?.querySelector('[data-certificate-indicator]');

  if (!userId || !select || !indicator) return;

  try {
    const status = select.value;
    await fetchWithHandling(`/api/admin/users/${userId}/certificate`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });

    select.dataset.originalValue = status;
    updateStatusIndicator(indicator, status);
    const user = dashboardState.users.find((item) => String(item.id) === String(userId));
    if (user) {
      user.certificate_status = status;
    }
    refreshDashboard();
    const refreshedRow = document.querySelector(`[data-user-row][data-user-id="${userId}"]`);
    showRowFeedback(refreshedRow || row, 'Certificado actualizado correctamente.');
  } catch (error) {
    console.error(error);
    select.value = select.dataset.originalValue || 'pendiente';
    showRowFeedback(row, error.message, 'error');
  }
}

async function updateAccountType(row) {
  const userId = row?.dataset?.userId;
  const select = row?.querySelector('[data-account-select]');

  if (!userId || !select) return;

  try {
    const accountType = select.value;
    await fetchWithHandling(`/api/admin/users/${userId}/account-type`, {
      method: 'PUT',
      body: JSON.stringify({ accountType }),
    });

    select.dataset.originalValue = accountType;
    const user = dashboardState.users.find((item) => String(item.id) === String(userId));
    if (user) {
      user.account_type = accountType;
    }
    refreshDashboard();
    const refreshedRow = document.querySelector(`[data-user-row][data-user-id="${userId}"]`);
    showRowFeedback(refreshedRow || row, 'Rol actualizado correctamente.');
  } catch (error) {
    console.error(error);
    select.value = select.dataset.originalValue || 'cliente';
    showRowFeedback(row, error.message, 'error');
  }
}

function wireTableActions() {
  const table = document.querySelector('.admin-table');
  if (!table) return;

  table.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const action = target.dataset.action;
    if (!action) return;

    const row = target.closest('[data-user-row]');
    if (!row) return;

    target.disabled = true;
    try {
      if (action === 'update-certificate') {
        await updateCertificateStatus(row);
      } else if (action === 'update-account') {
        await updateAccountType(row);
      }
    } finally {
      target.disabled = false;
    }
  });

  table.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;

    const row = target.closest('[data-user-row]');
    if (!row) return;

    if (target.matches('[data-certificate-select]')) {
      const indicator = row.querySelector('[data-certificate-indicator]');
      if (indicator) updateStatusIndicator(indicator, target.value);
    }
  });
}

function setupFilters() {
  const accountFilter = document.getElementById('filter-account-type');
  const certificateFilter = document.getElementById('filter-certificate-status');

  const handleFilterChange = () => {
    const filteredUsers = applyFilters(dashboardState.users);
    renderUsers(filteredUsers);
  };

  if (accountFilter) accountFilter.addEventListener('change', handleFilterChange);
  if (certificateFilter) certificateFilter.addEventListener('change', handleFilterChange);
}

async function handleLogout() {
  try {
    await fetchWithHandling('/api/logout', { method: 'POST' });
  } catch (error) {
    console.error('No se pudo cerrar sesión', error);
  } finally {
    window.location.href = './login.html';
  }
}

function wireLogoutButton() {
  const button = document.getElementById('logout-button');
  if (!button) return;
  button.addEventListener('click', handleLogout);
}

function setupSectionNavigation() {
  const navLinks = Array.from(document.querySelectorAll('.admin-nav .nav-link'));
  if (!navLinks.length) return;

  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.forEach((item) => item.classList.remove('active'));
      link.classList.add('active');
    });
  });

  const sections = [];

  navLinks.forEach((link) => {
    const targetId = link.getAttribute('href')?.replace('#', '');
    if (!targetId) {
      return;
    }

    const section = document.getElementById(targetId);
    if (section) {
      sections.push({ link, section });
    }
  });

  if (!sections.length || !('IntersectionObserver' in window)) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const matched = sections.find(({ section }) => section === entry.target);
        if (!matched) return;

        navLinks.forEach((item) => item.classList.remove('active'));
        matched.link.classList.add('active');
      });
    },
    {
      rootMargin: '-40% 0px -40% 0px',
      threshold: 0.25,
    }
  );

  sections.forEach(({ section }) => observer.observe(section));
}

function refreshDashboard() {
  renderStats(dashboardState.users);
  const filtered = applyFilters(dashboardState.users);
  renderUsers(filtered);
}

async function initAdminDashboard() {
  try {
    const profile = await fetchProfile();
    if (!profile) return;

    if (profile.accountType !== 'admin') {
      window.location.href = './paginainicio.html';
      return;
    }

    const users = await fetchUsers();
    if (!users) return;

    dashboardState.users = users;
    refreshDashboard();
    setupFilters();
    wireTableActions();
    wireLogoutButton();
    setupSectionNavigation();
  } catch (error) {
    console.error('No se pudo inicializar el panel de administración', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initAdminDashboard();
});
