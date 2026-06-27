/**
 * generate-ics.mjs
 * Corre en GitHub Actions cada 10 minutos.
 * Llama a Polymarket + genera espana-mundial-2026.ics
 *
 * CUADRO ESPANA 1a (confirmado 27 Jun 2026):
 *   16avos P84:  Espana vs Austria           · 2 Jul 21:00h ESP · SoFi, Los Angeles
 *   Octavos P93: Gan(Portugal vs Ghana P83)  · 6 Jul 21:00h ESP · AT&T, Dallas
 *   Cuartos P98: Gan(P93) vs Gan(P94)        · 10 Jul 21:00h ESP · SoFi, Los Angeles
 *   Semis P101:  Gan(P97) vs Gan(P98)        · 14 Jul 21:00h ESP · AT&T, Dallas
 *   Final:       Gan P101 vs Gan P102        · 19 Jul 21:00h ESP · MetLife, NJ
 *
 * CONVERSION CEST (UTC+2):
 *   Los Angeles / SF / Seattle / Vancouver (UTC-7) +9h
 *   Dallas / Houston / KC / Mexico (UTC-5/6) +7/8h
 *   Atlanta / Miami / Toronto / Boston / MetLife (UTC-4) +6h
 */

import fetch from 'node-fetch';
import fs    from 'fs';

const pad = n => String(n).padStart(2, '0');

function toUTC(isoDate, timeESP) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [h, mi]   = timeESP.split(':').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, h - 2, mi));
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

function dtstamp() {
  const now = new Date();
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}` +
         `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
}

function alarm(minutesBefore, desc) {
  const h = Math.floor(minutesBefore / 60), m = minutesBefore % 60;
  const dur = h ? `PT${h}H${m ? m + 'M' : ''}` : `PT${m}M`;
  return `BEGIN:VALARM\r\nTRIGGER:-${dur}\r\nACTION:DISPLAY\r\nDESCRIPTION:${desc}\r\nEND:VALARM`;
}

// Eventos del cuadro de Espana (isoDate + timeESP = hora peninsular espanola CEST)
const EVENTS = [
  {
    uid: 'esp-wc26-16avos',
    isoDate: '2026-07-02', timeESP: '21:00',  // 3pm LA (UTC-7) = 22h CEST
    dur: 2, alarmMin: 30,
    loc: 'SoFi Stadium, Los Angeles',
    title: 'Espana vs Austria - 16avos Mundial 2026',
    type: 'fixed',
    desc: 'Espana (1aH) vs Austria (2oJ)\n16avos de final del Mundial 2026\nConfirmado por FIFA',
  },
  {
    uid: 'esp-wc26-octavos',
    isoDate: '2026-07-06', timeESP: '21:00',  // 7pm Dallas (UTC-5) = 02h CEST sig. dia
    dur: 2, alarmMin: 30,
    loc: 'AT&T Stadium, Dallas',
    title: 'Espana - Octavos Mundial 2026',
    type: 'match',
    keyword: 'portugal ghana world cup',
    pair: ['Portugal', 'Ghana'],
    fallback: [['Portugal', 78], ['Ghana', 22]],
    note: 'Ganador del P83: Portugal vs Ghana',
  },
  {
    uid: 'esp-wc26-cuartos',
    isoDate: '2026-07-10', timeESP: '21:00',  // 7pm LA (UTC-7) = 02h CEST sig. dia
    dur: 2, alarmMin: 30,
    loc: 'SoFi Stadium, Los Angeles',
    title: 'Espana - Cuartos Final Mundial 2026',
    type: 'tournament',
    subset: ['United States','Egypt','Bosnia','South Korea'],
    names:  {'United States':'EE.UU.','Egypt':'Egipto','Bosnia':'Bosnia','South Korea':'Corea del Sur'},
    fallback: [['EE.UU.',65],['Egipto',15],['Bosnia',12],['Corea del Sur',8]],
    note: 'P94 = EE.UU./Bosnia vs Egipto/Corea del Sur',
  },
  {
    uid: 'esp-wc26-semis',
    isoDate: '2026-07-14', timeESP: '21:00',  // 6pm Dallas (UTC-5) = 01h CEST sig. dia
    dur: 2, alarmMin: 30,
    loc: 'AT&T Stadium, Dallas',
    title: 'Espana - Semifinal Mundial 2026',
    type: 'tournament',
    subset: ['Germany','France','Netherlands','Morocco','Sweden','Canada'],
    names:  {'Germany':'Alemania','France':'Francia','Netherlands':'Paises Bajos',
             'Morocco':'Marruecos','Sweden':'Suecia','Canada':'Canada'},
    fallback: [['Alemania',34],['Francia',28],['Paises Bajos',22],['Marruecos',10],['Suecia',6]],
    note: 'P97 = Gan(Alemania/Francia) vs Gan(Paises Bajos/Marruecos/Suecia/Canada)',
  },
  {
    uid: 'esp-wc26-final',
    isoDate: '2026-07-19', timeESP: '21:00',  // 3pm MetLife (UTC-4) = 21h CEST
    dur: 2, alarmMin: 60,
    loc: 'MetLife Stadium, East Rutherford NJ',
    title: 'Espana - FINAL Mundial 2026',
    type: 'tournament',
    subset: ['Argentina','Brazil','England','Colombia','Mexico','Switzerland'],
    names:  {'Argentina':'Argentina','Brazil':'Brasil','England':'Inglaterra',
             'Colombia':'Colombia','Mexico':'Mexico','Switzerland':'Suiza'},
    fallback: [['Argentina',30],['Brasil',25],['Inglaterra',18],['Colombia',14],['Mexico',8],['Suiza',5]],
    note: 'Cuadro opuesto: Argentina, Brasil, Inglaterra, Colombia, Mexico, Suiza',
  },
];

async function fetchWinner() {
  try {
    const r = await fetch('https://gamma-api.polymarket.com/events?slug=world-cup-winner',
                          { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const arr = await r.json();
    if (!arr?.length) throw new Error('vacio');
    const map = new Map();
    (arr[0].markets || []).forEach(m => {
      try {
        const o = JSON.parse(m.outcomes || '[]');
        const p = JSON.parse(m.outcomePrices || '[]');
        o.forEach((name, i) => { const v = parseFloat(p[i]); if (!isNaN(v)) map.set(name, Math.round(v*100)); });
      } catch (_) {}
    });
    if (!map.size) throw new Error('sin datos');
    console.log(`  ok world-cup-winner (${map.size} outcomes)`);
    return map;
  } catch (e) { console.warn(`  fail world-cup-winner: ${e.message}`); return null; }
}

async function fetchMatchMarket(keyword, pair) {
  try {
    const url = `https://gamma-api.polymarket.com/markets?keyword=${encodeURIComponent(keyword)}&limit=20&active=true`;
    const r   = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ms  = await r.json();
    const [a, b] = pair.map(s => s.toLowerCase());
    const m = ms.find(x => {
      const q = (x.question || '').toLowerCase();
      return q.includes(a) && q.includes(b) && (q.includes('world cup') || q.includes('2026')) && !x.closed;
    });
    if (!m) throw new Error('no encontrado');
    const outs  = JSON.parse(m.outcomes || '[]');
    const prs   = JSON.parse(m.outcomePrices || '[]');
    const map   = new Map();
    outs.forEach((o, i) => { const v = parseFloat(prs[i]); if (!isNaN(v)) map.set(o, Math.round(v*100)); });
    console.log(`  ok ${keyword} (${m.question})`);
    return map;
  } catch (e) { console.warn(`  fail ${keyword}: ${e.message}`); return null; }
}

function getTopRivals(ev, winnerMap, matchMap) {
  if (ev.type === 'fixed') {
    return [{ name: 'Austria', pct: 100 }];
  }

  if (ev.type === 'match') {
    const map = matchMap;
    if (map) {
      const rivals = ev.pair.map(name => {
        const pct = map.get(name) || map.get(name.toLowerCase()) || 0;
        return { name, pct };
      }).sort((a, b) => b.pct - a.pct);
      if (rivals.some(r => r.pct > 0)) return rivals;
    }
    return ev.fallback.map(([name, pct]) => ({ name, pct }));
  }

  if (ev.type === 'tournament' && winnerMap) {
    const total = ev.subset.reduce((s, k) => s + (winnerMap.get(k) || 0), 0);
    if (total > 0) {
      return ev.subset
        .map(k => ({ name: ev.names[k] || k, pct: Math.round((winnerMap.get(k)||0)/total*100) }))
        .sort((a, b) => b.pct - a.pct);
    }
  }
  return ev.fallback.map(([name, pct]) => ({ name, pct }));
}

function buildVevent(ev, rivals) {
  const top     = rivals[0]?.name || '?';
  const rivStr  = rivals.slice(0, 3).map(r => `${r.name} (${r.pct}%)`).join(' / ');
  const now_es  = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
  const source  = ev.type === 'match'
    ? 'Polymarket (partido especifico) o Ranking FIFA'
    : ev.type === 'tournament'
    ? 'Polymarket (world-cup-winner)'
    : 'Confirmado FIFA';

  const desc = ev.type === 'fixed'
    ? [ev.title, 'Rival confirmado: Austria', `Sede: ${ev.loc}`,
       'https://anprieto.github.io/mundial-2026/'].join('\\n')
    : [ev.title, `Rival mas probable: ${top}`,
       `Candidatos: ${rivStr}`,
       ev.note || '',
       `Fuente: ${source}`,
       `Actualizado: ${now_es}`,
       'https://anprieto.github.io/mundial-2026/'].join('\\n');

  const summary = ev.type === 'fixed' ? ev.title : `${ev.title} · vs ${top}`;

  const lines = [
    'BEGIN:VEVENT',
    `UID:${ev.uid}@anprieto.github.io`,
    `DTSTAMP:${dtstamp()}`,
    `SUMMARY:${summary}`,
    `DTSTART:${toUTC(ev.isoDate, ev.timeESP)}`,
    `DTEND:${addHours(ev.isoDate, ev.timeESP, ev.dur)}`,
    `LOCATION:${ev.loc}`,
    `DESCRIPTION:${desc}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    alarm(ev.alarmMin, `En ${ev.alarmMin}min - ${summary}`),
  ];
  if (ev.uid.includes('final')) {
    lines.push(alarm(60 * 24, 'Manana - FINAL del Mundial - Espana'));
  }
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

async function main() {
  console.log('Generando ICS Espana Mundial 2026...');
  console.log(new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }), '\n');

  const [winnerMap, matchMap] = await Promise.all([
    fetchWinner(),
    fetchMatchMarket('portugal ghana world cup', ['Portugal', 'Ghana']),
  ]);

  const vevents = EVENTS.map(ev => {
    const rivals = getTopRivals(ev, winnerMap, matchMap);
    console.log(`  ${ev.uid.split('-').pop()} -> ${rivals.slice(0,2).map(r=>r.name+' '+r.pct+'%').join(' / ')}`);
    return buildVevent(ev, rivals);
  });

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Espana Mundial 2026//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Espana - Mundial 2026',
    'X-WR-CALDESC:Cruces eliminatorios de Espana con probabilidades Polymarket (cada 10 min)',
    'X-WR-TIMEZONE:Europe/Madrid',
    'REFRESH-INTERVAL;VALUE=DURATION:PT10M',
    'X-PUBLISHED-TTL:PT10M',
    ...vevents,
    'END:VCALENDAR',
  ].join('\r\n');

  fs.writeFileSync('espana-mundial-2026.ics', ics, 'utf8');
  console.log(`\nOK: espana-mundial-2026.ics (${ics.length} bytes, ${vevents.length} eventos)`);
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
