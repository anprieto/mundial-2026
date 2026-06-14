/**
 * generate-ics.mjs
 * Corre en GitHub Actions cada 10 minutos.
 * Llama a Polymarket + openfootball, genera espana-mundial-2026.ics
 */

import fetch  from 'node-fetch';
import fs     from 'fs';

/* ── Helpers ─────────────────────────────────────────── */
const pad = n => String(n).padStart(2, '0');

/** Hora España (CEST, UTC+2) → UTC para ICS */
function toUTC(isoDate, timeESP) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [h, mi]   = timeESP.split(':').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, h - 2, mi)); // CEST = UTC+2
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth()+1)}${pad(dt.getUTCDate())}` +
         `T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00Z`;
}

function addHours(isoDate, timeESP, hours) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [h, mi]   = timeESP.split(':').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, h - 2 + hours, mi));
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth()+1)}${pad(dt.getUTCDate())}` +
         `T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00Z`;
}

function alarm(minBefore, desc) {
  const h = Math.floor(minBefore / 60), m = minBefore % 60;
  const dur = h ? `PT${h}H${m ? m + 'M' : ''}` : `PT${m}M`;
  return `BEGIN:VALARM\r\nTRIGGER:-${dur}\r\nACTION:DISPLAY\r\nDESCRIPTION:${desc}\r\nEND:VALARM`;
}

/* ── Fetch Polymarket ────────────────────────────────── */
async function fetchPolymarket(keyword) {
  try {
    const url = `https://gamma-api.polymarket.com/markets?keyword=${encodeURIComponent(keyword)}&limit=50&active=true`;
    const r   = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const markets = await r.json();

    // Filtrar mercados del Mundial 2026 con múltiples outcomes
    const wc = markets.filter(m => {
      const q  = (m.question || '').toLowerCase();
      const ok = (q.includes('2026') || (m.endDate || '').startsWith('2026'))
              && (q.includes('world cup') || q.includes('fifa') || q.includes('group'))
              && !m.closed;
      let outcomes = [];
      try { outcomes = JSON.parse(m.outcomes || '[]'); } catch {}
      return ok && outcomes.length > 2;
    });

    if (!wc.length) return null;
    wc.sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0));
    const best = wc[0];

    const outMap = new Map();
    const outcomes = JSON.parse(best.outcomes || '[]');
    const prices   = JSON.parse(best.outcomePrices || '[]');
    outcomes.forEach((o, i) => {
      const p = parseFloat(prices[i]);
      if (!isNaN(p)) outMap.set(o, Math.round(p * 100));
    });
    console.log(`  ✓ ${keyword}: ${best.question} (${outMap.size} outcomes)`);
    return outMap;
  } catch (e) {
    console.warn(`  ✗ ${keyword}: ${e.message}`);
    return null;
  }
}

/* ── Fetch openfootball results ──────────────────────── */
async function fetchResults() {
  try {
    const url = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
    const r   = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    console.log(`  ✓ openfootball: ${d.matches.filter(m => m.score).length} partidos con resultado`);
    return d.matches || [];
  } catch (e) {
    console.warn(`  ✗ openfootball: ${e.message}`);
    return [];
  }
}

/* ── Calcular probabilidades ─────────────────────────── */
function getTopCandidates(candidates, polyMap, subset) {
  return candidates.map(c => {
    let pct = c.fallback;
    if (polyMap && c.matchOutcome) {
      if (subset) {
        const total = subset.reduce((s, k) => s + (polyMap.get(k) || 0), 0);
        if (total > 0) pct = Math.round((polyMap.get(c.matchOutcome) || 0) / total * 100);
      } else {
        const raw = polyMap.get(c.matchOutcome);
        if (raw != null) pct = raw;
      }
    }
    return { ...c, pct };
  }).sort((a, b) => b.pct - a.pct);
}

/* ── Estructura de fases ─────────────────────────────── */
const PHASES = {
  1: [
    { round: 'Dieciseisavos', isoDate: '2026-07-02', timeESP: '22:00', location: 'SoFi Stadium · Los Ángeles',
      polyKey: 'world cup group j second place', subset: null, uid: '16avos-1',
      title: '⚽ España (1ª) vs 2º Grupo J · 16avos Mundial 2026',
      cond: 'Solo si España queda 1ª del Grupo H',
      candidates: [
        { name: 'Austria',   flag: '🇦🇹', matchOutcome: 'Austria',   fallback: 57 },
        { name: 'Argelia',   flag: '🇩🇿', matchOutcome: 'Algeria',   fallback: 29 },
        { name: 'Argentina', flag: '🇦🇷', matchOutcome: 'Argentina', fallback:  8 },
        { name: 'Jordania',  flag: '🇯🇴', matchOutcome: 'Jordan',    fallback:  6 },
      ]},
    { round: 'Octavos', isoDate: '2026-07-06', timeESP: '01:00', location: 'AT&T Stadium · Dallas',
      polyKey: 'world cup winner', subset: ['Mexico','Switzerland','Canada','South Korea'], uid: 'oct-1',
      title: '⚽ España (1ª) · Octavos de Final · Mundial 2026',
      cond: 'Solo si España queda 1ª y supera 16avos',
      candidates: [
        { name: 'México',        flag: '🇲🇽', matchOutcome: 'Mexico',       fallback: 45 },
        { name: 'Suiza',         flag: '🇨🇭', matchOutcome: 'Switzerland',  fallback: 30 },
        { name: 'Canadá',        flag: '🇨🇦', matchOutcome: 'Canada',       fallback: 15 },
        { name: 'Corea del Sur', flag: '🇰🇷', matchOutcome: 'South Korea',  fallback: 10 },
      ]},
    { round: 'Cuartos', isoDate: '2026-07-10', timeESP: '22:00', location: 'SoFi Stadium · Los Ángeles',
      polyKey: 'world cup winner', subset: ['Brazil','Netherlands','Portugal','Morocco'], uid: 'qtr-1',
      title: '⚽ España (1ª) · Cuartos de Final · Mundial 2026',
      cond: 'Solo si España queda 1ª y llega a cuartos',
      candidates: [
        { name: 'Brasil',       flag: '🇧🇷', matchOutcome: 'Brazil',      fallback: 38 },
        { name: 'Países Bajos', flag: '🇳🇱', matchOutcome: 'Netherlands', fallback: 28 },
        { name: 'Portugal',     flag: '🇵🇹', matchOutcome: 'Portugal',    fallback: 22 },
        { name: 'Marruecos',    flag: '🇲🇦', matchOutcome: 'Morocco',     fallback: 12 },
      ]},
    { round: 'Semifinal', isoDate: '2026-07-15', timeESP: '02:00', location: 'Mercedes-Benz Stadium · Atlanta',
      polyKey: 'world cup winner', subset: ['France','England','Senegal','Norway'], uid: 'sf-1',
      title: '⚽ España (1ª) · Semifinal · Mundial 2026',
      cond: 'Solo si España queda 1ª y llega a semis',
      candidates: [
        { name: 'Francia',    flag: '🇫🇷', matchOutcome: 'France',  fallback: 50 },
        { name: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', matchOutcome: 'England', fallback: 30 },
        { name: 'Senegal',    flag: '🇸🇳', matchOutcome: 'Senegal', fallback: 12 },
        { name: 'Noruega',    flag: '🇳🇴', matchOutcome: 'Norway',  fallback:  8 },
      ]},
  ],
  2: [
    { round: 'Dieciseisavos', isoDate: '2026-07-03', timeESP: '22:00', location: 'Hard Rock Stadium · Miami',
      polyKey: 'world cup group j winner', subset: null, uid: '16avos-2',
      title: '⚽ España (2ª) vs 1º Grupo J · 16avos Mundial 2026',
      cond: 'Solo si España queda 2ª del Grupo H',
      candidates: [
        { name: 'Argentina', flag: '🇦🇷', matchOutcome: 'Argentina', fallback: 72 },
        { name: 'Austria',   flag: '🇦🇹', matchOutcome: 'Austria',   fallback: 19 },
        { name: 'Argelia',   flag: '🇩🇿', matchOutcome: 'Algeria',   fallback:  8 },
        { name: 'Jordania',  flag: '🇯🇴', matchOutcome: 'Jordan',    fallback:  1 },
      ]},
    { round: 'Octavos', isoDate: '2026-07-07', timeESP: '02:00', location: 'Mercedes-Benz Stadium · Atlanta',
      polyKey: 'world cup winner', subset: ['United States','Belgium','Paraguay','Turkey'], uid: 'oct-2',
      title: '⚽ España (2ª) · Octavos de Final · Mundial 2026',
      cond: 'Solo si España queda 2ª y supera 16avos',
      candidates: [
        { name: 'EE.UU.',   flag: '🇺🇸', matchOutcome: 'United States', fallback: 42 },
        { name: 'Bélgica',  flag: '🇧🇪', matchOutcome: 'Belgium',       fallback: 33 },
        { name: 'Paraguay', flag: '🇵🇾', matchOutcome: 'Paraguay',      fallback: 14 },
        { name: 'Turquía',  flag: '🇹🇷', matchOutcome: 'Turkey',        fallback: 11 },
      ]},
    { round: 'Cuartos', isoDate: '2026-07-11', timeESP: '22:00', location: 'Mercedes-Benz Stadium · Atlanta',
      polyKey: 'world cup winner', subset: ['France','England','Senegal','Croatia'], uid: 'qtr-2',
      title: '⚽ España (2ª) · Cuartos de Final · Mundial 2026',
      cond: 'Solo si España queda 2ª y llega a cuartos',
      candidates: [
        { name: 'Francia',    flag: '🇫🇷', matchOutcome: 'France',  fallback: 48 },
        { name: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', matchOutcome: 'England', fallback: 33 },
        { name: 'Senegal',    flag: '🇸🇳', matchOutcome: 'Senegal', fallback: 12 },
        { name: 'Croacia',    flag: '🇭🇷', matchOutcome: 'Croatia', fallback:  7 },
      ]},
    { round: 'Semifinal', isoDate: '2026-07-14', timeESP: '02:00', location: 'AT&T Stadium · Dallas',
      polyKey: 'world cup winner', subset: ['Brazil','Portugal','Morocco','Colombia'], uid: 'sf-2',
      title: '⚽ España (2ª) · Semifinal · Mundial 2026',
      cond: 'Solo si España queda 2ª y llega a semis',
      candidates: [
        { name: 'Brasil',    flag: '🇧🇷', matchOutcome: 'Brazil',   fallback: 45 },
        { name: 'Portugal',  flag: '🇵🇹', matchOutcome: 'Portugal', fallback: 32 },
        { name: 'Marruecos', flag: '🇲🇦', matchOutcome: 'Morocco',  fallback: 14 },
        { name: 'Colombia',  flag: '🇨🇴', matchOutcome: 'Colombia', fallback:  9 },
      ]},
  ],
};

const FINAL = {
  isoDate: '2026-07-19', timeESP: '20:00', location: 'MetLife Stadium · East Rutherford, NJ',
  polyKey: 'world cup winner', uid: 'final',
  title: '🏆 España · FINAL Mundial 2026',
  cond: 'Solo si España llega a la final',
  subset: ['Germany','Argentina','England','France'],
  candidates: [
    { name: 'Alemania',   flag: '🇩🇪', matchOutcome: 'Germany',   fallback: 36 },
    { name: 'Argentina',  flag: '🇦🇷', matchOutcome: 'Argentina', fallback: 28 },
    { name: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', matchOutcome: 'England',   fallback: 22 },
    { name: 'Francia',    flag: '🇫🇷', matchOutcome: 'France',    fallback: 14 },
  ],
};

/* ── Main ─────────────────────────────────────────────── */
async function main() {
  console.log('⚽ Generando ICS Mundial 2026...\n');
  const now = new Date();
  console.log(`🕒 ${now.toISOString()}\n`);

  // 1. Fetch datos
  console.log('📡 Cargando datos...');
  const [matches, groupJ1st, groupJ2nd, winner] = await Promise.all([
    fetchResults(),
    fetchPolymarket('world cup group j winner'),
    fetchPolymarket('world cup group j second place'),
    fetchPolymarket('world cup winner'),
  ]);

  const polyMaps = {
    'world cup group j winner':        groupJ1st,
    'world cup group j second place':  groupJ2nd,
    'world cup winner':                winner,
  };

  // 2. Generar eventos
  console.log('\n📅 Generando eventos...');
  const events = [];

  const allPhases = [
    ...PHASES[1].map(p => ({ ...p, sc: 1 })),
    ...PHASES[2].map(p => ({ ...p, sc: 2 })),
    { ...FINAL, sc: 0 },
  ];

  for (const phase of allPhases) {
    const polyMap = polyMaps[phase.polyKey] || null;
    const top3 = getTopCandidates(phase.candidates, polyMap, phase.subset).slice(0, 3);
    const isLive = polyMap !== null;

    const rivalLine = top3.map((c, i) => `${i+1}. ${c.flag} ${c.name} (${c.pct}%)`).join('\n');
    const source    = isLive ? 'Polymarket (en vivo)' : 'estimación (sin datos en vivo)';

    const desc = [
      phase.title,
      '',
      phase.cond,
      '',
      `Rivales más probables [${source}]:`,
      rivalLine,
      '',
      `Actualizado: ${now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`,
      'Fuente: https://anprieto.github.io/mundial-2026/',
    ].join('\\n');  // \\n = literal \n en ICS

    const dtStart = toUTC(phase.isoDate, phase.timeESP);
    const dtEnd   = addHours(phase.isoDate, phase.timeESP, 2);
    const isFinal = phase.sc === 0;
    const alarmMin = isLive ? 30 : 30;

    const vevent = [
      'BEGIN:VEVENT',
      `UID:esp-wc26-${phase.uid}@anprieto.github.io`,
      `DTSTAMP:${toUTC(now.toISOString().slice(0,10), now.toISOString().slice(11,16))}`,
      `SUMMARY:${phase.title}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `LOCATION:${phase.location}`,
      `DESCRIPTION:${desc}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      alarm(30, `En 30 min · ${phase.title}`),
      ...(isLive ? [] : ['X-APPLE-DEFAULT-ALARM:FALSE']),
      ...(isLive ? [alarm(60*24, `Mañana · ${phase.title}`)] : []),
      'END:VEVENT',
    ].join('\r\n');

    events.push(vevent);
    console.log(`  ✓ ${phase.title} → ${top3.map(c=>c.name+' '+c.pct+'%').join(' / ')}`);
  }

  // 3. Escribir ICS
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//España Mundial 2026//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:🇪🇸 España · Mundial 2026',
    'X-WR-CALDESC:Cruces eliminatorios de España con probabilidades de Polymarket actualizadas cada 10 minutos',
    'X-WR-TIMEZONE:Europe/Madrid',
    'REFRESH-INTERVAL;VALUE=DURATION:PT10M',
    'X-PUBLISHED-TTL:PT10M',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  fs.writeFileSync('espana-mundial-2026.ics', ics, 'utf8');
  console.log(`\n✅ ICS generado: ${events.length} eventos (${ics.length} bytes)`);
  console.log('   → espana-mundial-2026.ics');
}

main().catch(e => { console.error(e); process.exit(1); });
