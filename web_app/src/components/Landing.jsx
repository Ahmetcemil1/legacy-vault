import React, { useState, useEffect } from 'react';
import {
  Shield, Key, Activity, ShieldCheck, FileText, ChevronRight,
  Lock, Eye, Users, Scale, Clock, Server, Fingerprint,
  ArrowRight, CheckCircle, Globe, Layers, Database,
  ArrowDown, Mail, Phone, MapPin
} from 'lucide-react';

export default function Landing({ onEnterApp, onShowDeathClaim }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const FEATURES = [
    {
      icon: Lock,
      title: 'AES-256 Client-Side Encryption',
      desc: 'All vault credentials, documents, and private notes are encrypted directly in your browser before transmission. Our infrastructure processes only ciphertext — your master key is never stored or transmitted.'
    },
    {
      icon: Activity,
      title: 'Dead Man\'s Switch Protocol',
      desc: 'A configurable inactivity heartbeat monitors account activity. When the threshold expires without a confirmed check-in, automated estate release procedures begin with multi-stage notifications.'
    },
    {
      icon: Users,
      title: 'Granular Beneficiary Permissions',
      desc: 'Assign specific vault items, documents, and messages to individual beneficiaries. Each heir receives access only to designated assets — never the full vault contents.'
    },
    {
      icon: Scale,
      title: 'Legal Estate Claim Processing',
      desc: 'A structured verification workflow for estate settlement. Claimants submit death certificates and identification documents through a secure, multi-step claim process with administrative review.'
    },
    {
      icon: FileText,
      title: 'Secure Document & Video Messages',
      desc: 'Upload encrypted personal messages, final instructions, and video recordings designated for specific beneficiaries. Released automatically upon verified estate trigger events.'
    },
    {
      icon: Globe,
      title: 'Multi-Language Support',
      desc: 'Full localization across 9 languages including English, Turkish, German, French, Spanish, Italian, Russian, Chinese, and Japanese — ensuring global accessibility for international estates.'
    }
  ];

  const STEPS = [
    {
      num: '01',
      title: 'Create Your Secure Account',
      desc: 'Register with verified personal information including full legal identity, contact details, and address. Your master password is generated and stored exclusively on your device.'
    },
    {
      num: '02',
      title: 'Configure Your Digital Vault',
      desc: 'Store credentials, passwords, secure notes, personal letters, and video messages. Assign each item to specific beneficiaries with individual access permissions.'
    },
    {
      num: '03',
      title: 'Set Your Inactivity Threshold',
      desc: 'Configure the Dead Man\'s Switch timer. Confirm your presence periodically through heartbeat check-ins. When the threshold lapses, the system initiates multi-stage notifications.'
    },
    {
      num: '04',
      title: 'Automated Estate Release',
      desc: 'Upon verified trigger — either inactivity timeout or a processed death certificate claim — designated beneficiaries receive secure access to their assigned vault contents.'
    }
  ];

  const STATS = [
    { value: 'AES-256', label: 'Encryption Standard' },
    { value: 'Zero', label: 'Server-Side Key Access' },
    { value: '9', label: 'Supported Languages' },
    { value: '24/7', label: 'Heartbeat Monitoring' }
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-deep)',
      color: 'var(--text-primary)',
      fontFamily: "'Inter', sans-serif",
      position: 'relative',
      overflow: 'hidden'
    }}>

      {/* ── Navigation ── */}
      <header style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 64,
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 100,
        background: scrolled ? 'rgba(5, 10, 24, 0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--border-sub)' : '1px solid transparent',
        transition: 'all 0.3s ease'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'var(--gold-dim)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield style={{ width: 15, height: 15, color: 'var(--gold)' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-primary)' }}>LEGACY VAULT</div>
            <div style={{ fontSize: '0.52rem', color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Secure Estate Platform</div>
          </div>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href="#features" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'none', padding: '6px 12px', borderRadius: 6, transition: 'color 0.15s' }}>Features</a>
          <a href="#how-it-works" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'none', padding: '6px 12px', borderRadius: 6, transition: 'color 0.15s' }}>How It Works</a>
          <a href="#security" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'none', padding: '6px 12px', borderRadius: 6, transition: 'color 0.15s' }}>Security</a>
          <div style={{ width: 1, height: 20, background: 'var(--border-sub)', margin: '0 8px' }} />
          <button onClick={onShowDeathClaim} className="lv-btn lv-btn-ghost lv-btn-sm" style={{ fontSize: '0.76rem' }}>
            File a Claim
          </button>
          <button onClick={onEnterApp} className="lv-btn lv-btn-gold lv-btn-sm" style={{ padding: '7px 16px' }}>
            Access Portal
          </button>
        </nav>
      </header>

      {/* ── Hero Section ── */}
      <section style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '120px 24px 80px',
        position: 'relative',
        textAlign: 'center'
      }}>
        {/* Background gradient */}
        <div style={{
          position: 'absolute',
          top: '-20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '80vw',
          height: '80vw',
          background: 'radial-gradient(circle, rgba(201,168,76,0.04) 0%, transparent 60%)',
          pointerEvents: 'none'
        }} />

        <div style={{ position: 'relative', zIndex: 5, maxWidth: 760, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
          {/* Status badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            background: 'rgba(201,168,76,0.06)',
            border: '1px solid rgba(201,168,76,0.15)',
            borderRadius: 20,
            fontSize: '0.68rem',
            fontWeight: 600,
            color: 'var(--gold)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase'
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)' }} />
            Military-Grade Cryptographic Asset Protection
          </div>

          {/* Main heading */}
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3.2rem)',
            fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: '-0.03em',
            lineHeight: 1.12,
            margin: 0
          }}>
            Secure Your Digital<br />
            Heritage for Future<br />
            <span style={{ color: 'var(--gold)' }}>Generations</span>
          </h1>

          {/* Subtitle */}
          <p style={{
            fontSize: '1.00rem',
            color: 'var(--text-sec)',
            lineHeight: 1.65,
            maxWidth: 580,
            margin: 0
          }}>
            A professional zero-knowledge estate management platform. Securely preserve
            encrypted credentials, legal documents, and personal messages — transferred
            automatically to designated heirs through verified settlement procedures.
          </p>

          {/* CTA Buttons */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={onEnterApp} className="lv-btn lv-btn-gold lv-btn-lg" style={{
              minWidth: 200,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontSize: '0.88rem', padding: '14px 28px'
            }}>
              Initialize Your Vault
              <ArrowRight style={{ width: 16, height: 16 }} />
            </button>
            <button onClick={onShowDeathClaim} className="lv-btn lv-btn-outline lv-btn-lg" style={{
              minWidth: 200,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontSize: '0.88rem', padding: '14px 28px'
            }}>
              <FileText style={{ width: 16, height: 16 }} />
              File Estate Claim
            </button>
          </div>

          {/* Stats bar */}
          <div style={{
            display: 'flex',
            gap: 0,
            marginTop: 24,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-sub)',
            borderRadius: 12,
            overflow: 'hidden',
            width: '100%',
            maxWidth: 600
          }}>
            {STATS.map((s, i) => (
              <div key={i} style={{
                flex: 1,
                padding: '16px 12px',
                textAlign: 'center',
                borderRight: i < STATS.length - 1 ? '1px solid var(--border-sub)' : 'none'
              }}>
                <div style={{ fontSize: '1.20rem', fontWeight: 800, color: 'var(--gold)', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div style={{
          position: 'absolute',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          opacity: 0.4,
          animation: 'scrollBounce 2s ease-in-out infinite'
        }}>
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Scroll</span>
          <ArrowDown style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
        </div>
      </section>

      {/* ── Features Section ── */}
      <section id="features" style={{
        padding: '100px 24px',
        maxWidth: 1100,
        margin: '0 auto'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Platform Capabilities</div>
          <h2 style={{ fontSize: '2.00rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0, marginBottom: 12 }}>
            Enterprise-Grade Estate Management
          </h2>
          <p style={{ fontSize: '0.90rem', color: 'var(--text-sec)', maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
            Every component of Legacy Vault is engineered for security, compliance, and reliability — from client-side encryption to automated beneficiary notifications.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {FEATURES.map((f, i) => {
            const FIcon = f.icon;
            return (
              <div key={i} style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-sub)',
                borderRadius: 12,
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                transition: 'border-color 0.2s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(201,168,76,0.3)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-sub)'}
              >
                <div style={{ width: 40, height: 40, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.12)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FIcon style={{ width: 18, height: 18, color: 'var(--gold)' }} />
                </div>
                <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{f.title}</h3>
                <p style={{ fontSize: '0.80rem', color: 'var(--text-sec)', lineHeight: 1.55, margin: 0 }}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how-it-works" style={{
        padding: '100px 24px',
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-sub)',
        borderBottom: '1px solid var(--border-sub)'
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Process</div>
            <h2 style={{ fontSize: '2.00rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0, marginBottom: 12 }}>
              How Legacy Vault Works
            </h2>
            <p style={{ fontSize: '0.90rem', color: 'var(--text-sec)', maxWidth: 500, margin: '0 auto', lineHeight: 1.6 }}>
              A four-step process from account creation to automated estate release.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {STEPS.map((step, i) => (
              <div key={i} style={{
                display: 'flex',
                gap: 24,
                padding: '32px 0',
                borderBottom: i < STEPS.length - 1 ? '1px solid var(--border-sub)' : 'none',
                alignItems: 'flex-start'
              }}>
                <div style={{
                  width: 48, height: 48,
                  background: 'rgba(201,168,76,0.06)',
                  border: '1px solid rgba(201,168,76,0.15)',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  color: 'var(--gold)',
                  flexShrink: 0,
                  letterSpacing: '0.02em'
                }}>
                  {step.num}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.00rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>{step.title}</h3>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-sec)', lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Security Section ── */}
      <section id="security" style={{
        padding: '100px 24px',
        maxWidth: 1100,
        margin: '0 auto'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Security Architecture</div>
          <h2 style={{ fontSize: '2.00rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0, marginBottom: 12 }}>
            Zero-Trust Security by Design
          </h2>
          <p style={{ fontSize: '0.90rem', color: 'var(--text-sec)', maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
            Your sensitive data is protected at every layer — from browser to storage. We cannot access your encrypted information, even under legal compulsion.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {[
            { icon: Lock, label: 'AES-256-CBC Encryption', detail: 'Industry-standard symmetric encryption applied client-side before any network transmission' },
            { icon: Fingerprint, label: 'Zero-Knowledge Architecture', detail: 'Your master password is never stored on our servers — decryption occurs exclusively in your browser' },
            { icon: Server, label: 'Isolated Data Storage', detail: 'Each user\'s vault data is segmented with Firestore security rules enforcing authenticated-only access' },
            { icon: Database, label: 'Encrypted Backups', detail: 'Export your vault as an AES-256 encrypted JSON archive for local offline backup storage' },
            { icon: ShieldCheck, label: 'Multi-Stage Verification', detail: 'Estate claims require document upload, identity verification, and administrative approval before release' },
            { icon: Layers, label: 'Role-Based Access Control', detail: 'Beneficiary permissions are enforced at the document level — each heir sees only their assigned items' },
          ].map((item, i) => {
            const IIcon = item.icon;
            return (
              <div key={i} style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-sub)',
                borderRadius: 10,
                padding: '22px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <IIcon style={{ width: 16, height: 16, color: 'var(--gold)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{item.label}</span>
                </div>
                <p style={{ fontSize: '0.76rem', color: 'var(--text-sec)', lineHeight: 1.5, margin: 0 }}>{item.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section style={{
        padding: '80px 24px',
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-sub)',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{
            width: 56, height: 56,
            background: 'var(--gold-dim)',
            border: '1px solid rgba(201,168,76,0.25)',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px'
          }}>
            <Shield style={{ width: 26, height: 26, color: 'var(--gold)' }} />
          </div>
          <h2 style={{ fontSize: '1.60rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 12 }}>
            Begin Securing Your Digital Legacy
          </h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-sec)', lineHeight: 1.6, marginBottom: 28 }}>
            Create your encrypted vault in minutes. No credit card required. Full control of your data from day one.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onEnterApp} className="lv-btn lv-btn-gold lv-btn-lg" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '14px 28px', fontSize: '0.88rem'
            }}>
              Create Your Account
              <ArrowRight style={{ width: 16, height: 16 }} />
            </button>
            <button onClick={onShowDeathClaim} className="lv-btn lv-btn-outline lv-btn-lg" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '14px 28px', fontSize: '0.88rem'
            }}>
              <Scale style={{ width: 16, height: 16 }} />
              File Estate Claim
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        padding: '40px 32px',
        borderTop: '1px solid var(--border-sub)',
        background: 'var(--bg-deep)'
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, background: 'var(--gold-dim)', border: '1px solid rgba(201,168,76,0.20)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield style={{ width: 12, height: 12, color: 'var(--gold)' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.06em' }}>LEGACY VAULT</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>Secure Digital Estate Platform</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Terms of Service</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Privacy Policy</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Contact</span>
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            &copy; {new Date().getFullYear()} Legacy Vault. All rights reserved.
          </div>
        </div>
      </footer>

      {/* ── Animations ── */}
      <style>{`
        @keyframes scrollBounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(6px); }
        }
        a[href^="#"]:hover {
          color: var(--text-primary) !important;
        }
        @media (max-width: 768px) {
          nav { display: none !important; }
          section { padding-left: 16px !important; padding-right: 16px !important; }
        }
      `}</style>
    </div>
  );
}
