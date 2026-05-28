import React, { useState } from 'react';
import { db, storage } from '../services/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import {
  FileText, ArrowLeft, ArrowUpCircle, CheckCircle, ShieldAlert,
  User, Phone, MapPin, Mail, Heart, Calendar, ChevronRight, UploadCloud
} from 'lucide-react';
import { t } from '../services/translation';

export default function DeathClaim({ onBack }) {
  const [step, setStep] = useState(0);

  /* ── DECEASED fields ── */
  const [deceasedEmail, setDeceasedEmail] = useState('');
  const [deceasedFirstName, setDeceasedFirstName] = useState('');
  const [deceasedLastName, setDeceasedLastName] = useState('');
  const [deceasedDob, setDeceasedDob] = useState('');
  const [deceasedAddress, setDeceasedAddress] = useState('');
  const [deceasedCity, setDeceasedCity] = useState('');
  const [deceasedCountry, setDeceasedCountry] = useState('');
  const [deceasedPhone, setDeceasedPhone] = useState('');
  const [dateOfDeath, setDateOfDeath] = useState('');

  /* ── CLAIMANT fields ── */
  const [claimantFirstName, setClaimantFirstName] = useState('');
  const [claimantLastName, setClaimantLastName] = useState('');
  const [claimantEmail, setClaimantEmail] = useState('');
  const [claimantPhone, setClaimantPhone] = useState('');
  const [claimantAddress, setClaimantAddress] = useState('');
  const [claimantCity, setClaimantCity] = useState('');
  const [claimantCountry, setClaimantCountry] = useState('');
  const [relationship, setRelationship] = useState('');

  /* ── FILE ── */
  const [file, setFile] = useState(null);

  /* ── STATUS ── */
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [claimId, setClaimId] = useState('');
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    if (e.target.files[0]) setFile(e.target.files[0]);
  };

  const validateDeceased = () => {
    if (!deceasedFirstName.trim() || !deceasedLastName.trim() || !deceasedEmail.trim()) {
      setError('Please provide deceased person first name, last name, and email.');
      return false;
    }
    setError('');
    return true;
  };

  const validateClaimant = () => {
    if (!claimantFirstName.trim() || !claimantLastName.trim() || !claimantEmail.trim() || !claimantPhone.trim() || !relationship) {
      setError('Please provide claimant first name, last name, email, phone, and relationship.');
      return false;
    }
    setError('');
    return true;
  };

  const handleNext = () => {
    if (step === 0 && !validateDeceased()) return;
    if (step === 1 && !validateClaimant()) return;
    setStep(s => s + 1);
  };

  const handlePrev = () => {
    setError('');
    setStep(s => s - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!file) {
      setError('Please upload the certified death certificate.');
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const generatedClaimId = `claim_${Date.now()}`;
      const fileRef = ref(storage, `death_certificates/${generatedClaimId}_${file.name}`);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          setProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        },
        (err) => {
          console.error(err);
          setError(t('upload_failed'));
          setUploading(false);
        },
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

          await addDoc(collection(db, 'claims'), {
            // Deceased
            deceasedEmail: deceasedEmail.trim(),
            deceasedFirstName: deceasedFirstName.trim(),
            deceasedLastName: deceasedLastName.trim(),
            deceasedDob: deceasedDob.trim(),
            deceasedAddress: deceasedAddress.trim(),
            deceasedCity: deceasedCity.trim(),
            deceasedCountry: deceasedCountry.trim(),
            deceasedPhone: deceasedPhone.trim(),
            dateOfDeath: dateOfDeath.trim(),
            // Claimant
            claimantName: `${claimantFirstName.trim()} ${claimantLastName.trim()}`,
            claimantFirstName: claimantFirstName.trim(),
            claimantLastName: claimantLastName.trim(),
            claimantEmail: claimantEmail.trim(),
            claimantPhone: claimantPhone.trim(),
            claimantAddress: claimantAddress.trim(),
            claimantCity: claimantCity.trim(),
            claimantCountry: claimantCountry.trim(),
            relationship: relationship.trim(),
            // Meta
            certificateUrl: downloadUrl,
            status: 'pending',
            createdAt: serverTimestamp()
          });

          setClaimId(generatedClaimId);
          setSuccess(true);
          setUploading(false);
        }
      );
    } catch (e) {
      console.error(e);
      setError(t('generic_auth_error'));
      setUploading(false);
    }
  };

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div className="lv-card" style={{ maxWidth: 500, width: '100%', padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 20 }}>
          <div style={{ width: 56, height: 56, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.20)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle style={{ width: 26, height: 26, color: 'var(--green)' }} />
          </div>
          <h2 style={{ fontSize: '1.20rem', fontWeight: 800, color: 'var(--text-primary)', tracking: '-0.01em' }}>{t('claim_success_title')}</h2>
          <p style={{ fontSize: '0.80rem', color: 'var(--text-sec)', lineHeight: 1.5 }}>{t('claim_success_desc')}</p>
          
          <div style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-sub)', borderRadius: 8, padding: '12px 18px', width: '100%' }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Claim Reference Number</span>
            <code style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'monospace', marginTop: 4 }}>{claimId}</code>
          </div>

          <button onClick={onBack} className="lv-btn lv-btn-gold lv-btn-full" style={{ marginTop: 8 }}>
            {t('back_to_login')}
          </button>
        </div>
      </div>
    );
  }

  const STEPS = ['Deceased', 'Claimant', 'Verification'];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px 20px' }}>
      
      <div className="lv-card" style={{ maxWidth: 640, width: '100%', padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={onBack}
            className="lv-btn lv-btn-ghost lv-btn-sm"
            style={{ paddingLeft: 0, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
            {t('back_to_login')}
          </button>
          <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estate Settlement Claims</span>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('claim_title')}</h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>{t('claim_subtitle')}</p>
        </div>

        {/* Progress Steps */}
        <div className="lv-steps" style={{ justifyContent: 'center', margin: '8px 0 16px' }}>
          {STEPS.map((label, idx) => (
            <React.Fragment key={idx}>
              <div className={`lv-step ${idx < step ? 'done' : idx === step ? 'active' : ''}`}>
                <div className="lv-step-num">
                  {idx < step ? <CheckCircle style={{ width: 12, height: 12 }} /> : idx + 1}
                </div>
                <span>{label}</span>
              </div>
              {idx < STEPS.length - 1 && <div className="lv-step-sep" />}
            </React.Fragment>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="lv-alert lv-alert-error" style={{ margin: 0 }}>
            <ShieldAlert style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* STEP 0: DECEASED */}
          {step === 0 && (
            <div className="lv-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="lv-section-title" style={{ margin: '0 0 4px' }}>Deceased Person Information</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="lv-field" style={{ margin: 0 }}>
                  <label className="lv-label">First Name</label>
                  <input
                    type="text"
                    required
                    value={deceasedFirstName}
                    onChange={e => setDeceasedFirstName(e.target.value)}
                    placeholder="e.g. John"
                    className="lv-input"
                  />
                </div>
                <div className="lv-field" style={{ margin: 0 }}>
                  <label className="lv-label">Last Name</label>
                  <input
                    type="text"
                    required
                    value={deceasedLastName}
                    onChange={e => setDeceasedLastName(e.target.value)}
                    placeholder="e.g. Doe"
                    className="lv-input"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="lv-field" style={{ margin: 0 }}>
                  <label className="lv-label">Registered Email</label>
                  <input
                    type="email"
                    required
                    value={deceasedEmail}
                    onChange={e => setDeceasedEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="lv-input"
                  />
                </div>
                <div className="lv-field" style={{ margin: 0 }}>
                  <label className="lv-label">Phone Number</label>
                  <input
                    type="tel"
                    value={deceasedPhone}
                    onChange={e => setDeceasedPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="lv-input"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="lv-field" style={{ margin: 0 }}>
                  <label className="lv-label">Date of Birth</label>
                  <input
                    type="date"
                    value={deceasedDob}
                    onChange={e => setDeceasedDob(e.target.value)}
                    className="lv-input"
                  />
                </div>
                <div className="lv-field" style={{ margin: 0 }}>
                  <label className="lv-label">Date of Death</label>
                  <input
                    type="date"
                    value={dateOfDeath}
                    onChange={e => setDateOfDeath(e.target.value)}
                    className="lv-input"
                  />
                </div>
              </div>

              <div className="lv-field" style={{ margin: 0 }}>
                <label className="lv-label">Residential Address</label>
                <input
                  type="text"
                  value={deceasedAddress}
                  onChange={e => setDeceasedAddress(e.target.value)}
                  placeholder="123 Main Street, Apt 4B"
                  className="lv-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="lv-field" style={{ margin: 0 }}>
                  <label className="lv-label">City</label>
                  <input
                    type="text"
                    value={deceasedCity}
                    onChange={e => setDeceasedCity(e.target.value)}
                    placeholder="New York"
                    className="lv-input"
                  />
                </div>
                <div className="lv-field" style={{ margin: 0 }}>
                  <label className="lv-label">Country</label>
                  <input
                    type="text"
                    value={deceasedCountry}
                    onChange={e => setDeceasedCountry(e.target.value)}
                    placeholder="United States"
                    className="lv-input"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 1: CLAIMANT */}
          {step === 1 && (
            <div className="lv-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="lv-section-title" style={{ margin: '0 0 4px' }}>Claimant Details & Relation</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="lv-field" style={{ margin: 0 }}>
                  <label className="lv-label">First Name</label>
                  <input
                    type="text"
                    required
                    value={claimantFirstName}
                    onChange={e => setClaimantFirstName(e.target.value)}
                    placeholder="Jane"
                    className="lv-input"
                  />
                </div>
                <div className="lv-field" style={{ margin: 0 }}>
                  <label className="lv-label">Last Name</label>
                  <input
                    type="text"
                    required
                    value={claimantLastName}
                    onChange={e => setClaimantLastName(e.target.value)}
                    placeholder="Smith"
                    className="lv-input"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="lv-field" style={{ margin: 0 }}>
                  <label className="lv-label">Contact Email</label>
                  <input
                    type="email"
                    required
                    value={claimantEmail}
                    onChange={e => setClaimantEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="lv-input"
                  />
                </div>
                <div className="lv-field" style={{ margin: 0 }}>
                  <label className="lv-label">Contact Phone</label>
                  <input
                    type="tel"
                    required
                    value={claimantPhone}
                    onChange={e => setClaimantPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="lv-input"
                  />
                </div>
              </div>

              <div className="lv-field" style={{ margin: 0 }}>
                <label className="lv-label">Residential Address</label>
                <input
                  type="text"
                  value={claimantAddress}
                  onChange={e => setClaimantAddress(e.target.value)}
                  placeholder="456 Oak Avenue"
                  className="lv-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="lv-field" style={{ margin: 0 }}>
                  <label className="lv-label">City</label>
                  <input
                    type="text"
                    value={claimantCity}
                    onChange={e => setClaimantCity(e.target.value)}
                    placeholder="Los Angeles"
                    className="lv-input"
                  />
                </div>
                <div className="lv-field" style={{ margin: 0 }}>
                  <label className="lv-label">Country</label>
                  <input
                    type="text"
                    value={claimantCountry}
                    onChange={e => setClaimantCountry(e.target.value)}
                    placeholder="United States"
                    className="lv-input"
                  />
                </div>
              </div>

              <div className="lv-field" style={{ margin: 0 }}>
                <label className="lv-label">Relationship to Deceased</label>
                <select
                  value={relationship}
                  onChange={e => setRelationship(e.target.value)}
                  required
                  className="lv-input"
                >
                  <option value="">{t('select_relationship')}</option>
                  <option value="spouse">{t('rel_spouse')}</option>
                  <option value="child">{t('rel_child')}</option>
                  <option value="parent">{t('rel_parent')}</option>
                  <option value="sibling">{t('rel_sibling')}</option>
                  <option value="lawyer">{t('rel_lawyer')}</option>
                  <option value="executor">{t('rel_executor')}</option>
                  <option value="other">{t('rel_other')}</option>
                </select>
              </div>
            </div>
          )}

          {/* STEP 2: DOCUMENTS */}
          {step === 2 && (
            <div className="lv-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="lv-section-title" style={{ margin: '0 0 4px' }}>Document Verification</div>

              <div className="lv-field" style={{ margin: 0 }}>
                <label className="lv-label">Death Certificate (Official Certified PDF or Image)</label>
                <input
                  type="file"
                  required
                  accept=".pdf,.jpg,.jpeg,.png,.heic"
                  onChange={handleFileChange}
                  className="lv-input"
                />
                {file && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--green)', fontWeight: 600, marginTop: 6 }}>
                    ✓ Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              {uploading && (
                <div style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-sub)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 600 }}>
                    <span style={{ color: 'var(--text-sec)' }}>Uploading legal document...</span>
                    <span style={{ color: 'var(--gold)' }}>{progress}%</span>
                  </div>
                  <div className="lv-progress-track">
                    <div className="lv-progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              <p style={{ fontSize: '0.70rem', color: 'var(--text-muted)', lineHeight: 1.4, border: '1px solid var(--border-sub)', borderRadius: 8, padding: 12, background: 'rgba(255,255,255,0.01)' }}>
                {t('claim_legal_disclaimer') || "By submitting, you certify under penalty of perjury that all details and documents uploaded are legally certified and authentic. False submissions represent a criminal offense."}
              </p>
            </div>
          )}

          {/* Buttons Footer */}
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            {step > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                disabled={uploading}
                className="lv-btn lv-btn-outline"
                style={{ flex: 1 }}
              >
                Previous Step
              </button>
            )}

            {step < 2 ? (
              <button
                type="button"
                onClick={handleNext}
                className="lv-btn lv-btn-gold"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                Next Step
                <ChevronRight style={{ width: 14, height: 14 }} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={uploading}
                className="lv-btn lv-btn-gold"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                {uploading ? (
                  <span className="lv-spin" />
                ) : (
                  <>
                    <ArrowUpCircle style={{ width: 15, height: 15 }} />
                    {t('submit_claim_btn')}
                  </>
                )}
              </button>
            )}
          </div>

        </form>

      </div>

    </div>
  );
}
