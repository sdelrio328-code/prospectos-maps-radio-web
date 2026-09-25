// Licencias para la versión web (iPhone/navegador). Mismo formato y misma llave pública que escritorio/licencia.py.
// En el navegador no hay MachineGuid: el "ID de este equipo" se crea al azar la primera vez y se guarda en localStorage.
// ponytail: el código web es visible; alguien con conocimientos podría quitar esta verificación. Frena al usuario común.
(function (global) {
  const LLAVE_PUBLICA = '5feadc06a3730550981439dff0f39bda844aa90abc3bd80f9d6dffde04a8a1cd';
  const POR_EQUIPO = 1, SUSCRIPCION = 2;
  const EPOCA = Date.UTC(2024, 0, 1);
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  const hex = h => Uint8Array.from(h.match(/../g), b => parseInt(b, 16));
  const pad = n => String(n).padStart(2, '0');
  const fechaTexto = d => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  // "Hoy" como fecha UTC a medianoche, para comparar días igual que Python (dt.date.today()).
  const hoyUTC = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); };

  function b32encode(bytes) {
    let bits = 0, val = 0, out = '';
    for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
    if (bits > 0) out += B32[(val << (5 - bits)) & 31];
    return out;
  }
  function b32decode(s) {
    let bits = 0, val = 0; const out = [];
    for (const ch of s) {
      const i = B32.indexOf(ch); if (i < 0) throw new Error('b32');
      val = (val << 5) | i; bits += 5;
      if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
    }
    return Uint8Array.from(out);
  }

  const storage = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  function idEquipo() {
    let id = storage.get('pmr_equipo');
    if (!id || !/^[0-9a-f]{16}$/.test(id)) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
      storage.set('pmr_equipo', id);
    }
    return hex(id);
  }
  function idTexto(bytes = idEquipo()) {
    const s = b32encode(bytes);
    return `${s.slice(0, 5)}-${s.slice(5, 10)}-${s.slice(10)}`;
  }

  // Devuelve {datos} o {error}, igual que licencia.verificar() en Python.
  function verificar(clave, equipo = idEquipo(), hoy = hoyUTC(), llave = hex(LLAVE_PUBLICA)) {
    let crudo;
    try {
      let s = clave.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (s.startsWith('PMR')) s = s.slice(3);
      crudo = b32decode(s);
    } catch (e) { crudo = new Uint8Array(0); }
    const datos = crudo.slice(0, 12), firma = crudo.slice(12);
    const invalida = { error: 'La clave no es válida. Revisa que la hayas copiado completa.' };
    if (firma.length !== 64 || !nacl.sign.detached.verify(datos, firma, llave)) return invalida;
    const [version, tipo] = datos;
    if (version !== 1 || (tipo !== POR_EQUIPO && tipo !== SUSCRIPCION)) return invalida;
    const para = datos.slice(2, 10);
    if (para.some(b => b) && para.some((b, i) => b !== equipo[i]))
      return { error: 'Esta clave es para otro equipo. Pide una clave para el ID de este equipo.' };
    const dias = (datos[10] << 8) | datos[11];
    const vence = dias ? new Date(EPOCA + dias * 86400000) : null;
    if (vence && hoy > vence.getTime())
      return { error: `Esta clave venció el ${fechaTexto(vence)}. Pide una clave nueva para renovar.` };
    return { datos: { tipo, vence } };
  }

  function descripcion(d) {
    return d.tipo === SUSCRIPCION ? `Suscripción vigente hasta el ${fechaTexto(d.vence)}` : 'Licencia permanente para este equipo';
  }

  // Licencia guardada en este navegador: {ok, datos} o {ok:false, mensaje}.
  function estado() {
    const clave = storage.get('pmr_clave');
    if (!clave) return { ok: false, mensaje: '' };
    const hoy = hoyUTC(), ultima = Number(storage.get('pmr_ultima') || hoy);
    if (hoy < ultima - 86400000) return { ok: false, mensaje: 'La fecha de este equipo parece incorrecta. Corrígela y vuelve a abrir la app.' };
    const r = verificar(clave);
    if (r.error) return { ok: false, mensaje: r.error };
    storage.set('pmr_ultima', String(Math.max(hoy, ultima)));
    return { ok: true, datos: r.datos };
  }

  function activar(clave) {
    const r = verificar(clave);
    if (r.error) return { ok: false, mensaje: r.error };
    storage.set('pmr_clave', clave);
    storage.set('pmr_ultima', String(hoyUTC()));
    return { ok: true, mensaje: `¡Listo! ${descripcion(r.datos)}.` };
  }

  global.PMR = { idTexto, verificar, estado, activar, descripcion, _b32decode: b32decode };
})(typeof window !== 'undefined' ? window : globalThis);
