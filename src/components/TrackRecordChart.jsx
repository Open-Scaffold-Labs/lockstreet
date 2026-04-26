import { useMemo, useRef, useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Filler, Tooltip, Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

/**
 * Cumulative units chart for the Track Record page.
 * Pass `data` in the shape: [{ week: 'Wk 1', units: +1.5 }, ...]
 * If no data is passed, renders illustrative sample data so the page doesn't look empty.
 */

const SAMPLE = [
  { week: 'Wk 1',  units:  +2.5 },
  { week: 'Wk 2',  units:  -1.0 },
  { week: 'Wk 3',  units:  +4.0 },
  { week: 'Wk 4',  units:  +3.0 },
  { week: 'Wk 5',  units:  -0.5 },
  { week: 'Wk 6',  units:  +5.5 },
  { week: 'Wk 7',  units:  +1.0 },
  { week: 'Wk 8',  units:  +2.5 },
  { week: 'Wk 9',  units:  -2.0 },
  { week: 'Wk 10', units:  +3.5 },
  { week: 'Wk 11', units:  +1.5 },
  { week: 'Wk 12', units:  +6.0 },
  { week: 'Wk 13', units:  -1.5 },
  { week: 'Wk 14', units:  +4.5 },
  { week: 'Wk 15', units:  +2.0 },
  { week: 'Wk 16', units:  +3.5 },
  { week: 'Wk 17', units:  +1.5 },
  { week: 'Wk 18', units:  +5.0 },
];

export default function TrackRecordChart({ data = SAMPLE, isSample = true }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const cumulative = useMemo(() => {
    let sum = 0;
    return data.map((d) => { sum += d.units; return Math.round(sum * 10) / 10; });
  }, [data]);

  const labels = data.map((d) => d.week);
  const finalUnits = cumulative[cumulative.length - 1] ?? 0;
  const max = Math.max(...cumulative, 1);
  const min = Math.min(...cumulative, 0);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Cumulative units',
        data: cumulative,
        borderColor: '#4ade80',
        backgroundColor: (ctx) => {
          const { ctx: c, chartArea } = ctx.chart;
          if (!chartArea) return 'rgba(74,222,128,0.15)';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, 'rgba(74,222,128,0.32)');
          g.addColorStop(1, 'rgba(74,222,128,0.00)');
          return g;
        },
        borderWidth: 2.5,
        tension: 0.35,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#4ade80',
        pointHoverBorderColor: '#000000',
        pointHoverBorderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true, maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0a0a0a', borderColor: 'rgba(192, 132, 252, 0.35)', borderWidth: 1,
        padding: 10, titleColor: '#4ade80', bodyColor: '#f4eeff',
        callbacks: { label: (ctx) => `${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y}u` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#f4eeff', font: { size: 10 } } },
      y: { grid: { color: 'rgba(255,255,255,0.04)' },
           ticks: { color: '#f4eeff', font: { size: 10 }, callback: (v) => (v >= 0 ? '+' : '') + v + 'u' },
           suggestedMin: Math.floor(min - 2), suggestedMax: Math.ceil(max + 2) },
    },
    animation: { duration: 900, easing: 'easeOutQuart' },
  };

  return (
    <div ref={containerRef} className="trc-wrap">
      <div className="trc-header">
        <div>
          <div className="trc-eyebrow">{isSample ? 'Sample data · live results once season starts' : 'Cumulative units · this season'}</div>
          <div className="trc-final">
            {finalUnits >= 0 ? '+' : ''}{finalUnits}u
            <span className="trc-final-sub">final · {data.length} weeks</span>
          </div>
        </div>
      </div>
      <div className="trc-canvas">
        <Line data={chartData} options={options} key={width /* re-render on resize */} />
      </div>
    </div>
  );
}
