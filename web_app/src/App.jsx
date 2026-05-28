import React, { useEffect, useState } from 'react';
import { auth, db } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';

import Login from './components/Login';
import Landing from './components/Landing';
import Dashboard from './components/Dashboard';
import Vault from './components/Vault';
import VideoMessages from './components/VideoMessages';
import Contacts from './components/Contacts';
import Settings from './components/Settings';
import DeathClaim from './components/DeathClaim';
import AdminPanel from './components/AdminPanel';

import {
  Shield, LayoutDashboard, KeyRound, Film,
  Users, Settings as SettingsIcon, LogOut,
  ChevronRight, Menu, X, ShieldAlert
} from 'lucide-react';
import { t, getBrowserLanguage } from './services/translation';

const NAV_ITEMS = [
  { id: 'dashboard',      label: 'Dashboard',       icon: LayoutDashboard },
  { id: 'vault',          label: 'Digital Vault',   icon: KeyRound },
  { id: 'video-messages', label: 'Messages',         icon: Film },
  { id: 'contacts',       label: 'Beneficiaries',   icon: Users },
  { id: 'settings',       label: 'Settings',        icon: SettingsIcon },
];

function App() {
  const [user, setUser]                 = useState(null);
  const [masterPassword, setMasterPassword] = useState('');
  const [activeTab, setActiveTab]       = useState('dashboard');
  const [loading, setLoading]           = useState(true);
  const [showDeathClaim, setShowDeathClaim] = useState(false);
  const [showLanding, setShowLanding]   = useState(true);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [userData, setUserData]         = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (cu) => {
      setUser(cu);
      if (cu) {
        try {
          const ref = doc(db, 'users', cu.uid);
          await setDoc(ref, { lastActive: serverTimestamp() }, { merge: true });
          const snap = await getDoc(ref);
          if (snap.exists()) {
            setUserData(snap.data());
          }
        } catch (e) { console.warn('lastActive update skipped:', e.message); }
      } else {
        setMasterPassword('');
        setUserData(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleSignOut = () => {
    import('./services/firebase').then(({ auth }) =>
      import('firebase/auth').then(({ signOut }) => signOut(auth))
    );
    setUser(null); setMasterPassword(''); setActiveTab('dashboard'); setUserData(null);
  };

  /* ── Loading screen ── */
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 44, height: 44, background: 'var(--gold-dim)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Shield style={{ width: 22, height: 22, color: 'var(--gold)' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.70rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Initializing Secure Environment</span>
          <div style={{ width: 120, height: 2, background: 'var(--border-sub)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--gold)', width: '40%', borderRadius: 2, animation: 'loadingBar 1.2s ease-in-out infinite alternate' }} />
          </div>
        </div>
        <style>{`@keyframes loadingBar { from { transform: translateX(0); } to { transform: translateX(180px); } }`}</style>
      </div>
    );
  }

  if (showDeathClaim) return <DeathClaim onBack={() => { setShowDeathClaim(false); setShowLanding(true); }} />;
  if (!user || !masterPassword) {
    if (showLanding) {
      return <Landing onEnterApp={() => setShowLanding(false)} onShowDeathClaim={() => { setShowLanding(false); setShowDeathClaim(true); }} />;
    }
    return <Login onAuthSuccess={p => setMasterPassword(p)} onShowDeathClaim={() => setShowDeathClaim(true)} onBack={() => setShowLanding(true)} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':      return <Dashboard user={user} userData={userData} onNavigate={setActiveTab} />;
      case 'vault':          return <Vault user={user} masterPassword={masterPassword} />;
      case 'video-messages': return <VideoMessages user={user} />;
      case 'contacts':       return <Contacts user={user} />;
      case 'settings':       return <Settings user={user} userData={userData} masterPassword={masterPassword} onSignOut={handleSignOut} />;
      case 'admin':          return <AdminPanel />;
      default:               return <Dashboard user={user} userData={userData} onNavigate={setActiveTab} />;
    }
  };

  const navItems = [...NAV_ITEMS];
  if (userData?.role === 'admin') {
    navItems.push({ id: 'admin', label: 'Admin Console', icon: ShieldAlert });
  }

  const activeItem = navItems.find(n => n.id === activeTab) || NAV_ITEMS[0];
  const displayName = userData?.firstName ? `${userData.firstName} ${userData.lastName || ''}`.trim() : user.email;
  const initials = userData?.firstName ? `${userData.firstName[0]}${userData.lastName?.[0] || ''}`.toUpperCase() : user.email[0].toUpperCase();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-deep)' }}>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 49 }}
        />
      )}

      {/* ── Sidebar ── */}
      <aside style={{
        width: 240, minHeight: '100vh',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-sub)',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: 0, zIndex: 50,
        transition: 'transform 0.25s ease',
        transform: sidebarOpen ? 'translateX(0)' : undefined,
      }} className="lv-sidebar">

        {/* Logo */}
        <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid var(--border-sub)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'var(--gold-dim)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Shield style={{ width: 16, height: 16, color: 'var(--gold)' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.80rem', fontWeight: 800, letterSpacing: '0.07em', color: 'var(--text-primary)' }}>LEGACY VAULT</div>
              <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>Secure Estate Portal</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '12px 10px', flex: 1 }}>
          <div style={{ fontSize: '0.60rem', fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '6px 6px 8px', marginBottom: 4 }}>Navigation</div>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); setSidebarOpen(false); }}
              className={`lv-nav-item ${activeTab === id ? 'active' : ''}`}
              style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 2 }}
            >
              <Icon style={{ width: 15, height: 15, flexShrink: 0 }} />
              {label}
              {activeTab === id && <ChevronRight style={{ width: 13, height: 13, marginLeft: 'auto', opacity: 0.6 }} />}
            </button>
          ))}
        </nav>

        {/* User footer */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid var(--border-sub)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 8, marginBottom: 6 }}>
            <div style={{ width: 30, height: 30, borderRadius: 6, background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="lv-nav-item"
            style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: '#EF4444' }}
          >
            <LogOut style={{ width: 14, height: 14 }} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="lv-main" style={{ flex: 1 }}>
        {/* Top bar */}
        <header className="lv-topbar">
          <button
            onClick={() => setSidebarOpen(v => !v)}
            style={{ marginRight: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6, display: 'none' }}
            className="mobile-menu-btn"
          >
            <Menu style={{ width: 20, height: 20 }} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span>Legacy Vault</span>
            <ChevronRight style={{ width: 12, height: 12 }} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{activeItem?.label}</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem' }}>
              <div className="lv-dot lv-dot-green" />
              <span style={{ color: 'var(--text-muted)' }}>AES-256 Active</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="lv-content lv-fade-in">
          {renderContent()}
        </main>
      </div>

      <style>{`
        @media(max-width:900px) {
          .lv-main { margin-left: 0 !important; }
          .mobile-menu-btn { display: flex !important; }
          .lv-sidebar { transform: ${sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'}; }
        }
      `}</style>
    </div>
  );
}

export default App;
