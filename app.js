import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://lxhzwabjznyjxtmhkcks.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rU91uxmbRe7PjUVFleupgg_M5579an6';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (icon, title) => Swal.fire({ toast: true, position: 'top-end', icon, title, timer: 3500, showConfirmButton: false });
const ask = async t => (await Swal.fire({ title: t, icon: 'question', showCancelButton: true, confirmButtonText: 'Sí', cancelButtonText: 'No' })).isConfirmed;
const fmt = d => new Date(d).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

const BADGE = {
  CONFIRMADA: 'bg-emerald-100 text-emerald-800',
  DEVUELTA: 'bg-blue-100 text-blue-800',
  CANCELADA: 'bg-slate-200 text-slate-700'
};

const badge = e => `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[e] || ''}">${e}</span>`;

function btn(a, id, txt, c = 'primary') {
  const styles = {
    primary: 'bg-teal-700 text-white hover:bg-teal-800',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
    info: 'bg-blue-600 text-white hover:bg-blue-700',
    outline: 'border border-slate-400 hover:bg-slate-100'
  };
  const cls = styles[c] || styles.primary;
  return `<button data-a="${a}" data-id="${id}" class="px-3 py-1 rounded-lg text-sm ${cls}">${txt}</button>`;
}

function table(heads, rows) {
  const thead = heads.map(h => `<th class="p-3">${h}</th>`).join('');
  const tbody = rows.length > 0
    ? rows.join('')
    : `<tr><td class="p-4 text-slate-500" colspan="${heads.length}">Sin registros.</td></tr>`;
  return `<div class="overflow-x-auto bg-white rounded-xl shadow"><table class="w-full text-sm text-left"><thead class="bg-slate-100"><tr>${thead}</tr></thead><tbody class="divide-y">${tbody}</tbody></table></div>`;
}

const iso = v => new Date(v).toISOString();
const localMin = () => {
  const d = new Date(Date.now() + 24 * 3600e3 + 60e3);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

let me = null, current = 'reservar', cache = {}, range = null;
const isStaff = () => ['ADMIN', 'SOPORTE'].includes(me?.rol);

/* ---------- Autenticación ---------- */
async function auth(mode) {
  let username = $('#u').value.trim().toLowerCase();
  const password = $('#p').value;
  const nombre = $('#n').value.trim();
  const rol = $('#r') ? $('#r').value : 'ESTUDIANTE';

  if (username.includes('@')) {
    username = username.split('@')[0];
  }

  username = username.replace(/[^a-z0-9_.]/g, '');

  if (!username || username.length < 3 || username.length > 30) {
    return Swal.fire('Usuario inválido', 'Usa entre 3 y 30 caracteres (letras minúsculas, números, _ o .). Evita espacios y arrobas.', 'warning');
  }
  if (!password || password.length < 6) {
    return Swal.fire('Contraseña inválida', 'Debe tener al menos 6 caracteres.', 'warning');
  }

  const email = `${username}@reservalab.com`;

  if (mode === 'signup') {
    if (!nombre) return Swal.fire('Nombre requerido', 'Ingresa tu nombre completo para completar el registro.', 'warning');

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { 
        data: { 
          username, 
          nombre_completo: nombre,
          rol: rol
        } 
      }
    });

    $('#p').value = '';
    if (error) return Swal.fire('Error de registro', error.message, 'error');

    if (data.user && !data.session) {
      return Swal.fire('Registro exitoso', `Cuenta de ${rol} creada exitosamente. Ya puedes iniciar sesión.`, 'success');
    }

    toast('success', `Registro de ${rol} completado`);
  } else {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    $('#p').value = '';
    if (error) return Swal.fire('Error al iniciar sesión', error.message, 'error');
  }
}

$('#login').onclick = () => auth('login');
$('#signup').onclick = () => auth('signup');
$('#logout').onclick = async () => { await sb.auth.signOut(); };

/* ---------- Carga e Inicio del Sistema ---------- */
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  $('#auth').classList.toggle('hidden', !!session);
  $('#app').classList.toggle('hidden', !session);
  if (!session) {
    me = null;
    return;
  }

  let { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();

  if (!profile) {
    const meta = session.user.user_metadata || {};
    const fallbackUsername = meta.username || session.user.email.split('@')[0];
    const fallbackNombre = meta.nombre_completo || fallbackUsername;
    const fallbackRol = meta.rol || 'ESTUDIANTE';

    const { data: newProfile, error: insertErr } = await sb.from('profiles').upsert({
      id: session.user.id,
      username: fallbackUsername,
      nombre_completo: fallbackNombre,
      rol: fallbackRol
    }).select().maybeSingle();

    if (insertErr || !newProfile) {
      await sb.auth.signOut();
      return Swal.fire('Error de Perfil', 'No se pudo generar la información del perfil.', 'error');
    }
    profile = newProfile;
  }

  me = profile;
  $('#who').textContent = me.nombre_completo;
  $('#rol').textContent = me.rol;
  document.querySelectorAll('[data-staff]').forEach(e => e.classList.toggle('hidden', !isStaff()));

  if (['admin', 'inventario'].includes(current) && !isStaff()) {
    current = 'reservar';
  }
  go(current);
}

/* ---------- Navegación ---------- */
document.querySelectorAll('.nav').forEach(b => b.onclick = () => go(b.dataset.v));
async function go(v) {
  if (['admin', 'inventario'].includes(v) && !isStaff()) {
    return Swal.fire('Acceso denegado', 'No tienes permisos para acceder a este módulo.', 'error');
  }
  current = v;
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('border-b-2', b.dataset.v === v));
  await ({ reservar: vReservar, calendario: vCalendario, mis: vMis, admin: vAdmin, inventario: vInventario }[v])();
}

/* ---------- Vista: Reservar ---------- */
async function vReservar() {
  $('#view').innerHTML = `<div class="flex flex-wrap gap-3 items-end mb-4">
    <label class="text-sm">Inicio<input id="fi" type="datetime-local" min="${localMin()}" class="block border rounded-lg px-2 py-1"></label>
    <label class="text-sm">Fin<input id="ff" type="datetime-local" min="${localMin()}" class="block border rounded-lg px-2 py-1"></label>
    ${btn('buscar', 0, 'Buscar equipos disponibles')}</div>
    <p class="text-xs text-slate-500 mb-3">Las reservas requieren al menos 24 horas de anticipación (máximo 8 horas por reserva).</p>
    <div id="cards" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"></div>`;
  if (range) { $('#fi').value = range[0]; $('#ff').value = range[1]; buscar(); }
}

async function buscar() {
  const fi = $('#fi').value, ff = $('#ff').value;
  if (!fi || !ff) return Swal.fire('Fechas requeridas', 'Selecciona inicio y fin.', 'warning');
  if (new Date(ff) <= new Date(fi)) return Swal.fire('Rango inválido', 'El fin debe ser posterior al inicio.', 'warning');
  range = [fi, ff];
  const { data, error } = await sb.rpc('obtener_equipos_disponibles', { p_fecha_inicio: iso(fi), p_fecha_fin: iso(ff) });
  if (error) return Swal.fire('Error', error.message, 'error');
  (data || []).forEach(e => cache[e.id] = e);
  
  if (!data || data.length === 0) {
    $('#cards').innerHTML = '<p class="text-slate-500">No hay equipos disponibles en ese rango. Prueba otro horario.</p>';
    return;
  }

  $('#cards').innerHTML = data.map(e => `<article class="bg-white rounded-xl shadow p-4 space-y-2">
    <h3 class="font-semibold">${esc(e.nombre_personalizado)}</h3>
    <p class="text-sm text-slate-600">${esc(e.procesador || '—')} · ${e.ram_gb ?? '—'} GB RAM · ${esc(e.almacenamiento || '—')}</p>
    <p class="text-xs text-slate-500">${esc(e.ubicacion || '')}</p>
    <div class="flex gap-2">${btn('ficha', e.id, 'Ficha técnica', 'outline')}${btn('reservar', e.id, 'Reservar')}</div></article>`).join('');
}

function ficha(id) {
  const e = cache[id];
  const rows = [['Código', e.codigo], ['Marca', e.marca], ['Modelo', e.modelo], ['CPU', e.procesador], ['RAM', e.ram_gb ? e.ram_gb + ' GB' : ''], ['Disco', e.almacenamiento], ['GPU', e.grafica_gpu], ['Pantalla', e.pantalla_pulgadas ? e.pantalla_pulgadas + '"' : ''], ['SO', e.sistema_operativo], ['Notas', e.notas_tecnicas]];
  const listHtml = rows.map(([k, v]) => `<dt class="font-medium">${k}</dt><dd class="col-span-2">${esc(v || '—')}</dd>`).join('');
  Swal.fire({ title: esc(e.nombre_personalizado), html: `<dl class="text-left grid grid-cols-3 gap-1 text-sm">${listHtml}</dl>` });
}

async function reservar(id) {
  const { value: prop } = await Swal.fire({ title: 'Propósito académico', input: 'textarea', inputPlaceholder: 'Ej.: práctica de laboratorio', showCancelButton: true, confirmButtonText: 'Confirmar Reserva', inputValidator: v => !v.trim() && 'Describe el propósito.' });
  if (!prop) return;
  const { data, error } = await sb.rpc('crear_reserva_segura', { p_equipo_id: +id, p_fecha_inicio: iso(range[0]), p_fecha_fin: iso(range[1]), p_proposito: prop.trim() });
  if (error || !data.success) return Swal.fire('No se pudo reservar', error?.message || data.message, 'error');
  toast('success', 'Reserva confirmada'); buscar();
}

/* ---------- Vista: Calendario ---------- */
async function vCalendario() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  $('#view').innerHTML = `<label class="text-sm font-medium">Seleccionar día: <input id="dia" type="date" value="${d.toISOString().slice(0, 10)}" class="border rounded-lg px-2 py-1 ml-1"></label>
    <div id="grid" class="mt-4 overflow-x-auto"></div>
    <p class="text-xs mt-3 flex gap-4"><span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-emerald-200 border border-emerald-400"></span> Libre</span> <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-red-300 border border-red-400"></span> Reservado</span></p>`;
  $('#dia').onchange = drawGrid; drawGrid();
}

async function drawGrid() {
  const s = new Date($('#dia').value + 'T00:00:00'), e = new Date(s.getTime() + 864e5);
  const [{ data: eq }, { data: oc }] = await Promise.all([
    sb.from('equipos').select('id,nombre_personalizado').eq('estado', 'ACTIVO').order('nombre_personalizado'),
    sb.rpc('obtener_ocupacion', { p_inicio: s.toISOString(), p_fin: e.toISOString() })]);
  const hrs = Array.from({ length: 14 }, (_, i) => i + 7);
  
  const headerCols = hrs.map(h => `<th class="p-2 border-b text-center min-w-[50px]">${String(h).padStart(2, '0')}:00</th>`).join('');
  
  const bodyRows = (eq || []).map(q => {
    const cells = hrs.map(h => {
      const a = new Date(s).setHours(h, 0, 0, 0), b = a + 36e5;
      const r = (oc || []).find(o => o.equipo_id === q.id && new Date(o.fecha_inicio) < b && new Date(o.fecha_fin) > a);
      const cellColor = r ? 'bg-red-300' : 'bg-emerald-200 hover:bg-emerald-300';
      const title = r ? `Reservado (${fmt(r.fecha_inicio)} - ${fmt(r.fecha_fin)})` : 'Disponible';
      return `<td class="p-0 border border-slate-100 text-center"><div class="h-8 ${cellColor} transition-colors" title="${title}"></div></td>`;
    }).join('');
    return `<tr><td class="p-2 whitespace-nowrap font-medium border-r border-b">${esc(q.nombre_personalizado)}</td>${cells}</tr>`;
  }).join('');

  $('#grid').innerHTML = `<table class="text-xs bg-white rounded-xl shadow border border-slate-200"><thead><tr class="bg-slate-100"><th class="p-2 text-left border-b">Equipo</th>${headerCols}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

/* ---------- Vista: Mis Reservas ---------- */
async function vMis() {
  const { data } = await sb.from('reservas').select('*,equipos(nombre_personalizado)').eq('usuario_id', me.id).order('fecha_inicio', { ascending: false });
  const rows = (data || []).map(r => {
    const isConfirmed = r.estado === 'CONFIRMADA';
    const actions = isConfirmed ? `
      <div class="flex gap-1">
        ${btn('devolver', r.id, 'Devolver', 'info')}
        ${btn('cancelar-propia', r.id, 'Cancelar', 'danger')}
      </div>` : '';
    return `<tr><td class="p-3 font-medium">${esc(r.equipos?.nombre_personalizado)}</td><td class="p-3">${fmt(r.fecha_inicio)}</td><td class="p-3">${fmt(r.fecha_fin)}</td><td class="p-3">${esc(r.proposito)}</td><td class="p-3">${badge(r.estado)}</td><td class="p-3">${actions}</td></tr>`;
  });
  $('#view').innerHTML = table(['Equipo', 'Inicio', 'Fin', 'Propósito', 'Estado', 'Acciones'], rows);
}

/* ---------- Vista: Administración ---------- */
async function vAdmin() {
  const { data } = await sb.from('reservas').select('*,equipos(nombre_personalizado),profiles(username,nombre_completo)').order('fecha_inicio', { ascending: false });
  const rows = (data || []).map(r => {
    const isConfirmed = r.estado === 'CONFIRMADA';
    const actions = isConfirmed ? `
      <div class="flex gap-1">
        ${btn('devolver', r.id, 'Devolver', 'info')}
        ${btn('CANCELADA', r.id, 'Cancelar', 'danger')}
      </div>` : '';
    return `<tr><td class="p-3">${esc(r.profiles?.nombre_completo)}<div class="text-xs text-slate-500">@${esc(r.profiles?.username)}</div></td><td class="p-3">${esc(r.equipos?.nombre_personalizado)}</td><td class="p-3">${fmt(r.fecha_inicio)}<br>${fmt(r.fecha_fin)}</td><td class="p-3">${esc(r.proposito)}</td><td class="p-3">${badge(r.estado)}</td><td class="p-3">${actions}</td></tr>`;
  });
  $('#view').innerHTML = table(['Usuario', 'Equipo', 'Horario', 'Propósito', 'Estado', 'Acciones'], rows);
}

async function devolverEquipo(id) {
  if (!await ask('¿Confirmas que el equipo ha sido devuelto?')) return;
  const { data, error } = await sb.rpc('devolver_reserva', { p_reserva_id: +id });
  if (error || !data.success) {
    return Swal.fire('Error', error?.message || data.message, 'error');
  }
  toast('success', 'Equipo marcado como devuelto');
  go(current);
}

async function setEstado(id, estado) {
  if (!await ask(`¿Deseas cancelar esta reserva?`)) return;
  const { error } = await sb.from('reservas').update({ estado }).eq('id', id);
  error ? Swal.fire('Error', error.message, 'error') : (toast('success', 'Reserva cancelada'), go(current));
}

/* ---------- Vista: Inventario ---------- */
const F = [['codigo', 'Código'], ['nombre_personalizado', 'Nombre'], ['marca', 'Marca'], ['modelo', 'Modelo'], ['serial', 'Serial'], ['ubicacion', 'Ubicación'], ['procesador', 'CPU'], ['ram_gb', 'RAM (GB)', 'number'], ['almacenamiento', 'Disco'], ['grafica_gpu', 'GPU'], ['pantalla_pulgadas', 'Pantalla (")', 'number'], ['sistema_operativo', 'SO'], ['notas_tecnicas', 'Notas']];
let catFilter = '', cats = [];

async function vInventario() {
  const [{ data }, { data: c }] = await Promise.all([sb.from('equipos').select('*,categorias(nombre)').order('codigo'), sb.from('categorias').select('*').order('nombre')]);
  cats = c || [];
  (data || []).forEach(e => cache[e.id] = e);
  const list = (data || []).filter(e => !catFilter || String(e.categoria_id) === catFilter);
  const rows = list.map(e => {
    const opts = ['ACTIVO', 'INACTIVO', 'FUERA_SERVICIO'].map(s => `<option ${s === e.estado ? 'selected' : ''}>${s}</option>`).join('');
    return `<tr><td class="p-3 font-medium">${esc(e.codigo)}</td><td class="p-3">${esc(e.nombre_personalizado)}</td><td class="p-3">${esc(e.categorias?.nombre || '—')}</td><td class="p-3">${esc(e.procesador || '—')} · ${e.ram_gb ?? '—'} GB · ${esc(e.almacenamiento || '—')}</td><td class="p-3"><select data-est="${e.id}" class="border rounded px-1">${opts}</select></td><td class="p-3">${btn('equipo', e.id, 'Editar', 'outline')}</td></tr>`;
  });
  const catOpts = cats.map(k => `<option value="${k.id}" ${String(k.id) === catFilter ? 'selected' : ''}>${esc(k.nombre)}</option>`).join('');
  $('#view').innerHTML = `<div class="mb-3 flex flex-wrap gap-3 items-center">${btn('equipo', 0, '+ Nuevo equipo')} <select id="catf" class="border rounded-lg px-2 py-1 text-sm"><option value="">Todas las categorías</option>${catOpts}</select></div>` + table(['Código', 'Nombre', 'Categoría', 'Hardware', 'Estado', 'Acciones'], rows);
}

async function equipo(id) {
  const e = +id ? cache[id] : {};
  const catOptions = cats.map(k => `<option value="${k.id}" ${k.id === e.categoria_id ? 'selected' : ''}>${esc(k.nombre)}</option>`).join('');
  const fieldsHtml = F.map(([k, l, t]) => `<label>${l}<input id="f_${k}" type="${t || 'text'}" value="${esc(e[k])}" class="w-full border rounded px-2 py-1"></label>`).join('');

  const { value: v } = await Swal.fire({
    title: +id ? 'Editar equipo' : 'Nuevo equipo',
    width: 640,
    showCancelButton: true,
    confirmButtonText: 'Guardar',
    html: `<div class="grid grid-cols-2 gap-2 text-left text-sm">
      <label class="col-span-2">Categoría
        <select id="f_categoria_id" class="w-full border rounded px-2 py-1">
          <option value="">Sin categoría</option>
          ${catOptions}
        </select>
      </label>
      ${fieldsHtml}
    </div>`,
    preConfirm: () => {
      const o = {};
      F.forEach(([k, , t]) => {
        const val = $('#f_' + k).value.trim();
        o[k] = t === 'number' ? (val ? Number(val) : null) : (val || null);
      });
      const catVal = $('#f_categoria_id').value;
      o.categoria_id = catVal ? Number(catVal) : null;

      if (!o.codigo || !o.nombre_personalizado) {
        return Swal.showValidationMessage('Código y nombre son obligatorios.');
      }
      return o;
    }
  });
  if (!v) return;
  const { error } = +id ? await sb.from('equipos').update(v).eq('id', id) : await sb.from('equipos').insert(v);
  error ? Swal.fire('Error', error.message, 'error') : (toast('success', 'Equipo guardado'), vInventario());
}

/* ---------- Manejadores de Eventos Delegados ---------- */
$('#view').onclick = async ev => {
  const b = ev.target.closest('[data-a]'); if (!b) return;
  const { a, id } = b.dataset;
  if (a === 'buscar') buscar();
  else if (a === 'ficha') ficha(id);
  else if (a === 'reservar') reservar(id);
  else if (a === 'devolver') devolverEquipo(id);
  else if (a === 'equipo') equipo(id);
  else if (a === 'cancelar-propia') setEstado(id, 'CANCELADA');
  else setEstado(id, a);
};

$('#view').onchange = async ev => {
  if (ev.target.id === 'catf') { catFilter = ev.target.value; return vInventario(); }
  const s = ev.target.closest('[data-est]'); if (!s) return;
  const { error } = await sb.from('equipos').update({ estado: s.value }).eq('id', s.dataset.est);
  error ? Swal.fire('Error', error.message, 'error') : toast('success', 'Estado actualizado');
};

/* ---------- Escuchador de Autenticación Supabase ---------- */
sb.auth.onAuthStateChange((event) => {
  if (['SIGNED_IN', 'TOKEN_REFRESHED', 'SIGNED_OUT', 'INITIAL_SESSION'].includes(event)) {
    boot();
  }
});