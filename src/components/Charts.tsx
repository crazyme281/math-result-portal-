import React from 'react';

export const GRADE_COLORS: Record<string, string> = { A: '#2e7d32', B: '#7cb342', C: '#fdd835', D: '#fb8c00', E: '#e65100', F: '#c62828' };
export const gradeColor = (g: string) => GRADE_COLORS[g] ?? '#607d8b';

export interface Slice { label: string; value: number; color: string }

/** Pie chart (plain SVG, so it prints) with a legend showing the count and percentage of each slice. */
export const PieChart: React.FC<{ data: Slice[] }> = ({ data }) => {
  const total = data.reduce((a, d) => a + d.value, 0);
  const R = 90, C = 100;
  let angle = -Math.PI / 2;
  const pt = (a: number, r: number) => [C + r * Math.cos(a), C + r * Math.sin(a)];
  const arcs = data.filter((d) => d.value > 0).map((d) => {
    const frac = d.value / total;
    const a0 = angle;
    angle += frac * 2 * Math.PI;
    return { ...d, frac, a0, a1: angle };
  });
  return (
    <div className="pie-wrap">
      <svg viewBox="0 0 200 200" className="pie" role="img" aria-label="Grade distribution">
        {arcs.length === 1 ? (
          <circle cx={C} cy={C} r={R} fill={arcs[0].color} stroke="#fff" strokeWidth="1" />
        ) : arcs.map((a) => {
          const [x0, y0] = pt(a.a0, R);
          const [x1, y1] = pt(a.a1, R);
          return <path key={a.label} d={`M ${C} ${C} L ${x0} ${y0} A ${R} ${R} 0 ${a.frac > 0.5 ? 1 : 0} 1 ${x1} ${y1} Z`} fill={a.color} stroke="#fff" strokeWidth="1" />;
        })}
        {arcs.filter((a) => a.frac >= 0.06).map((a) => {
          const [x, y] = pt((a.a0 + a.a1) / 2, R * 0.62);
          return <text key={`t${a.label}`} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill="#000">{a.label} {Math.round(a.frac * 1000) / 10}%</text>;
        })}
      </svg>
      <table className="legend">
        <thead><tr><th /><th>Grade</th><th>Students</th><th>Percentage</th></tr></thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <td><span className="swatch" style={{ background: d.color }} /></td>
              <td>{d.label}</td><td>{d.value}</td><td>{total ? `${Math.round((d.value / total) * 1000) / 10}%` : '0%'}</td>
            </tr>
          ))}
          <tr className="total"><td /><td>Total</td><td>{total}</td><td>100%</td></tr>
        </tbody>
      </table>
    </div>
  );
};

export interface BarItem { label: string; parts: { key: string; value: number }[] }

/** Stacked bar chart: one bar per item, each split by key (for example grades A to F). */
export const StackedBars: React.FC<{ items: BarItem[]; keys: { key: string; color: string }[]; yLabel?: string }> = ({ items, keys, yLabel }) => {
  const W = Math.max(520, items.length * 64 + 70), H = 300, L = 44, B = 70, T = 14;
  const max = Math.max(1, ...items.map((i) => i.parts.reduce((a, p) => a + p.value, 0)));
  const step = Math.max(1, Math.ceil(max / 5));
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const bw = Math.min(40, (W - L - 10) / Math.max(1, items.length) - 14);
  return (
    <div className="bars-wrap">
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Bar chart">
          {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((v) => (
            <g key={v}>
              <line x1={L} x2={W - 6} y1={y(v)} y2={y(v)} stroke="#bbb" strokeWidth="0.6" />
              <text x={L - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize="10">{v}</text>
            </g>
          ))}
          {yLabel && <text x="10" y={(H - B) / 2} fontSize="10" transform={`rotate(-90 10 ${(H - B) / 2})`} textAnchor="middle">{yLabel}</text>}
          {items.map((it, i) => {
            const x = L + 12 + i * ((W - L - 10) / items.length);
            let acc = 0;
            return (
              <g key={it.label}>
                {keys.map((k) => {
                  const v = it.parts.find((p) => p.key === k.key)?.value ?? 0;
                  if (!v) return null;
                  const y0 = y(acc), y1 = y(acc + v);
                  acc += v;
                  return <rect key={k.key} x={x} y={y1} width={bw} height={y0 - y1} fill={k.color}><title>{`${it.label} - ${k.key}: ${v}`}</title></rect>;
                })}
                <text x={x + bw / 2} y={y(acc) - 4} textAnchor="middle" fontSize="10" fontWeight="700">{acc}</text>
                <text x={x + bw / 2} y={H - B + 12} fontSize="10" textAnchor="end" transform={`rotate(-40 ${x + bw / 2} ${H - B + 12})`}>{it.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="legend-row">
        {keys.map((k) => <span key={k.key}><span className="swatch" style={{ background: k.color }} /> {k.key}</span>)}
      </div>
    </div>
  );
};
