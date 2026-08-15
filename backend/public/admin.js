const API = `${window.location.origin}/api`;
let token = localStorage.getItem('admin_token');
let stopsList = [];

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showMessage(text, type) {
  const message = $('message');
  message.textContent = text;
  message.className = `message ${type}`;
  message.style.display = 'block';
  setTimeout(() => { message.style.display = 'none'; }, 4000);
}

function showDashboard() {
  $('loginScreen').classList.add('hidden');
  $('dashboard').classList.remove('hidden');
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach((tab) => tab.classList.add('hidden'));
  $(`tab-${name}`).classList.remove('hidden');
}

async function login() {
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const error = $('loginError');
  const button = $('loginButton');
  error.textContent = '';
  if (!email || !password) { error.textContent = 'Enter your admin email and password.'; return; }
  button.disabled = true;
  button.textContent = 'Logging in…';
  try {
    const response = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Login failed');
    if (data.user.role !== 'ADMIN') throw new Error('This account is not an admin.');
    token = data.token;
    const session = await api('/auth/me');
    if (session.user.role !== 'ADMIN') throw new Error('This account is not an admin.');
    localStorage.setItem('admin_token', token);
    $('adminName').textContent = session.user.name;
    showDashboard();
    await loadAll();
  } catch (error) {
    token = null;
    localStorage.removeItem('admin_token');
    $('loginError').textContent = error.message || 'Cannot reach server. Is the backend running?';
  } finally { button.disabled = false; button.textContent = 'Login'; }
}

function logout() {
  token = null;
  localStorage.removeItem('admin_token');
  $('loginScreen').classList.remove('hidden');
  $('dashboard').classList.add('hidden');
}

async function loadDrivers() {
  const { drivers } = await api('/admin/drivers');
  $('driversTable').innerHTML = drivers.length ? drivers.map((driver) => `<tr><td>${driver.driver_id}</td><td>${driver.name}</td><td>${driver.email}</td><td>${driver.phone || '—'}</td><td>${driver.license_number}</td><td><span class="badge ${driver.driver_status === 'ACTIVE' ? 'badge-green' : 'badge-red'}">${driver.driver_status}</span></td></tr>`).join('') : '<tr><td colspan="6" class="empty">No drivers registered yet</td></tr>';
}

async function loadBuses() {
  const { buses } = await api('/admin/buses');
  $('busesTable').innerHTML = buses.length ? buses.map((bus) => `<tr><td>${bus.id}</td><td>${bus.bus_number}</td><td>${bus.bus_name}</td><td>${bus.bus_type}</td><td>${bus.capacity}</td><td><span class="badge ${bus.status === 'ACTIVE' ? 'badge-green' : 'badge-yellow'}">${bus.status}</span></td><td>${bus.assigned_driver_name || '—'}</td><td>${bus.route_name || '—'}</td></tr>`).join('') : '<tr><td colspan="8" class="empty">No buses yet</td></tr>';
  $('assignBus').innerHTML = '<option value="">Select Bus</option>' + buses.filter((bus) => !bus.assigned_driver_name).map((bus) => `<option value="${bus.id}">${bus.bus_number} — ${bus.bus_name}</option>`).join('');
}

async function loadRoutes() {
  const { routes } = await api('/admin/routes');
  $('routesTable').innerHTML = routes.length ? routes.map((route) => {
    const isActive = route.is_active !== false;
    const statusBadge = isActive
      ? '<span class="badge badge-green">ACTIVE</span>'
      : '<span class="badge badge-gray">DEACTIVATED</span>';
    const toggleBtn = isActive
      ? `<button class="btn-warning" data-deactivate-route="${route.id}" data-route-name="${encodeURIComponent(route.route_name)}">Deactivate</button>`
      : `<button class="btn-success" data-reactivate-route="${route.id}" data-route-name="${encodeURIComponent(route.route_name)}">Reactivate</button>`;
    const forceDeleteBtn = `<button class="btn-danger" data-force-delete-route="${route.id}" data-route-name="${encodeURIComponent(route.route_name)}" style="margin-left:6px;">Delete Permanently</button>`;
    return `<tr><td>${route.id}</td><td>${escapeHtml(route.route_name)}</td><td>${escapeHtml(route.start_location)}</td><td>${escapeHtml(route.end_location)}</td><td>${route.total_stops}</td><td>${statusBadge}</td><td>${toggleBtn}${forceDeleteBtn}</td></tr>`;
  }).join('') : '<tr><td colspan="7" class="empty">No routes yet</td></tr>';
  $('assignRoute').innerHTML = '<option value="">Select Route (optional)</option>' + routes.filter((route) => route.is_active !== false).map((route) => `<option value="${route.id}">${escapeHtml(route.route_name)}</option>`).join('');
}

async function loadAssignments() {
  const [{ assignments }, { drivers }] = await Promise.all([api('/admin/assignments'), api('/admin/drivers')]);
  $('assignmentsTable').innerHTML = assignments.length ? assignments.map((assignment) => `<tr><td>${assignment.id}</td><td>${assignment.driver_name} (${assignment.driver_email})</td><td>${assignment.bus_number} — ${assignment.bus_name}</td><td>${assignment.route_name || '—'}</td><td>${new Date(assignment.assigned_at).toLocaleString()}</td><td><button class="btn-danger" data-remove-assignment="${assignment.id}">Remove</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty">No assignments yet</td></tr>';
  $('assignDriver').innerHTML = '<option value="">Select Driver</option>' + drivers.map((driver) => `<option value="${driver.driver_id}">${driver.name} (${driver.email})</option>`).join('');
}

async function loadAll() {
  try { await Promise.all([loadDrivers(), loadBuses(), loadRoutes(), loadAssignments()]); }
  catch (error) { showMessage(error.message, 'error'); }
}

async function createBus() {
  const bus_number = $('newBusNumber').value.trim(); const bus_name = $('newBusName').value.trim();
  if (!bus_number || !bus_name) { showMessage('Enter bus number and name', 'error'); return; }
  try { await api('/admin/buses', { method: 'POST', body: JSON.stringify({ bus_number, bus_name, bus_type: $('newBusType').value, capacity: parseInt($('newBusCapacity').value, 10) || 40 }) }); $('newBusNumber').value = ''; $('newBusName').value = ''; showMessage('Bus created successfully', 'success'); await loadBuses(); }
  catch (error) { showMessage(error.message, 'error'); }
}

function renderStops() {
  $('stopsList').innerHTML = stopsList.map((stop, index) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #334155;"><span>${index + 1}. ${escapeHtml(stop.stop_name)} (${stop.latitude}, ${stop.longitude})</span><button class="btn-danger" data-remove-stop="${index}">✕</button></div>`).join('');
}

function addStop(place) {
  stopsList.push({
    stop_name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    eta_minutes: parseInt($('newStopEta').value, 10) || 0,
  });
  $('newStopEta').value = '0';
  $('stopLocationSearch').value = '';
  $('locationResults').textContent = 'Stop added. Search for another location to add it to this route.';
  renderStops();
}

function showMapPreview(place) {
  const delta = 0.01;
  const bbox = `${place.longitude - delta},${place.latitude - delta},${place.longitude + delta},${place.latitude + delta}`;
  const map = $('stopMapPreview');
  map.src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${place.latitude}%2C${place.longitude}`;
  map.classList.remove('hidden');
}

async function searchStopLocations() {
  const query = $('stopLocationSearch').value.trim();
  if (query.length < 3) { showMessage('Enter at least 3 characters to search.', 'error'); return; }
  const results = $('locationResults');
  results.textContent = 'Searching locations…';
  try {
    const { results: places } = await api(`/admin/geocode?query=${encodeURIComponent(query)}`);
    if (!places.length) { results.textContent = 'No locations found. Try a more specific search.'; return; }
    results.innerHTML = places.map((place, index) => `<button class="btn-primary" type="button" data-location-index="${index}" style="display:block;width:100%;margin:6px 0;text-align:left;">${escapeHtml(place.name)}</button>`).join('');
    results._places = places;
  } catch (error) { results.textContent = ''; showMessage(error.message, 'error'); }
}

function selectLocation(index) {
  const place = $('locationResults')._places?.[index];
  if (!place) return;
  showMapPreview(place);
  addStop(place);
}

async function createRoute() {
  const route_name = $('newRouteName').value.trim(); const start_location = $('newRouteStart').value.trim(); const end_location = $('newRouteEnd').value.trim();
  if (!route_name || !start_location || !end_location) { showMessage('Enter route name, start and end locations', 'error'); return; }
  try { await api('/admin/routes', { method: 'POST', body: JSON.stringify({ route_name, start_location, end_location, stops: stopsList }) }); ['newRouteName', 'newRouteStart', 'newRouteEnd'].forEach((id) => { $(id).value = ''; }); stopsList = []; renderStops(); showMessage('Route created successfully', 'success'); await loadRoutes(); }
  catch (error) { showMessage(error.message, 'error'); }
}

async function assignBus() {
  const driver_id = parseInt($('assignDriver').value, 10); const bus_id = parseInt($('assignBus').value, 10); const route_id = $('assignRoute').value ? parseInt($('assignRoute').value, 10) : null;
  if (!driver_id || !bus_id) { showMessage('Select a driver and a bus', 'error'); return; }
  try { await api('/admin/assign', { method: 'POST', body: JSON.stringify({ driver_id, bus_id, route_id }) }); showMessage('Bus assigned to driver successfully', 'success'); await Promise.all([loadBuses(), loadAssignments()]); }
  catch (error) { showMessage(error.message, 'error'); }
}

async function removeAssignment(id) {
  if (!window.confirm('Remove this assignment?')) return;
  try { await api(`/admin/assignments/${id}`, { method: 'DELETE' }); showMessage('Assignment removed', 'success'); await Promise.all([loadBuses(), loadAssignments()]); }
  catch (error) { showMessage(error.message, 'error'); }
}

async function deactivateRoute(id, name) {
  if (!window.confirm(`Deactivate the route “${name}”? It will be hidden from active route assignments while preserving all trip and GPS history.`)) return;
  try {
    await api(`/admin/routes/${id}`, { method: 'DELETE' });
    showMessage('Route deactivated successfully.', 'success');
    await Promise.all([loadRoutes(), loadBuses(), loadAssignments()]);
  } catch (error) { showMessage(error.message, 'error'); }
}

async function reactivateRoute(id, name) {
  if (!window.confirm(`Reactivate the route “${name}”?`)) return;
  try {
    await api(`/admin/routes/${id}/reactivate`, { method: 'PATCH' });
    showMessage('Route reactivated successfully.', 'success');
    await Promise.all([loadRoutes(), loadBuses(), loadAssignments()]);
  } catch (error) { showMessage(error.message, 'error'); }
}

async function forceDeleteRoute(id, name) {
  const warningText = `⚠️ PERMANENTLY DELETE ROUTE?\n\nRoute: ${name}\n\nThis will permanently delete:\n• The route definition\n• All stops associated with this route\n• All trip records associated with this route\n• GPS/location history associated with those trips\n\nThis action CANNOT be undone.\n\nAre you sure you want to permanently delete this route?`;
  if (!window.confirm(warningText)) return;
  try {
    await api(`/admin/routes/${id}?force=true`, { method: 'DELETE' });
    showMessage('Route permanently deleted.', 'success');
    await Promise.all([loadRoutes(), loadBuses(), loadAssignments()]);
  } catch (error) { showMessage(error.message, 'error'); }
}

$('loginButton').addEventListener('click', login);
$('logoutButton').addEventListener('click', logout);
$('createBusButton').addEventListener('click', createBus);
$('searchStopButton').addEventListener('click', searchStopLocations);
$('createRouteButton').addEventListener('click', createRoute);
$('assignBusButton').addEventListener('click', assignBus);
$('loginPassword').addEventListener('keydown', (event) => { if (event.key === 'Enter') login(); });
$('stopLocationSearch').addEventListener('keydown', (event) => { if (event.key === 'Enter') searchStopLocations(); });
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));
document.addEventListener('click', (event) => {
  const assignment = event.target.closest('[data-remove-assignment]');
  const stop = event.target.closest('[data-remove-stop]');
  const deactivate = event.target.closest('[data-deactivate-route]');
  const reactivate = event.target.closest('[data-reactivate-route]');
  const forceDelete = event.target.closest('[data-force-delete-route]');
  const location = event.target.closest('[data-location-index]');
  if (assignment) removeAssignment(Number(assignment.dataset.removeAssignment));
  if (stop) { stopsList.splice(Number(stop.dataset.removeStop), 1); renderStops(); }
  if (deactivate) deactivateRoute(Number(deactivate.dataset.deactivateRoute), decodeURIComponent(deactivate.dataset.routeName));
  if (reactivate) reactivateRoute(Number(reactivate.dataset.reactivateRoute), decodeURIComponent(reactivate.dataset.routeName));
  if (forceDelete) forceDeleteRoute(Number(forceDelete.dataset.forceDeleteRoute), decodeURIComponent(forceDelete.dataset.routeName));
  if (location) selectLocation(Number(location.dataset.locationIndex));
});

(async () => {
  if (!token) return;
  try { const data = await api('/auth/me'); if (data.user.role !== 'ADMIN') throw new Error('Not an admin'); $('adminName').textContent = data.user.name; showDashboard(); await loadAll(); }
  catch { logout(); }
})();
