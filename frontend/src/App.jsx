import { useState, useEffect } from 'react';
import FarmMap from './components/FarmMap/FarmMap';
import FarmControls from './components/FarmControls/FarmControls';
import RobotMonitor from './components/RobotMonitor/RobotMonitor';
import Reports from './components/Reports/Reports';
import Alerts from './components/Alerts/Alerts';
import FarmManager from './components/FarmManager/FarmManager';
import Explorer from './components/Explorer/Explorer';
import Integrations from './components/Integrations/Integrations';
import Landing from './components/Landing/Landing';
import { navigate } from './hooks/useHashRoute';
import { ToastProvider } from './components/common/Toast';
import CommandPalette from './components/common/CommandPalette';
import { isDark, toggleTheme } from './theme';

function App() {
  const [botStatus, setBotStatus] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [currentView, setCurrentView] = useState('monitor'); 
  const [activeFarmId, setActiveFarmId] = useState('');

  // --- AUTHENTICATION STATE ---
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem("isLoggedIn") === "true");
  const [userRole, setUserRole] = useState(() => localStorage.getItem("userRole") || "user");
  const [loginRole, setLoginRole] = useState('user'); // 'admin' or 'user'
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showLogin, setShowLogin] = useState(false); // landing -> login gate
  const [dark, setDark] = useState(isDark());

  // 1. DATA POLLING
  useEffect(() => {
    if (!isLoggedIn) return;

    const getBackendData = async () => {
      try {
        const response = await fetch('http://localhost:5050/api/fakedataRoutes/fake-data');
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        setBotStatus(data);
      } catch (err) {
        console.error("Backend connection failed:", err);
      }
    };
    getBackendData();
    const interval = setInterval(getBackendData, 5000); 
    return () => clearInterval(interval);
  }, [isLoggedIn]);

  // Handle Login
  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError('');

    if (loginRole === 'admin') {
      if (password === 'admin') {
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("userRole", "admin");
        setIsLoggedIn(true);
        setUserRole("admin");
        setCurrentView('monitor');
      } else {
        setLoginError('Invalid Administrator Password');
      }
    } else {
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("userRole", "user");
      setIsLoggedIn(true);
      setUserRole("user");
      setCurrentView('monitor');
    }
  };

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("userRole");
    setIsLoggedIn(false);
    setUserRole("user");
    setPassword('');
    setLoginError('');
    setShowLogin(false); // return to the marketing landing
  };

  // 2. ICONS
  const icons = {
    monitor: <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>,
    controls: <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" /></svg>,
    alerts: <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
    reports: <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
    manage: <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>,
    explorer: <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>,
    integrations: <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
    robot: <svg className="w-5 h-5 mr-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="10" rx="2" strokeWidth="2" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8V5m0 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM9 13h.01M15 13h.01M2 12v2m20-2v2" /></svg>,
    logout: <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
  };

  const farmIds = Object.keys(botStatus);
  const totalAlerts = farmIds.reduce((acc, id) => acc + (botStatus[id].error_code !== 0 ? 1 : 0), 0);

  // --- RENDER MARKETING LANDING BEFORE THE LOGIN GATE ---
  if (!isLoggedIn && !showLogin) {
    return <Landing onEnter={() => setShowLogin(true)} />;
  }

  // --- RENDER LOGIN IF NOT LOGGED IN ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-page flex justify-center items-center px-4 py-10 font-sans">
        <div className="w-full max-w-xl bg-surface rounded-[2rem] border border-line shadow-elev p-6 sm:p-8 relative overflow-hidden">
          {/* faint leaf watermark */}
          <svg className="absolute -left-8 top-12 w-40 h-40 text-emerald-50 pointer-events-none" viewBox="0 0 24 24" fill="currentColor"><path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" /></svg>

          {/* top row */}
          <div className="flex justify-between items-start relative">
            <button
              type="button"
              onClick={() => setShowLogin(false)}
              className="flex items-center gap-2 text-sm font-black text-ink hover:text-accent transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M11 18l-6-6 6-6" /></svg>
              Back to Site
            </button>
            <div className="text-right text-[10px] font-black tracking-[.2em] text-accent border-r-2 border-accent pr-3 leading-[1.8]">
              CLEANER<br />SMARTER<br />GREENER
            </div>
          </div>

          {/* logo + title */}
          <div className="text-center relative mt-1">
            <svg className="w-11 h-11 mx-auto text-accent" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1.6 2.6 1.6 5.2 0 7.8-1.6-2.6-1.6-5.2 0-7.8z" /><path d="M12 8.5c3 0 5.3 2.2 5.3 5.2 0 3.2-2.7 5.8-5.3 6.8-2.6-1-5.3-3.6-5.3-6.8 0-3 2.3-5.2 5.3-5.2z" opacity=".85" /></svg>
            <h1 className="text-3xl font-black text-ink tracking-tight mt-2">Kleanbotics</h1>
            <p className="text-[11px] font-black text-muted uppercase tracking-[.2em] mt-2">SCADA Fleet Control Portal</p>
            <p className="text-xs font-medium text-muted mt-1">Monitor. Clean. Generate More.</p>
            <div className="h-[3px] w-10 bg-accent rounded-full mx-auto mt-3" />
          </div>

          <form onSubmit={handleLogin} className="mt-6 relative">
            <p className="text-[11px] font-black text-muted uppercase tracking-[.08em] mb-3">Access Authorization Level</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Viewer */}
              <button
                type="button"
                onClick={() => { setLoginRole('user'); setLoginError(''); }}
                className={`relative overflow-hidden text-left rounded-2xl p-5 h-40 flex flex-col transition-all cursor-pointer ${
                  loginRole === 'user' ? 'border-2 border-accent bg-soft' : 'border border-line bg-surface hover:border-slate-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className={`h-11 w-11 rounded-full flex items-center justify-center ${loginRole === 'user' ? 'bg-white text-accent' : 'bg-sunk text-slate-400'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4" /></svg>
                  </span>
                  <span className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${loginRole === 'user' ? 'border-accent' : 'border-slate-300'}`}>
                    {loginRole === 'user' && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                  </span>
                </div>
                <span className="text-[11px] font-black uppercase tracking-[.08em] text-accent mt-3">Viewer</span>
                <h4 className="text-lg font-black text-ink tracking-tight">Operations</h4>
                <p className="text-xs text-muted mt-1 leading-snug">Access reports, KPIs, map and live status.</p>
                <svg className="absolute bottom-3 right-4 w-12 h-9 text-accent/25" viewBox="0 0 64 48" fill="currentColor"><rect x="0" y="30" width="9" height="18" rx="2" /><rect x="14" y="22" width="9" height="26" rx="2" /><rect x="28" y="14" width="9" height="34" rx="2" /><rect x="42" y="4" width="9" height="44" rx="2" /></svg>
              </button>

              {/* Administrator */}
              <button
                type="button"
                onClick={() => { setLoginRole('admin'); setLoginError(''); }}
                className={`relative overflow-hidden text-left rounded-2xl p-5 h-40 flex flex-col transition-all cursor-pointer ${
                  loginRole === 'admin' ? 'border-2 border-accent bg-soft' : 'border border-line bg-surface hover:border-slate-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className={`h-11 w-11 rounded-full flex items-center justify-center ${loginRole === 'admin' ? 'bg-white text-accent' : 'bg-sunk text-slate-400'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
                  </span>
                  <span className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${loginRole === 'admin' ? 'border-accent' : 'border-slate-300'}`}>
                    {loginRole === 'admin' && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                  </span>
                </div>
                <span className="text-[11px] font-black uppercase tracking-[.08em] text-muted mt-3">Administrator</span>
                <h4 className="text-lg font-black text-ink tracking-tight">System Admin</h4>
                <p className="text-xs text-muted mt-1 leading-snug">Full controls &amp; deployment.</p>
                <svg className="absolute bottom-3 right-3 w-16 h-12 text-slate-300" viewBox="0 0 80 64" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="60" cy="16" r="6" fill="currentColor" stroke="none" />
                  <path strokeLinecap="round" d="M60 3v-2M60 31v-2M73 16h2M45 16h2M69 7l1.5-1.5M50 26l1.5-1.5M69 25l1.5 1.5M50 6l1.5 1.5" />
                  <path d="M24 58l6-24 30 0-6 24z" fill="currentColor" fillOpacity=".15" />
                  <path d="M31 46h28M28 55h28M40 34v21M52 34l2 21" />
                </svg>
              </button>
            </div>

            {loginRole === 'admin' && (
              <div className="mt-5">
                <label className="text-[11px] font-black text-muted uppercase tracking-[.08em] ml-1">Admin Password</label>
                <input
                  type="password"
                  placeholder="Enter 'admin'"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full bg-page border border-line rounded-2xl px-4 py-3 text-sm font-bold text-ink outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all placeholder:text-slate-400"
                  required
                />
              </div>
            )}

            {loginError && (
              <p className="text-xs font-bold text-danger text-center mt-4">{loginError}</p>
            )}

            <button
              type="submit"
              className="mt-6 w-full text-white font-black py-3.5 rounded-2xl text-xs uppercase tracking-[.08em] flex items-center justify-center gap-2.5 transition-transform active:scale-[0.99] cursor-pointer"
              style={{ backgroundColor: '#14532d' }}
            >
              Establish Connection
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-3 text-[11px] font-black tracking-[.15em] text-muted">
            <span>SECURE</span><span className="h-1 w-1 rounded-full bg-accent" /><span>REAL-TIME</span><span className="h-1 w-1 rounded-full bg-accent" /><span>RELIABLE</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
    <div className="flex h-screen bg-page font-sans overflow-hidden">

      {/* SIDEBAR */}
      <div className="w-64 bg-surface text-ink flex flex-col border-r border-line z-20 shrink-0">
        <div className="p-8">
          <h1 className="text-3xl font-black bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent tracking-tighter italic">
            Kleanbotics
          </h1>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button onClick={() => setCurrentView('monitor')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all cursor-pointer border-l-[3px] ${currentView === 'monitor' ? 'bg-soft text-accent font-bold border-accent' : 'border-transparent text-muted hover:bg-sunk hover:text-ink'}`}>
            {icons.monitor} Monitor Map
          </button>

          <button onClick={() => { navigate('/'); setCurrentView('explorer'); }} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all cursor-pointer border-l-[3px] ${currentView === 'explorer' ? 'bg-soft text-accent font-bold border-accent' : 'border-transparent text-muted hover:bg-sunk hover:text-ink'}`}>
            {icons.explorer} Fleet Explorer
          </button>

          <button onClick={() => setCurrentView('alerts')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all cursor-pointer border-l-[3px] ${currentView === 'alerts' ? 'bg-danger-soft text-danger font-bold border-danger' : 'border-transparent text-muted hover:bg-sunk hover:text-ink'}`}>
            {icons.alerts} Alert Tab
            {totalAlerts > 0 && <span className="ml-auto bg-danger text-white text-[10px] px-2 py-0.5 rounded-full">{totalAlerts}</span>}
          </button>

          <button onClick={() => setCurrentView('robot')} className={`w-full flex items-center whitespace-nowrap px-4 py-3 rounded-xl transition-all cursor-pointer border-l-[3px] ${currentView === 'robot' ? 'bg-soft text-accent font-bold border-accent' : 'border-transparent text-muted hover:bg-sunk hover:text-ink'}`}>
            {icons.robot} <span>Robot Control & Monitor</span>
          </button>

          {/* ADMIN ONLY TABS */}
          {userRole === 'admin' && (
            <>
              <button onClick={() => setCurrentView('controls')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all cursor-pointer border-l-[3px] ${currentView === 'controls' ? 'bg-soft text-accent font-bold border-accent' : 'border-transparent text-muted hover:bg-sunk hover:text-ink'}`}>
                {icons.controls} Farm Control
              </button>
              <button onClick={() => setCurrentView('manage')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all cursor-pointer border-l-[3px] ${currentView === 'manage' ? 'bg-soft text-accent font-bold border-accent' : 'border-transparent text-muted hover:bg-sunk hover:text-ink'}`}>
                {icons.manage} Manage Farms
              </button>
              <button onClick={() => setCurrentView('integrations')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all cursor-pointer border-l-[3px] ${currentView === 'integrations' ? 'bg-soft text-accent font-bold border-accent' : 'border-transparent text-muted hover:bg-sunk hover:text-ink'}`}>
                {icons.integrations} Integrations
              </button>
            </>
          )}

          <button onClick={() => setCurrentView('reports')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all cursor-pointer border-l-[3px] ${currentView === 'reports' ? 'bg-soft text-accent font-bold border-accent' : 'border-transparent text-muted hover:bg-sunk hover:text-ink'}`}>
            {icons.reports} Reports
          </button>
        </nav>

        {/* PROFILE & LOGOUT SECTION */}
        <div className="p-4 border-t border-line space-y-3 bg-page">
          {/* ⌘K palette + dark mode toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.dispatchEvent(new Event('toggle-palette'))}
              className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-muted bg-surface border border-line hover:border-slate-300 transition-all cursor-pointer"
            >
              Jump to…
              <span className="text-[9px] bg-sunk px-1.5 py-0.5 rounded">⌘K</span>
            </button>
            <button
              onClick={() => setDark(toggleTheme())}
              title="Toggle dark mode"
              className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl text-muted bg-surface border border-line hover:text-ink transition-all cursor-pointer"
            >
              {dark ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3a1 1 0 011 1v1a1 1 0 11-2 0V4a1 1 0 011-1zm0 15a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm9-6a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5 12a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zm12.66 6.66a1 1 0 01-1.41 0l-.71-.71a1 1 0 011.41-1.41l.71.71a1 1 0 010 1.41zM7.05 7.05a1 1 0 01-1.41 0l-.71-.71A1 1 0 016.34 4.93l.71.71a1 1 0 010 1.41zm12.02-2.12a1 1 0 010 1.41l-.71.71a1 1 0 11-1.41-1.41l.71-.71a1 1 0 011.41 0zM7.05 16.95a1 1 0 010 1.41l-.71.71a1 1 0 01-1.41-1.41l.71-.71a1 1 0 011.41 0zM12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
              )}
            </button>
          </div>
          <div className="flex items-center gap-3 px-2">
            <div className={`h-8 w-8 rounded-xl flex items-center justify-center font-bold text-xs uppercase ${
              userRole === 'admin' ? 'bg-cyan-50 text-cyan-600' : 'bg-soft text-accent'
            }`}>
              {userRole === 'admin' ? 'AD' : 'OP'}
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-black text-ink truncate">
                {userRole === 'admin' ? 'System Administrator' : 'Operations Analyst'}
              </h4>
              <p className="text-[9px] font-bold text-muted uppercase tracking-wider">
                {userRole === 'admin' ? 'Root Access' : 'View Access'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-4 py-2.5 rounded-xl text-xs font-bold text-muted hover:bg-danger-soft hover:text-danger transition-all cursor-pointer"
          >
            {icons.logout} Sign Out
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col overflow-hidden bg-page">
        
        <div className="flex-1 relative h-full overflow-hidden">
            {/* Conditional mount for monitor map to prevent Leaflet sizing bugs */}
            {currentView === 'monitor' && (
            <div className="p-6 h-full flex flex-col animate-in fade-in duration-500">
                <header className="mb-4">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight italic">Fleet Operations Map</h2>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Visualizing {farmIds.length} global solar assets</p>
                </header>
                <div className="flex-1 rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-200 bg-white">
                <FarmMap botStatus={botStatus} setCurrentView={setCurrentView} setActiveFarmId={setActiveFarmId} />
                </div>
            </div>
            )}

            {/* Fleet Explorer — hash-routed drill-down + analytics screens */}
            {currentView === 'explorer' && (
              <div className="h-full overflow-y-auto animate-in fade-in duration-500">
                <Explorer />
              </div>
            )}

            {/* Keep other views mounted in background using hidden styling so states are preserved */}
            <div className={currentView === 'alerts' ? 'h-full overflow-y-auto' : 'hidden'}>
              <Alerts botStatus={botStatus} />
            </div>

            <div className={currentView === 'robot' ? 'h-full overflow-y-auto' : 'hidden'}>
              <RobotMonitor botStatus={botStatus} canControl={userRole === 'admin'} />
            </div>

            {userRole === 'admin' && (
              <>
                <div className={currentView === 'controls' ? 'h-full overflow-y-auto' : 'hidden'}>
                  <div className="p-8 max-w-7xl mx-auto w-full flex flex-col animate-in slide-in-from-bottom-4 duration-500">
                    <FarmControls botStatus={botStatus} setBotStatus={setBotStatus} notifications={notifications} setNotifications={setNotifications} activeFarmId={activeFarmId} setActiveFarmId={setActiveFarmId} />
                  </div>
                </div>

                <div className={currentView === 'manage' ? 'h-full overflow-y-auto' : 'hidden'}>
                  <FarmManager onFarmChange={(id) => {
                    setActiveFarmId(id);
                    setCurrentView('controls');
                  }} />
                </div>

                {currentView === 'integrations' && (
                  <div className="h-full overflow-y-auto animate-in fade-in duration-500">
                    <Integrations />
                  </div>
                )}
              </>
            )}

            <div className={currentView === 'reports' ? 'h-full overflow-y-auto' : 'hidden'}>
              <Reports botStatus={botStatus} />
            </div>
        </div>

        {/* 3. REAL-TIME STATUS BAR (Bottom) */}
        <footer className="h-10 bg-surface border-t border-line px-6 flex items-center justify-between z-30 shrink-0">
            <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest">
                <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${totalAlerts > 0 ? 'bg-danger animate-pulse' : 'bg-accent-fill'}`}></span>
                    <span className="text-muted">System Status:</span>
                    <span className={totalAlerts > 0 ? 'text-danger' : 'text-accent'}>{totalAlerts > 0 ? 'FAULTS DETECTED' : 'ALL NOMINAL'}</span>
                </div>
                <div className="h-3 w-[1px] bg-line"></div>
                <div className="text-muted">
                    Last Update: {new Date().toLocaleTimeString()}
                </div>
            </div>
            <button onClick={() => setCurrentView('alerts')} className="text-[9px] font-black text-muted hover:text-ink transition-colors uppercase tracking-widest">
                View Alert Details →
            </button>
        </footer>
      </div>
    </div>
    <CommandPalette onJump={(p) => { navigate(p); setCurrentView('explorer'); }} />
    </ToastProvider>
  );
}

export default App;