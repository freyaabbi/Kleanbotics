import React from 'react';
import heroRobot from '../../assets/hero-robot.png';

// Deep forest green used for primary CTAs + logo (matches the brand mock).
const GREEN = '#14532d';

/* ---------- inline icon set ---------- */
const Leaf = (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path strokeLinecap="round" strokeLinejoin="round" d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2 21c0-3 1.85-5.36 5.08-6" /></svg>);
const Gear = (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><circle cx="12" cy="12" r="3" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>);
const Bars = (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path strokeLinecap="round" strokeLinejoin="round" d="M18 20V10M12 20V4M6 20v-6" /></svg>);
const Monitor = (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><rect x="2" y="3" width="20" height="14" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4" /></svg>);
const Sliders = (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path strokeLinecap="round" strokeLinejoin="round" d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>);
const Signal = (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.55a11 11 0 0114 0M8.5 16.03a6 6 0 017 0M2 8.82a15 15 0 0120 0" /><circle cx="12" cy="20" r="1" fill="currentColor" /></svg>);
const Sun = (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><circle cx="12" cy="12" r="4" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" /></svg>);
const Bolt = (p) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M13 2L3 14h7l-1 8 10-12h-7z" /></svg>);
const Cloud = (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path strokeLinecap="round" strokeLinejoin="round" d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" /></svg>);
const Arrow = () => (<svg className="w-5 h-5 text-accent shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" /></svg>);

const SUN_IMG = 'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=1000&q=80';

function IconBubble({ children, tone = 'soft' }) {
  const bg = tone === 'info' ? 'bg-blue-50 text-info' : 'bg-soft text-accent';
  return <div className={`h-14 w-14 rounded-full flex items-center justify-center ${bg}`}>{children}</div>;
}

export default function Landing({ onEnter }) {
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-page font-sans text-ink overflow-x-hidden">
      {/* ================= NAV ================= */}
      <nav className="sticky top-0 z-30 bg-surface/80 backdrop-blur border-b border-line">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl flex items-center justify-center text-white" style={{ background: GREEN }}>
              <Leaf className="w-5 h-5" />
            </span>
            <div className="leading-none">
              <p className="text-xl font-black tracking-tight text-ink">Kleanbotics</p>
              <p className="text-[9px] font-black text-muted uppercase tracking-[.12em] mt-1">Cleaner Panels. Brighter Tomorrow.</p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-bold text-slate-600">
            <button onClick={() => scrollTo('top')} className="text-accent border-b-2 border-accent pb-1">Home</button>
            <button onClick={() => scrollTo('features')} className="hover:text-ink transition-colors">Features</button>
            <button onClick={() => scrollTo('how')} className="hover:text-ink transition-colors">How it Works</button>
            <button onClick={() => scrollTo('impact')} className="hover:text-ink transition-colors">Impact</button>
            <button onClick={() => scrollTo('about')} className="hover:text-ink transition-colors">About</button>
          </div>

          <button onClick={onEnter} className="flex items-center gap-2 text-white text-sm font-bold px-6 py-3 rounded-2xl transition-transform active:scale-95" style={{ background: GREEN }}>
            Get Started <span aria-hidden>→</span>
          </button>
        </div>
      </nav>

      {/* ================= HERO ================= */}
      <section id="top" className="relative overflow-hidden">
        {/* Full-bleed photographic scene on the right; fades into the page on its left. */}
        <div
          className="absolute inset-y-0 right-0 w-[56%] hidden lg:block pointer-events-none select-none"
          style={{
            WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 18%, #000 100%)',
            maskImage: 'linear-gradient(to right, transparent 0%, #000 18%, #000 100%)',
          }}
        >
          <img
            src={heroRobot}
            alt="Kleanbotics robot cleaning a solar array"
            className="w-full h-full object-cover"
            style={{ objectPosition: '55% 50%' }}
          />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-20">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            {/* LEFT — copy */}
            <div className="relative z-10">
              <span className="inline-flex items-center gap-2 bg-soft text-accent rounded-full px-4 py-1.5 text-[11px] font-black uppercase tracking-[.08em]">
                <span className="h-2 w-2 rounded-full bg-accent-fill" /> Real-Time Monitoring. Smarter Operations.
              </span>
              <h1 className="mt-6 text-5xl lg:text-6xl font-black tracking-tighter leading-[1.05]">
                Cleaner Panels.<br />
                <span style={{ color: '#2f7d5a' }}>Higher Possibilities.</span>
              </h1>
              <p className="mt-6 text-lg text-slate-500 font-medium max-w-xl leading-relaxed">
                Kleanbotics is a full-stack, real-time SCADA system designed for monitoring, analytics,
                and active control of remote solar panel cleaning fleets.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <button onClick={onEnter} className="flex items-center gap-2 text-white font-bold px-8 py-4 rounded-2xl shadow-elev transition-transform active:scale-95" style={{ background: GREEN }}>
                  Log In <span aria-hidden>→</span>
                </button>
                <button onClick={() => scrollTo('features')} className="font-bold px-8 py-4 rounded-2xl bg-surface border border-line text-ink hover:border-slate-300 transition-colors">
                  Learn More
                </button>
              </div>

              {/* mini feature row */}
              <div className="mt-12 flex flex-wrap gap-8">
                {[[<Leaf className="w-5 h-5" />, 'Improved', 'Energy Output'], [<Gear className="w-5 h-5" />, 'Automated', 'Cleaning Operations'], [<Bars className="w-5 h-5" />, 'Real-Time', 'Insights']].map(([ic, a, b], i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <span className="h-11 w-11 rounded-full bg-soft text-accent flex items-center justify-center">{ic}</span>
                    <p className="text-sm font-bold text-slate-600 leading-tight">{a}<br />{b}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT — floating dashboard cards over the image */}
            <div className="relative hidden lg:block min-h-[540px]">
              {/* Live Fleet Status — top left of the visual */}
              <div className="absolute top-2 left-0 w-[264px] max-w-full bg-surface rounded-xl border border-line shadow-elev p-3">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-black text-ink text-[11px]">Live Fleet Status</h3>
                  <span className="flex items-center gap-1 text-[8px] font-bold text-accent">
                    <span className="h-1 w-1 rounded-full bg-accent-fill" /> All Systems Operational
                  </span>
                </div>
                <div className="flex gap-2">
                  <div className="w-11 shrink-0 rounded-lg overflow-hidden">
                    <img src={heroRobot} alt="" className="w-full h-full object-cover" style={{ objectPosition: '18% 62%' }} />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 flex-1">
                    {[['12', 'Robots Online'], ['98%', 'Avg. Cleaning Efficiency'], ['245 MW', 'Total Capacity Monitored'], ['0', 'Active Alerts']].map(([v, l], i) => (
                      <div key={i} className="rounded-md border border-line px-1.5 py-1">
                        <p className="text-xs font-black text-ink leading-none">{v}</p>
                        <p className="text-[7px] font-bold text-muted leading-tight mt-0.5">{l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Energy Output — lower right, compact */}
              <div className="absolute right-0 top-[68%] w-56 bg-surface rounded-2xl border border-line shadow-elev p-3.5">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-black text-ink text-xs">Energy Output</span>
                  <span className="text-[9px] font-black text-accent bg-soft px-2 py-0.5 rounded-full">↑ +18%</span>
                </div>
                <div className="flex gap-1.5">
                  <div className="flex flex-col justify-between text-[7px] font-bold text-muted h-16 py-0.5">
                    <span>150</span><span>100</span><span>50</span><span>0</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-end gap-1 h-16 border-b border-line">
                      {[18, 33, 36, 42, 55, 70, 75, 100].map((h, i) => (
                        <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, backgroundColor: i >= 6 ? GREEN : '#a7f3d0' }} />
                      ))}
                    </div>
                    <div className="flex gap-1 mt-1">
                      {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'].map((m) => (
                        <span key={m} className="flex-1 text-center text-[6px] font-bold text-muted">{m}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= 4 FEATURE COLUMNS ================= */}
      <section id="features" className="max-w-7xl mx-auto px-6 lg:px-8 py-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
        {[
          [<Monitor className="w-6 h-6" />, 'Monitor in Real Time', 'Track robot locations, cleaning status, and system health across multiple sites.'],
          [<Bars className="w-6 h-6" />, 'Analyze Performance', 'Get actionable insights on energy output, efficiency, and maintenance.'],
          [<Sliders className="w-6 h-6" />, 'Control Remotely', 'Schedule, manage, and deploy cleaning fleets from anywhere.'],
          [<Leaf className="w-6 h-6" />, 'Build a Sustainable Future', 'Maximize solar energy yield and reduce operational costs.'],
        ].map(([ic, t, d], i) => (
          <div key={i} className="text-center flex flex-col items-center">
            <IconBubble>{ic}</IconBubble>
            <h3 className="mt-4 font-black text-ink">{t}</h3>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">{d}</p>
          </div>
        ))}
      </section>

      {/* ================= IMPACT BANNER ================= */}
      <section id="impact" className="max-w-7xl mx-auto px-6 lg:px-8 py-10">
        <div className="rounded-[2rem] border border-line bg-sunk overflow-hidden grid lg:grid-cols-4">
          <div className="relative p-8 flex items-end min-h-[220px] lg:col-span-1">
            <img src={SUN_IMG} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <h2 className="relative text-2xl font-black text-white drop-shadow leading-tight">Driving a<br />Cleaner, Greener<br />Tomorrow</h2>
          </div>
          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
            {[[<Bolt className="w-7 h-7" />, '+18%', 'Average Increase in Energy Output'], [<Leaf className="w-7 h-7" />, '12,000+', 'Panels Cleaned Remotely'], [<Cloud className="w-7 h-7" />, 'CO₂', 'Lower Carbon Footprint']].map(([ic, v, l], i) => (
              <div key={i} className="p-8 text-center flex flex-col items-center justify-center">
                <span className="text-accent mb-3">{ic}</span>
                <p className="text-3xl font-black text-ink">{v}</p>
                <p className="mt-1 text-sm font-bold text-muted">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section id="how" className="max-w-7xl mx-auto px-6 lg:px-8 py-16 text-center">
        <p className="micro text-accent">How It Works</p>
        <h2 className="mt-3 text-4xl font-black tracking-tight">From Data to a Cleaner Planet</h2>
        <p className="mt-3 text-slate-500 font-medium">A seamless system that monitors, analyzes, and controls — all in real time.</p>

        <div className="mt-12 flex flex-col lg:flex-row items-center justify-center gap-4">
          {[
            [<Signal className="w-6 h-6" />, '1', 'Collect Data', 'Sensors and robots send real-time data from the field.', 'info'],
            [<Bars className="w-6 h-6" />, '2', 'Analyze', 'SCADA platform processes data for insights and alerts.', 'soft'],
            [<Gear className="w-6 h-6" />, '3', 'Control', 'Manage and deploy cleaning operations remotely.', 'soft'],
            [<Sun className="w-6 h-6" />, '4', 'Generate Impact', 'Cleaner panels, higher energy output, and a sustainable future.', 'soft'],
          ].map(([ic, n, t, d, tone], i, arr) => (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center max-w-[220px]">
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-6 w-6 rounded-full bg-sunk text-muted text-xs font-black flex items-center justify-center">{n}</span>
                  <IconBubble tone={tone}>{ic}</IconBubble>
                </div>
                <h3 className="font-black text-ink">{t}</h3>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed">{d}</p>
              </div>
              {i < arr.length - 1 && <div className="rotate-90 lg:rotate-0"><Arrow /></div>}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section id="about" className="max-w-7xl mx-auto px-6 lg:px-8 pb-20">
        <div className="relative rounded-[2rem] border border-line bg-soft overflow-hidden px-8 lg:px-14 py-12 flex flex-wrap items-center justify-between gap-6">
          <Leaf className="w-40 h-40 absolute -left-6 -bottom-8 text-emerald-200/60" />
          <div className="relative">
            <p className="micro text-accent">Ready to power a cleaner tomorrow?</p>
            <h2 className="mt-2 text-3xl lg:text-4xl font-black tracking-tight">Let's make solar work smarter.</h2>
          </div>
          <div className="relative flex flex-wrap gap-4">
            <button onClick={onEnter} className="flex items-center gap-2 text-white font-bold px-8 py-4 rounded-2xl shadow-elev transition-transform active:scale-95" style={{ background: GREEN }}>
              Log In <span aria-hidden>→</span>
            </button>
            <button onClick={() => scrollTo('top')} className="font-bold px-8 py-4 rounded-2xl bg-surface border border-line text-ink hover:border-slate-300 transition-colors">
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-line bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg flex items-center justify-center text-white" style={{ background: GREEN }}><Leaf className="w-4 h-4" /></span>
            <span className="font-black" style={{ color: GREEN }}>Kleanbotics</span>
          </div>
          <p className="text-xs font-bold text-muted">© {new Date().getFullYear()} Kleanbotics · Cleaner Panels. Brighter Tomorrow.</p>
        </div>
      </footer>
    </div>
  );
}
