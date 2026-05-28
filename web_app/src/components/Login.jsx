import React, { useState } from 'react';
import { auth, db } from '../services/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Shield, Mail, Lock, Eye, EyeOff, User, Phone, MapPin, Calendar, Globe, FileText, AlertCircle, ChevronRight, CheckCircle, ArrowLeft, Clock, Users, Scale } from 'lucide-react';
import { t } from '../services/translation';

/* ── Tiny helpers ── */
const Field = ({ label, children, hint }) => (
  <div className="lv-field">
    <label className="lv-label">{label}</label>
    {children}
    {hint && <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 5 }}>{hint}</p>}
  </div>
);

const InputIcon = ({ icon: Icon, type = 'text', value, onChange, placeholder, required, autoComplete, rightElement }) => (
  <div style={{ position: 'relative' }}>
    <Icon style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--text-muted)', pointerEvents: 'none' }} />
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      autoComplete={autoComplete}
      className="lv-input"
      style={{ paddingLeft: 40, paddingRight: rightElement ? 44 : 14 }}
    />
    {rightElement}
  </div>
);

/* ── Registration progress steps ── */
const STEPS = ['Account', 'Personal', 'Address'];

const StepIndicator = ({ current }) => (
  <div className="lv-steps">
    {STEPS.map((label, i) => {
      const state = i < current ? 'done' : i === current ? 'active' : '';
      return (
        <React.Fragment key={i}>
          <div className={`lv-step ${state}`}>
            <div className="lv-step-num">
              {i < current ? <CheckCircle style={{ width: 13, height: 13 }} /> : i + 1}
            </div>
            <span>{label}</span>
          </div>
          {i < STEPS.length - 1 && <div className="lv-step-sep" />}
        </React.Fragment>
      );
    })}
  </div>
);

export default function Login({ onAuthSuccess, onShowDeathClaim, onBack }) {
  const [isRegister, setIsRegister] = useState(false);
  const [regStep, setRegStep] = useState(0);

  /* Login fields */
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  /* Register — Step 0: Account */
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);

  /* Register — Step 1: Personal */
  const [firstName, setFirstName]   = useState('');
  const [lastName, setLastName]     = useState('');
  const [phone, setPhone]           = useState('');
  const [dob, setDob]               = useState('');
  const [nationality, setNationality] = useState('');

  /* Register — Step 2: Address */
  const [address, setAddress]   = useState('');
  const [city, setCity]         = useState('');
  const [state, setState]       = useState('');
  const [country, setCountry]   = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /* ── Password strength ── */
  const passStrength = () => {
    const p = regPassword;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (p.length >= 12) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  };
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'][passStrength()];
  const strengthColor = ['', '#EF4444', '#F59E0B', '#3B82F6', '#22C55E', '#22C55E'][passStrength()];

  /* ── Step validation ── */
  const validateStep = () => {
    setError('');
    if (regStep === 0) {
      if (!regEmail.trim() || !regPassword || !regConfirm) { setError('All account fields are required.'); return false; }
      if (regPassword !== regConfirm) { setError('Passwords do not match.'); return false; }
      if (regPassword.length < 8) { setError('Password must be at least 8 characters.'); return false; }
    }
    if (regStep === 1) {
      if (!firstName.trim() || !lastName.trim() || !phone.trim() || !dob) { setError('First name, last name, phone, and date of birth are required.'); return false; }
    }
    if (regStep === 2) {
      if (!country.trim()) { setError('Country is required.'); return false; }
      if (!agreeTerms || !agreePrivacy) { setError('You must accept the Terms of Service and Privacy Policy.'); return false; }
    }
    return true;
  };

  const handleNextStep = (e) => {
    e.preventDefault();
    if (!validateStep()) return;
    setRegStep(s => s + 1);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!validateStep()) return;
    setLoading(true);
    setError('');
    try {
      const generateUserCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let part1 = '';
        let part2 = '';
        for (let i = 0; i < 4; i++) part1 += chars.charAt(Math.floor(Math.random() * chars.length));
        for (let i = 0; i < 4; i++) part2 += chars.charAt(Math.floor(Math.random() * chars.length));
        return `LV-${part1}-${part2}`;
      };

      const cred = await createUserWithEmailAndPassword(auth, regEmail, regPassword);
      await setDoc(doc(db, 'users', cred.user.uid), {
        email:          regEmail,
        firstName,
        lastName,
        displayName:    `${firstName} ${lastName}`,
        phone,
        dateOfBirth:    dob,
        nationality,
        address,
        city,
        state,
        country,
        postalCode,
        createdAt:          serverTimestamp(),
        deadMansSwitchEnabled: true,
        thresholdDays:  30,
        lastActive:     serverTimestamp(),
        switchTriggered: false,
        kycStatus:      'pending',
        userCode:       generateUserCode(),
      });
      onAuthSuccess(regPassword);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') setError(t('email_in_use'));
      else if (err.code === 'auth/weak-password') setError(t('weak_password'));
      else setError(t('generic_auth_error'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      onAuthSuccess(password);
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')
        setError(t('invalid_credentials'));
      else setError(t('generic_auth_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lv-auth-bg">
      {/* ── Left panel ── */}
      <div className="lv-auth-panel">
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
          {onBack && (
            <button onClick={onBack} style={{ background: 'none', border: '1px solid var(--border-sub)', borderRadius: 7, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0, transition: 'all 0.15s' }}>
              <ArrowLeft style={{ width: 14, height: 14 }} />
            </button>
          )}
          <div style={{ width: 36, height: 36, background: 'var(--gold-dim)', border: '1px solid rgba(201,168,76,0.30)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield style={{ width: 18, height: 18, color: 'var(--gold)' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-primary)' }}>LEGACY VAULT</div>
            <div style={{ fontSize: '0.60rem', color: 'var(--text-muted)', letterSpacing: '0.10em', textTransform: 'uppercase', marginTop: 1 }}>Digital Estate Platform</div>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border-sub)', borderRadius: 10, padding: 4, marginBottom: 28 }}>
          {['Sign In', 'Create Account'].map((label, i) => (
            <button
              key={i}
              onClick={() => { setIsRegister(i === 1); setError(''); setRegStep(0); }}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: '0.80rem', fontWeight: 600, transition: 'all 0.15s',
                background: (i === 0 ? !isRegister : isRegister) ? 'var(--bg-surface)' : 'transparent',
                color: (i === 0 ? !isRegister : isRegister) ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: (i === 0 ? !isRegister : isRegister) ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="lv-alert lv-alert-error" style={{ marginBottom: 20 }}>
            <AlertCircle style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {/* ──────── SIGN IN ──────── */}
        {!isRegister && (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 6 }}>
              <h2 style={{ fontSize: '1.20rem', fontWeight: 700, color: 'var(--text-primary)' }}>Welcome back</h2>
              <p style={{ fontSize: '0.80rem', color: 'var(--text-muted)', marginTop: 4 }}>Sign in to access your secure digital vault.</p>
            </div>
            <div className="lv-divider" />
            <Field label="Email Address">
              <InputIcon icon={Mail} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" />
            </Field>
            <Field label="Password / Master Key" hint="This password is used locally to encrypt and decrypt your vault. Never shared.">
              <InputIcon
                icon={Lock} type={showPass ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password"
                rightElement={
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                    {showPass ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                  </button>
                }
              />
            </Field>
            <button type="submit" disabled={loading} className="lv-btn lv-btn-gold lv-btn-full lv-btn-lg" style={{ marginTop: 8 }}>
              {loading ? <span className="lv-spin" /> : <>Decrypt Vault <ChevronRight style={{ width: 16, height: 16 }} /></>}
            </button>

            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border-sub)', textAlign: 'center' }}>
              <button
                type="button"
                onClick={onShowDeathClaim}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: '0.78rem', color: '#EF4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, transition: 'all 0.15s' }}
              >
                <FileText style={{ width: 14, height: 14 }} />
                File an Estate Claim (Death Certificate)
              </button>
            </div>
          </form>
        )}

        {/* ──────── REGISTER ──────── */}
        {isRegister && (
          <>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.20rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {regStep === 0 ? 'Create Your Account' : regStep === 1 ? 'Personal Information' : 'Address & Verification'}
              </h2>
              <p style={{ fontSize: '0.80rem', color: 'var(--text-muted)', marginTop: 4 }}>
                {regStep === 0 ? 'Set up your secure vault credentials.' : regStep === 1 ? 'Required for identity verification and estate claims.' : 'Your legal address for document processing.'}
              </p>
            </div>

            <StepIndicator current={regStep} />

            {/* Step 0 — Account */}
            {regStep === 0 && (
              <form onSubmit={handleNextStep}>
                <Field label="Email Address">
                  <InputIcon icon={Mail} type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" />
                </Field>
                <Field label="Master Password" hint="Minimum 8 characters. Used to encrypt your vault locally — never transmitted.">
                  <InputIcon icon={Lock} type={showRegPass ? 'text' : 'password'} value={regPassword} onChange={e => setRegPassword(e.target.value)} placeholder="••••••••" required autoComplete="new-password"
                    rightElement={
                      <button type="button" onClick={() => setShowRegPass(v => !v)}
                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                        {showRegPass ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                      </button>
                    }
                  />
                  {regPassword && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                        {[1,2,3,4,5].map(i => (
                          <div key={i} style={{ flex: 1, height: 3, borderRadius: 3, background: i <= passStrength() ? strengthColor : 'var(--border-sub)', transition: 'background 0.2s' }} />
                        ))}
                      </div>
                      <span style={{ fontSize: '0.70rem', color: strengthColor }}>{strengthLabel}</span>
                    </div>
                  )}
                </Field>
                <Field label="Confirm Password">
                  <InputIcon icon={Lock} type="password" value={regConfirm} onChange={e => setRegConfirm(e.target.value)} placeholder="••••••••" required autoComplete="new-password" />
                  {regConfirm && regPassword !== regConfirm && (
                    <p style={{ fontSize: '0.70rem', color: '#EF4444', marginTop: 4 }}>Passwords do not match</p>
                  )}
                </Field>
                <button type="submit" className="lv-btn lv-btn-gold lv-btn-full lv-btn-lg" style={{ marginTop: 8 }}>
                  Continue <ChevronRight style={{ width: 16, height: 16 }} />
                </button>
              </form>
            )}

            {/* Step 1 — Personal */}
            {regStep === 1 && (
              <form onSubmit={handleNextStep}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="First Name">
                    <input className="lv-input" type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John" />
                  </Field>
                  <Field label="Last Name">
                    <input className="lv-input" type="text" required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" />
                  </Field>
                </div>
                <Field label="Phone Number">
                  <InputIcon icon={Phone} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000" required />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Date of Birth">
                    <input className="lv-input" type="date" required value={dob} onChange={e => setDob(e.target.value)} />
                  </Field>
                  <Field label="Nationality">
                    <input className="lv-input" type="text" value={nationality} onChange={e => setNationality(e.target.value)} placeholder="American" />
                  </Field>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button type="button" onClick={() => setRegStep(0)} className="lv-btn lv-btn-outline lv-btn-lg" style={{ minWidth: 90 }}>Back</button>
                  <button type="submit" className="lv-btn lv-btn-gold lv-btn-full lv-btn-lg">
                    Continue <ChevronRight style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              </form>
            )}

            {/* Step 2 — Address */}
            {regStep === 2 && (
              <form onSubmit={handleRegister}>
                <Field label="Street Address">
                  <InputIcon icon={MapPin} type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main Street, Apt 4B" />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="City">
                    <input className="lv-input" type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="New York" />
                  </Field>
                  <Field label="State / Province">
                    <input className="lv-input" type="text" value={state} onChange={e => setState(e.target.value)} placeholder="NY" />
                  </Field>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Country *">
                    <InputIcon icon={Globe} type="text" value={country} onChange={e => setCountry(e.target.value)} placeholder="United States" required />
                  </Field>
                  <Field label="Postal Code">
                    <input className="lv-input" type="text" value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="10001" />
                  </Field>
                </div>

                {/* Agreements */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-sub)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-sec)' }}>
                    <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} style={{ marginTop: 2 }} />
                    I agree to the <span style={{ color: 'var(--gold)', textDecoration: 'underline', cursor: 'pointer' }}>Terms of Service</span> and understand that Legacy Vault is a digital estate management platform.
                  </label>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-sec)' }}>
                    <input type="checkbox" checked={agreePrivacy} onChange={e => setAgreePrivacy(e.target.checked)} style={{ marginTop: 2 }} />
                    I have read and accept the <span style={{ color: 'var(--gold)', textDecoration: 'underline', cursor: 'pointer' }}>Privacy Policy</span>. I understand that my vault password is never transmitted — it exists only on my device.
                  </label>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => setRegStep(1)} className="lv-btn lv-btn-outline lv-btn-lg" style={{ minWidth: 90 }}>Back</button>
                  <button type="submit" disabled={loading} className="lv-btn lv-btn-gold lv-btn-full lv-btn-lg">
                    {loading ? <span className="lv-spin" /> : <>Create Vault Account <ChevronRight style={{ width: 16, height: 16 }} /></>}
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: 'auto', paddingTop: 28, borderTop: '1px solid var(--border-sub)', marginTop: 32 }}>
          <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Protected by AES-256-CBC client-side encryption. Your master key never leaves your device. Legacy Vault cannot access your encrypted data.
          </p>
        </div>
      </div>

      {/* ── Right hero panel ── */}
      <div className="lv-auth-hero" style={{ flex: 1 }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, background: 'var(--gold-dim)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px' }}>
            <Shield style={{ width: 36, height: 36, color: 'var(--gold)' }} />
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: 14, lineHeight: 1.2 }}>
            Your Digital Legacy,<br />Protected Forever.
          </h1>
          <p style={{ fontSize: '0.90rem', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 36 }}>
            Legacy Vault secures your passwords, documents, and personal messages using military-grade encryption — releasing them only to your designated heirs when the time comes.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, textAlign: 'left' }}>
            {[
              { icon: Lock, title: 'AES-256 Encryption', desc: 'Zero-knowledge client-side security' },
              { icon: Clock, title: "Dead Man's Switch", desc: 'Automated inactivity detection' },
              { icon: Users, title: 'Granular Permissions', desc: 'Per-beneficiary access control' },
              { icon: Scale, title: 'Legal Verification', desc: 'Certified estate claim system' },
            ].map((f, i) => {
              const FIcon = f.icon;
              return (
              <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-sub)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ width: 28, height: 28, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <FIcon style={{ width: 14, height: 14, color: 'var(--gold)' }} />
                </div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>{f.title}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{f.desc}</div>
              </div>
            );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
