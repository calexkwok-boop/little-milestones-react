import { useState } from 'react';
import { TODAY, ageLabel } from '../constants.js';
import KidThumb from '../KidThumb.jsx';

// ─── Growth chart reference data (CDC 2000) ───────────────────────────────
// [ageMonths, p5, p25, p50, p75, p95]  height = inches, weight = lbs
const GROWTH_REF = {
  height: {
    M: [
      [0,18.5,19.2,19.7,20.3,21.0],[3,22.7,23.4,24.1,24.8,25.7],
      [6,25.1,25.9,26.7,27.4,28.2],[9,27.0,27.8,28.6,29.5,30.3],
      [12,28.5,29.3,30.2,31.0,32.0],[18,31.0,32.0,32.9,33.8,34.9],
      [24,33.0,34.0,35.1,36.1,37.4],[30,34.9,36.0,37.0,38.0,39.2],
      [36,36.5,37.6,38.6,39.6,40.8],[48,39.1,40.3,41.5,42.6,44.0],
      [60,41.7,43.0,44.1,45.4,46.9],[72,43.9,45.4,46.7,48.1,49.7],
      [84,46.2,47.8,49.2,50.6,52.2],[96,48.3,50.0,51.5,53.0,54.8],
      [108,50.3,52.0,53.6,55.2,57.2],[120,52.2,54.1,55.7,57.5,59.7],
    ],
    F: [
      [0,18.3,18.9,19.4,20.0,20.7],[3,22.1,22.8,23.5,24.2,25.1],
      [6,24.7,25.5,26.2,27.0,27.9],[9,26.6,27.4,28.2,29.0,30.0],
      [12,28.2,29.0,29.9,30.8,31.8],[18,30.7,31.7,32.6,33.6,34.7],
      [24,32.8,33.8,34.8,35.8,37.0],[30,34.6,35.7,36.7,37.8,39.0],
      [36,36.1,37.3,38.3,39.4,40.7],[48,38.8,40.1,41.2,42.4,43.9],
      [60,41.4,42.8,44.0,45.3,46.9],[72,43.9,45.3,46.5,47.8,49.4],
      [84,46.2,47.6,48.9,50.3,52.1],[96,48.3,49.8,51.2,52.7,54.6],
      [108,50.3,52.0,53.5,55.3,57.5],[120,52.4,54.3,56.0,58.0,60.5],
    ],
  },
  weight: {
    M: [
      [0,5.5,6.4,7.3,8.3,9.7],[3,11.0,12.8,14.1,15.6,17.5],
      [6,14.3,16.1,17.6,19.3,21.5],[9,16.2,18.1,19.8,21.8,24.3],
      [12,18.0,20.1,22.0,24.2,27.0],[18,21.0,23.5,25.7,28.3,31.5],
      [24,23.5,26.2,28.7,31.7,35.5],[30,25.8,28.9,31.7,35.1,39.5],
      [36,27.7,31.1,34.2,37.9,42.8],[48,31.3,35.4,39.1,43.7,50.0],
      [60,34.6,39.4,44.0,49.6,57.7],[72,38.2,43.7,49.5,56.7,67.3],
      [84,41.9,48.7,55.9,65.1,79.2],[96,46.1,54.3,63.2,75.0,94.1],
      [108,50.9,61.0,72.1,87.2,111.8],[120,56.2,68.5,82.0,100.8,131.5],
    ],
    F: [
      [0,5.4,6.2,7.3,8.3,9.6],[3,10.4,12.1,13.4,15.0,17.0],
      [6,13.2,15.0,16.5,18.3,20.7],[9,15.1,17.0,18.8,21.0,23.8],
      [12,16.9,19.1,21.2,23.7,27.0],[18,19.6,22.2,24.7,27.7,31.7],
      [24,22.3,25.1,28.0,31.6,36.6],[30,24.7,28.0,31.3,35.5,41.5],
      [36,26.6,30.2,33.9,38.6,45.5],[48,30.3,34.7,39.4,45.3,54.0],
      [60,33.5,38.8,44.5,51.8,62.8],[72,36.7,43.2,50.4,59.8,74.2],
      [84,40.3,48.2,57.5,69.5,88.4],[96,44.2,53.8,65.5,80.9,105.5],
      [108,48.8,60.4,75.0,94.5,125.7],[120,54.1,68.3,86.0,110.5,148.1],
    ],
  },
};

function lerpRef(table, ageMo) {
  if (ageMo <= table[0][0]) return table[0].slice(1);
  if (ageMo >= table[table.length - 1][0]) return table[table.length - 1].slice(1);
  let i = 0;
  while (i < table.length - 1 && table[i + 1][0] < ageMo) i++;
  const t = (ageMo - table[i][0]) / (table[i + 1][0] - table[i][0]);
  return table[i].slice(1).map((v, j) => v + (table[i + 1][j + 1] - v) * t);
}

function avgTable(tM, tF) {
  return tM.map((rowM, i) => [rowM[0], ...rowM.slice(1).map((v, j) => (v + tF[i][j + 1]) / 2)]);
}

function ageInMonthsAt(birthdate, date) {
  const b = new Date(birthdate + 'T12:00:00');
  const d = new Date(date + 'T12:00:00');
  return Math.max(0, (d.getFullYear() - b.getFullYear()) * 12 + (d.getMonth() - b.getMonth()) + (d.getDate() - b.getDate()) / 30.5);
}

function fmtHeight(inches) {
  if (!inches) return '—';
  const ft = Math.floor(inches / 12);
  const remIn = inches % 12;
  const remStr = Number.isInteger(remIn) ? String(remIn) : remIn.toFixed(1);
  return ft > 0 ? `${ft}′ ${remStr}″` : `${remStr}″`;
}

function fmtWeight(lbs) {
  if (!lbs) return '—';
  const lb = Math.floor(lbs);
  const oz = Math.round((lbs - lb) * 16);
  if (lbs < 25 && oz > 0) return `${lb} lb ${oz} oz`;
  return `${lbs % 1 === 0 ? lb : lbs.toFixed(1)} lb`;
}

function GrowthChart({ measurements, refTable, color }) {
  const W = 320, H = 200;
  const PL = 38, PR = 12, PT = 14, PB = 30;
  const cW = W - PL - PR, cH = H - PT - PB;

  const hasMeasurements = measurements && measurements.length > 0;
  const refMax = refTable ? refTable[refTable.length - 1][0] : 120;
  const maxAgeMo = hasMeasurements
    ? Math.min(refMax, Math.max(...measurements.map(m => m.age)) + 12)
    : 36;

  const allVals = [
    ...(hasMeasurements ? measurements.map(m => m.value) : []),
    ...(refTable ? refTable.map(r => r[1]) : []),
    ...(refTable ? refTable.map(r => r[5]) : []),
  ];
  if (allVals.length === 0) return null;
  const minVal = Math.floor(Math.min(...allVals) * 0.97);
  const maxVal = Math.ceil(Math.max(...allVals) * 1.03);

  const tx = age => PL + (age / maxAgeMo) * cW;
  const ty = val => PT + (1 - (val - minVal) / (maxVal - minVal)) * cH;

  const refPts = i => refTable ? refTable.map(r => `${tx(r[0]).toFixed(1)},${ty(r[i]).toFixed(1)}`).join(' ') : '';
  const bandPoly = refTable ? [
    ...refTable.map(r => `${tx(r[0]).toFixed(1)},${ty(r[2]).toFixed(1)}`),
    ...refTable.slice().reverse().map(r => `${tx(r[0]).toFixed(1)},${ty(r[4]).toFixed(1)}`),
  ].join(' ') : '';
  const kidLine = hasMeasurements ? measurements.map(m => `${tx(m.age).toFixed(1)},${ty(m.value).toFixed(1)}`).join(' ') : '';

  const xTicks = [];
  for (let mo = 0; mo <= maxAgeMo; mo += (maxAgeMo > 36 ? 12 : 6)) xTicks.push(mo);
  const yRange = maxVal - minVal;
  const yStep = yRange <= 12 ? 2 : yRange <= 30 ? 5 : yRange <= 60 ? 10 : 15;
  const yTicks = [];
  for (let v = Math.ceil(minVal / yStep) * yStep; v <= maxVal; v += yStep) yTicks.push(v);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {yTicks.map(v => (
        <line key={v} x1={PL} y1={ty(v)} x2={PL + cW} y2={ty(v)} stroke="#EEF2EA" strokeWidth={1} />
      ))}
      {refTable && bandPoly && <polygon points={bandPoly} fill={color} opacity={0.13} />}
      {refTable && <polyline points={refPts(1)} fill="none" stroke={color} strokeWidth={0.8} strokeOpacity={0.25} strokeDasharray="3,3" />}
      {refTable && <polyline points={refPts(5)} fill="none" stroke={color} strokeWidth={0.8} strokeOpacity={0.25} strokeDasharray="3,3" />}
      {refTable && <polyline points={refPts(3)} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.45} strokeDasharray="5,4" />}
      {hasMeasurements && measurements.length > 1 && (
        <polyline points={kidLine} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {hasMeasurements && measurements.map((m, i) => (
        <circle key={i} cx={tx(m.age)} cy={ty(m.value)} r={4.5} fill={color} stroke="#fff" strokeWidth={1.5} />
      ))}
      <line x1={PL} y1={PT + cH} x2={PL + cW} y2={PT + cH} stroke="#CCDAC8" strokeWidth={1} />
      <line x1={PL} y1={PT} x2={PL} y2={PT + cH} stroke="#CCDAC8" strokeWidth={1} />
      {xTicks.map(mo => (
        <text key={mo} x={tx(mo)} y={PT + cH + 14} fontSize={8.5} fill="#9AA89C" textAnchor="middle" fontFamily="Inter,sans-serif">
          {mo === 0 ? 'birth' : mo >= 24 ? `${mo / 12}y` : `${mo}m`}
        </text>
      ))}
      {yTicks.map(v => (
        <text key={v} x={PL - 5} y={ty(v) + 3} fontSize={8.5} fill="#9AA89C" textAnchor="end" fontFamily="Inter,sans-serif">{v}</text>
      ))}
    </svg>
  );
}

function GrowthScreen({ kid, onBack, onSave, onDelete }) {
  const [metric, setMetric] = useState('height');
  const [addingEntry, setAddingEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [entryDate, setEntryDate] = useState(TODAY);
  const [editMonth, setEditMonth] = useState('');
  const [editDay, setEditDay] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editingDate, setEditingDate] = useState(false);
  const [newFt, setNewFt] = useState('');
  const [newIn, setNewIn] = useState('');
  const [newLb, setNewLb] = useState('');
  const [newOz, setNewOz] = useState('');

  const growthLog = [...(kid.growthLog || [])].sort((a, b) => a.date.localeCompare(b.date));
  const refH = GROWTH_REF.height[kid.sex] || avgTable(GROWTH_REF.height.M, GROWTH_REF.height.F);
  const refW = GROWTH_REF.weight[kid.sex] || avgTable(GROWTH_REF.weight.M, GROWTH_REF.weight.F);
  const heightPts = growthLog.filter(e => e.height).map(e => ({ age: ageInMonthsAt(kid.birthdate, e.date), value: e.height }));
  const weightPts = growthLog.filter(e => e.weight).map(e => ({ age: ageInMonthsAt(kid.birthdate, e.date), value: e.weight }));
  const latest = growthLog[growthLog.length - 1];
  const color = kid.accent || 'var(--accent)';

  function openDateEdit() {
    const [y, m, d] = entryDate.split('-');
    setEditYear(y); setEditMonth(m); setEditDay(String(parseInt(d)));
    setEditingDate(true);
  }
  function applyDate() {
    if (editMonth && editDay && editYear && editYear.length === 4)
      setEntryDate(`${editYear}-${editMonth}-${editDay.padStart(2, '0')}`);
    setEditingDate(false);
  }

  function closeSheet() {
    setAddingEntry(false);
    setEditingEntry(null);
    setNewFt(''); setNewIn(''); setNewLb(''); setNewOz('');
    setEntryDate(TODAY);
  }

  function openEdit(entry) {
    setEditingEntry(entry);
    setEntryDate(entry.date);
    if (entry.height != null) {
      setNewFt(String(Math.floor(entry.height / 12)));
      setNewIn(String(parseFloat((entry.height % 12).toFixed(2))));
    } else { setNewFt(''); setNewIn(''); }
    if (entry.weight != null) {
      const lb = Math.floor(entry.weight);
      const oz = parseFloat(((entry.weight - lb) * 16).toFixed(1));
      setNewLb(String(lb));
      setNewOz(oz > 0 ? String(oz) : '');
    } else { setNewLb(''); setNewOz(''); }
    setAddingEntry(true);
  }

  function handleAdd() {
    const height = (newFt || newIn) ? parseFloat(newFt || 0) * 12 + parseFloat(newIn || 0) : null;
    const weight = (newLb || newOz) ? parseFloat(newLb || 0) + parseFloat(newOz || 0) / 16 : null;
    if (!height && !weight) return;
    onSave({ date: entryDate, height: height || null, weight: weight || null });
    closeSheet();
  }

  function handleDelete() {
    if (editingEntry) onDelete(editingEntry.date);
    closeSheet();
  }

  const canSave = newFt || newIn || newLb || newOz;
  const dateDisplay = new Date(entryDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const segBtn = (tab) => ({
    flex: 1, border: 'none', borderRadius: 7, padding: '7px 0',
    fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    background: metric === tab ? 'var(--bg-input)' : 'transparent',
    color: metric === tab ? 'var(--accent)' : 'var(--text-muted)',
    boxShadow: metric === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
  });

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="scrollpad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button className="icon-btn" onClick={onBack}><i className="ti ti-arrow-left" /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KidThumb kid={kid} size={22} />
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: 'var(--accent)', margin: 0, fontWeight: 700 }}>{kid.name}'s growth</h2>
            </div>
            <button className="icon-btn" onClick={() => setAddingEntry(true)}><i className="ti ti-plus" /></button>
          </div>

          {latest && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="stat-tile">
                <p style={{ fontSize: 17, color: 'var(--accent)', margin: 0, fontWeight: 700 }}>{fmtHeight(latest.height)}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '3px 0 0' }}>height</p>
              </div>
              <div className="stat-tile">
                <p style={{ fontSize: 17, color: 'var(--accent)', margin: 0, fontWeight: 700 }}>{fmtWeight(latest.weight)}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '3px 0 0' }}>weight</p>
              </div>
            </div>
          )}

          {growthLog.length > 0 && (
            <>
              <div style={{ display: 'flex', background: 'var(--bg-card)', borderRadius: 9, padding: 3 }}>
                <button style={segBtn('height')} onClick={() => setMetric('height')}>Height</button>
                <button style={segBtn('weight')} onClick={() => setMetric('weight')}>Weight</button>
              </div>
              <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 8px 8px' }}>
                <GrowthChart
                  measurements={metric === 'height' ? heightPts : weightPts}
                  refTable={metric === 'height' ? refH : refW}
                  color={color}
                />
                <p style={{ fontSize: 10, color: 'var(--border-light)', textAlign: 'center', margin: '4px 0 2px', fontFamily: 'Inter, sans-serif' }}>
                  {kid.sex ? 'Shaded = 25th–75th · Dashed = 50th percentile' : 'Average of all children'} · CDC 2000
                </p>
              </div>
            </>
          )}

          {growthLog.length === 0 ? (
            <div className="empty-state">
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <i className="ti ti-ruler" style={{ fontSize: 24, color: 'var(--text-muted)' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', margin: '0 0 6px' }}>No measurements yet</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>Tap + to log {kid.name}'s first height and weight.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: 0 }}>Log</p>
              {[...growthLog].reverse().map((entry, i) => {
                const ageMo = ageInMonthsAt(kid.birthdate, entry.date);
                const dateStr = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                const [p5H, , p50H, , p95H] = lerpRef(refH, ageMo);
                const [p5W, , p50W, , p95W] = lerpRef(refW, ageMo);
                const hPct = entry.height ? Math.round(((entry.height - p5H) / (p95H - p5H)) * 90 + 5) : null;
                const wPct = entry.weight ? Math.round(((entry.weight - p5W) / (p95W - p5W)) * 90 + 5) : null;
                return (
                  <div key={i} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', margin: 0 }}>{dateStr}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>{ageLabel(Math.round(ageMo))} old</p>
                      </div>
                      <button onClick={() => openEdit(entry)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 15, padding: 4, display: 'flex' }}>
                        <i className="ti ti-pencil" />
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {entry.height && (
                        <div style={{ flex: 1, background: 'var(--bg-card)', borderRadius: 9, padding: '8px 10px' }}>
                          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>{fmtHeight(entry.height)}</p>
                          {hPct !== null && <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>~{Math.min(99, Math.max(1, hPct))}th percentile</p>}
                        </div>
                      )}
                      {entry.weight && (
                        <div style={{ flex: 1, background: 'var(--bg-card)', borderRadius: 9, padding: '8px 10px' }}>
                          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>{fmtWeight(entry.weight)}</p>
                          {wPct !== null && <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>~{Math.min(99, Math.max(1, wPct))}th percentile</p>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add / edit measurement sheet */}
      {addingEntry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 20 }} onClick={closeSheet}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{editingEntry ? 'Edit measurement' : 'Add measurement'}</p>
              {editingEntry ? (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-calendar" style={{ fontSize: 13 }} />{dateDisplay}
                </span>
              ) : (
                <button onClick={openDateEdit} style={{ background: 'var(--bg-card)', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-2)', fontFamily: "'Urbanist', sans-serif", padding: '6px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
                  <i className="ti ti-calendar" style={{ fontSize: 13 }} />{dateDisplay}
                </button>
              )}
            </div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Height</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input type="number" placeholder="0" value={newFt} onChange={e => setNewFt(e.target.value)} className="input-field" style={{ paddingRight: 30 }} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-muted)', pointerEvents: 'none' }}>ft</span>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <input type="number" placeholder="0" step="0.1" value={newIn} onChange={e => setNewIn(e.target.value)} className="input-field" style={{ paddingRight: 30 }} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-muted)', pointerEvents: 'none' }}>in</span>
              </div>
            </div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Weight</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input type="number" placeholder="0" value={newLb} onChange={e => setNewLb(e.target.value)} className="input-field" style={{ paddingRight: 30 }} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-muted)', pointerEvents: 'none' }}>lb</span>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <input type="number" placeholder="0" value={newOz} onChange={e => setNewOz(e.target.value)} className="input-field" style={{ paddingRight: 30 }} />
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-muted)', pointerEvents: 'none' }}>oz</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {editingEntry && (
                <button className="btn btn-outline" style={{ flex: 1, color: '#C0523A', borderColor: '#F0C4BA' }} onClick={handleDelete}>Delete</button>
              )}
              <button className="btn btn-primary" style={{ flex: editingEntry ? 2 : 1, opacity: canSave ? 1 : 0.4 }} disabled={!canSave} onClick={handleAdd}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Date sheet */}
      {editingDate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,56,40,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30, padding: '0 16px' }} onClick={() => setEditingDate(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '24px 20px 28px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>When was this measured?</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div style={{ position: 'relative', flex: 2.2 }}>
                <select value={editMonth} onChange={e => setEditMonth(e.target.value)} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 36px 14px 14px', fontSize: 16, outline: 'none', background: 'var(--bg-input)', color: editMonth ? 'var(--text)' : 'var(--text-muted)', fontFamily: "'Urbanist', sans-serif", appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}>
                  <option value="" disabled>Month</option>
                  {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
                </select>
                <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13, pointerEvents: 'none' }} />
              </div>
              <input type="number" placeholder="Day" value={editDay} min={1} max={31} onChange={e => setEditDay(e.target.value)} style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 10, padding: '14px 10px', fontSize: 16, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", textAlign: 'center' }} />
              <input type="number" placeholder="Year" value={editYear} min={2000} max={2030} onChange={e => setEditYear(e.target.value)} style={{ flex: 1.5, border: '1px solid var(--border)', borderRadius: 10, padding: '14px 10px', fontSize: 16, outline: 'none', background: 'var(--bg-input)', color: 'var(--text)', fontFamily: "'Urbanist', sans-serif", textAlign: 'center' }} />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={applyDate}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GrowthScreen;
