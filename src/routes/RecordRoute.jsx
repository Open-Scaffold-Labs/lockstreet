import { useEffect, useRef } from 'react';
import {
  Chart, BarController, BarElement, LineController, LineElement, PointElement,
  CategoryScale, LinearScale, Filler, Tooltip, Legend,
} from 'chart.js';

Chart.register(
  BarController, BarElement, LineController, LineElement, PointElement,
  CategoryScale, LinearScale, Filler, Tooltip, Legend,
);

// Mocked weekly performance for the current season.
// Swap for /api/record once we persist real week-by-week results in KV.
const WEEKLY = [3.2, -1.5, 2.8, 4.1, -2.3, 5.6, 1.9, -0.8, 3.4, 2.1, 4.8, 6.3];

export default function RecordRoute() {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const ctx = ref.current;
    const cum = WEEKLY.reduce((acc, v, i) => { acc.push((acc[i - 1] || 0) + v); return acc; }, []);

    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: WEEKLY.map((_, i) => 'W' + (i + 1)),
        datasets: [
          {
            label: 'Units',
            data: WEEKLY,
            backgroundColor: WEEKLY.map((v) => v >= 0 ? 'rgba(74,222,128,0.78)' : 'rgba(248,113,113,0.78)'),
            borderRadius: 4,
            borderSkipped: false,
            order: 2,
          },
          {
            type: 'line',
            label: 'Cumulative',
            data: cum,
            borderColor: '#4ade80',
            backgroundColor: 'rgba(74,222,128,0.08)',
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2,
            fill: true,
            yAxisID: 'y2',
            order: 1,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y:  { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#f4eeff' } },
          y2: { position: 'right', grid: { display: false }, ticks: { color: '#cc7733', callback: (v) => '+' + v + 'u' } },
          x:  { grid: { display: false }, ticks: { color: '#f4eeff' } },
        },
        plugins: {
          legend: { labels: { color: '#f4eeff' } },
          tooltip: { backgroundColor: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
            titleColor: '#f4eeff', bodyColor: '#f4eeff' },
        },
      },
    });

    return () => chartRef.current?.destroy();
  }, []);

  return (
    <section>
      <div className="record-hero">
        <div className="stat" style={{ animationDelay: '0s' }}>
          <div className="k">Win Rate</div>
          <div className="v green">61.1%</div>
          <div className="s">6-season average</div>
        </div>
        <div className="stat" style={{ animationDelay: '.05s' }}>
          <div className="k">ATS Record</div>
          <div className="v">187–119</div>
          <div className="s">Against the spread</div>
        </div>
        <div className="stat" style={{ animationDelay: '.1s' }}>
          <div className="k">ROI</div>
          <div className="v gold">+24.3%</div>
          <div className="s">Units on the book</div>
        </div>
        <div className="stat" style={{ animationDelay: '.15s' }}>
          <div className="k">Units Won</div>
          <div className="v">+73.4u</div>
          <div className="s">Lifetime</div>
        </div>
      </div>

      <div className="chart-card">
        <h3>Weekly Performance — 2025 Season</h3>
        <div className="sub">Bars above zero are winning weeks. Gold line marks cumulative units.</div>
        <div className="chart-wrap"><canvas ref={ref} /></div>
      </div>
    </section>
  );
}
