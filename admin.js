(() => {
  const C = window.CASA_CONFIG;
  const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey);
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let rows = [], tab = 'pending';
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

  const toast = (t, bad) => {
    const el = $('#toast'); el.textContent = t; el.classList.toggle('bad', !!bad); el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 3200);
  };

  /* ---------- Auth ---------- */
  async function boot() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return showLogin();
    const { data: ok, error } = await sb.rpc('casa_is_admin');
    if (error || !ok) {
      await sb.auth.signOut();
      return showLogin('This account is not set up as a Casa Poblacion admin.');
    }
    $('#login').hidden = true; $('#app').hidden = false; $('#who').hidden = false;
    $('#whoEmail').textContent = session.user.email;
    load();
  }
  function showLogin(err) {
    $('#app').hidden = true; $('#who').hidden = true; $('#login').hidden = false;
    $('#lErr').textContent = err || '';
  }
  $('#login').addEventListener('submit', async e => {
    e.preventDefault();
    const b = $('#lBtn'); b.disabled = true; b.textContent = 'Signing in…'; $('#lErr').textContent = '';
    const { error } = await sb.auth.signInWithPassword({ email: $('#lEmail').value.trim(), password: $('#lPass').value });
    b.disabled = false; b.textContent = 'Sign in';
    if (error) return ($('#lErr').textContent = 'Incorrect email or password.');
    $('#lPass').value = '';
    boot();
  });
  $('#outBtn').onclick = async () => { await sb.auth.signOut(); rows = []; showLogin(); };

  /* ---------- Data ---------- */
  async function load() {
    const { data, error } = await sb.from('casa_bookings').select('*').order('event_date', { ascending: true }).order('created_at', { ascending: true });
    if (error) return toast('Could not load bookings: ' + error.message, true);
    rows = data; render();
  }

  async function update(id, patch, btn) {
    if (btn) btn.disabled = true;
    const { data, error } = await sb.from('casa_bookings').update(patch).eq('id', id).select().single();
    if (btn) btn.disabled = false;
    if (error) return toast(error.message.includes('approved booking') ? 'That date/slot already has an approved booking.' : error.message, true);
    rows = rows.map(r => r.id === id ? data : r);
    render();
    toast(patch.status ? `Marked as ${patch.status}.` : 'Note saved.');
  }

  /* ---------- Render ---------- */
  const fmt = d => {
    const x = new Date(d + 'T00:00:00');
    return { day: x.getDate(), rest: x.toLocaleDateString('en-US', { weekday: 'short', month: 'short', year: 'numeric' }) };
  };
  const clashes = r => rows.filter(o => o.id !== r.id && o.status === 'approved' && o.event_date === r.event_date &&
    (o.slot === r.slot || o.slot === 'Whole day' || r.slot === 'Whole day'));

  // Bookings matching the current tab, date range and search
  function visible() {
    const q = $('#q').value.trim().toLowerCase();
    const when = $('#when').value;
    const scoped = rows.filter(r => when === 'any' || (when === 'upcoming' ? r.event_date >= todayISO : r.event_date < todayISO));
    let list = scoped.filter(r => tab === 'all' || r.status === tab);
    if (q) list = list.filter(r => [r.full_name, r.phone, r.email, r.ref, r.event_type].join(' ').toLowerCase().includes(q));
    if (when === 'past') list.reverse();
    return { scoped, list, when };
  }

  function render() {
    const { scoped, list, when } = visible();
    document.querySelectorAll('#tabs button').forEach(b => {
      const s = b.dataset.s;
      b.querySelector('b').textContent = scoped.filter(r => s === 'all' || r.status === s).length || '';
      b.classList.toggle('on', s === tab);
    });

    $('#list').innerHTML = list.length ? list.map(r => {
      const d = fmt(r.event_date);
      const tel = r.phone.replace(/[^\d+]/g, '');
      const clash = r.status !== 'approved' && clashes(r).length;
      return `<article class="card">
        <div class="date"><b>${d.day}</b><span>${esc(d.rest)}</span><em>${esc(r.slot)}</em></div>
        <div class="info">
          <h3>${esc(r.full_name)}</h3>
          <div class="meta">
            <span>${esc(r.event_type)}${r.guests ? ' · ' + r.guests + ' guests' : ''}${r.package ? ' · ' + esc(r.package) : ''}</span>
            <a href="tel:${esc(tel)}">${esc(r.phone)}</a>
            <a href="sms:${esc(tel)}">Text</a>
            ${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : ''}
          </div>
          ${r.message ? `<div class="msg">${esc(r.message)}</div>` : ''}
          <div class="note"><input data-note="${r.id}" value="${esc(r.admin_note)}" placeholder="Private note (deposit, package agreed…)" maxlength="500"><button data-save="${r.id}">Save</button></div>
          <div class="small" style="margin-top:8px">Ref ${esc(r.ref)} · requested ${new Date(r.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}${clash ? ' · <strong style="color:#a5432f">clashes with an approved booking</strong>' : ''}</div>
        </div>
        <div class="side">
          <span class="pill ${r.status}">${r.status}</span>
          ${r.status !== 'approved' ? `<button class="act ok" data-id="${r.id}" data-s="approved" ${clash ? 'disabled title="Slot already taken"' : ''}>Approve</button>` : ''}
          ${r.status === 'pending' ? `<button class="act no" data-id="${r.id}" data-s="declined">Decline</button>` : ''}
          ${r.status === 'approved' ? `<button class="act no" data-id="${r.id}" data-s="cancelled">Cancel booking</button>` : ''}
          ${r.status !== 'pending' ? `<button class="act" data-id="${r.id}" data-s="pending">Back to pending</button>` : ''}
        </div>
      </article>`;
    }).join('') : `<div class="empty">No ${tab === 'all' ? '' : tab + ' '}requests ${when === 'past' ? 'in the past' : when === 'upcoming' ? 'for upcoming dates' : ''}.</div>`;
  }

  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.s; render(); } });
  $('#q').addEventListener('input', render);
  $('#when').addEventListener('change', render);
  $('#list').addEventListener('click', e => {
    const a = e.target.closest('button[data-s]');
    if (a) {
      if (a.dataset.s === 'cancelled' && !confirm('Cancel this approved booking? The date will open up again on the website.')) return;
      return update(a.dataset.id, { status: a.dataset.s }, a);
    }
    const s = e.target.closest('button[data-save]');
    if (s) update(s.dataset.save, { admin_note: document.querySelector(`[data-note="${s.dataset.save}"]`).value.trim() || null }, s);
  });

  /* ---------- Export to Excel ---------- */
  $('#exportBtn').addEventListener('click', () => {
    if (!window.XLSX) return toast('Excel tool is still loading — try again in a moment.', true);
    const { list, when } = visible();
    if (!list.length) return toast('No bookings to export for this view.', true);
    const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const data = list.map(r => ({
      'Reference': r.ref,
      'Event date': toDate(r.event_date),
      'Day': toDate(r.event_date).toLocaleDateString('en-US', { weekday: 'long' }),
      'Time slot': r.slot,
      'Status': r.status[0].toUpperCase() + r.status.slice(1),
      'Name': r.full_name,
      'Mobile': r.phone,
      'Email': r.email || '',
      'Occasion': r.event_type,
      'Guests': r.guests ?? '',
      'Interested in': r.package || '',
      'Guest message': r.message || '',
      'Admin note': r.admin_note || '',
      'Requested on': new Date(r.created_at),
      'Last updated': new Date(r.updated_at),
    }));
    const ws = XLSX.utils.json_to_sheet(data, { cellDates: true, dateNF: 'dd-mmm-yyyy' });
    // Date formats + readable column widths
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = 1; R <= range.e.r; R++) {
      ['B', 'N', 'O'].forEach((col, i) => {
        const c = ws[col + (R + 1)]; if (c && c.t === 'd') c.z = i === 0 ? 'ddd, dd-mmm-yyyy' : 'dd-mmm-yyyy hh:mm';
      });
    }
    ws['!cols'] = [14, 20, 11, 11, 11, 24, 16, 26, 18, 8, 26, 50, 36, 18, 18].map(w => ({ wch: w }));
    ws['!autofilter'] = { ref: ws['!ref'] };
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bookings');
    const label = `${tab === 'all' ? 'all' : tab}-${when}`;
    XLSX.writeFile(wb, `casa-poblacion-bookings-${label}-${todayISO}.xlsx`, { cellDates: true });
    toast(`Exported ${list.length} booking${list.length === 1 ? '' : 's'}.`);
  });

  /* ---------- Views: Bookings / Team ---------- */
  $('#views').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#views button').forEach(x => x.classList.toggle('on', x === b));
    const team = b.dataset.v === 'team';
    $('#teamView').hidden = !team; $('#bookView').hidden = team;
    if (team) loadTeam();
  });

  /* ---------- Team (admin users) ---------- */
  const teamCall = async body => {
    const { data, error } = await sb.functions.invoke('casa-admin-users', { body });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (_) {}
      throw new Error(msg);
    }
    return data;
  };

  async function loadTeam() {
    const ul = $('#adminList');
    try {
      const { admins, me } = await teamCall({ action: 'list' });
      ul.innerHTML = admins.map(a => `<li>
        <div><b>${esc(a.email)}</b>${a.email === me ? '<span class="you">You</span>' : ''}
          <div class="small">Added ${new Date(a.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}${a.added_by ? ' by ' + esc(a.added_by) : ''}</div></div>
        ${a.email !== me ? `<button data-rm="${esc(a.email)}">Remove</button>` : ''}
      </li>`).join('');
    } catch (err) { ul.innerHTML = `<li class="small">Couldn't load users: ${esc(err.message)}</li>`; }
  }

  $('#genPw').addEventListener('click', () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const a = new Uint32Array(12); crypto.getRandomValues(a);
    $('#aPass').value = [...a].map(n => chars[n % chars.length]).join('');
  });

  $('#addForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#aEmail').value.trim(), password = $('#aPass').value;
    const btn = $('#aBtn'); $('#aErr').textContent = '';
    btn.disabled = true; btn.textContent = 'Adding…';
    try {
      const r = await teamCall({ action: 'add', email, password });
      toast(r.existing ? `${email} added — they sign in with their existing password.` : `${email} added. Share the password with them privately.`);
      $('#aEmail').value = ''; $('#aPass').value = '';
      loadTeam();
    } catch (err) { $('#aErr').textContent = err.message; }
    finally { btn.disabled = false; btn.textContent = 'Add user'; }
  });

  $('#adminList').addEventListener('click', async e => {
    const b = e.target.closest('button[data-rm]'); if (!b) return;
    if (!confirm(`Remove admin access for ${b.dataset.rm}?`)) return;
    b.disabled = true;
    try { await teamCall({ action: 'remove', email: b.dataset.rm }); toast('Access removed.'); loadTeam(); }
    catch (err) { b.disabled = false; toast(err.message, true); }
  });

  // Refresh when returning to the tab
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#app').hidden) load(); });
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') showLogin(); });
  boot();
})();
