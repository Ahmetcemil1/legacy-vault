import React, { useEffect, useState } from 'react';
import { db, auth } from '../services/firebase';
import { doc, getDoc, updateDoc, collection, onSnapshot, serverTimestamp, setDoc, getDocs } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { Settings as SettingsIcon, User, ShieldAlert, LogOut, CheckCircle, Sliders, Cpu, MapPin, Phone, Calendar, Globe, KeyRound, AlertTriangle, Share2, Lock, Unlock, Users } from 'lucide-react';
import { t } from '../services/translation';
import { generateKeyPair, exportPublicKey, exportPrivateKey, encryptAsymmetric } from '../services/keypair';
import { splitSecret } from '../services/shamir';

export default function Settings({ user, userData: initialUserData, masterPassword, onSignOut }) {
  const [enabled, setEnabled] = useState(true);
  const [threshold, setThreshold] = useState(30);
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Shamir's Secret Sharing (SSS) States
  const [contacts, setContacts] = useState([]);
  const [selectedContactsForShare, setSelectedContactsForShare] = useState([]);
  const [sssThreshold, setSssThreshold] = useState(2);
  const [distributing, setDistributing] = useState(false);
  const [distributeSuccess, setDistributeSuccess] = useState(false);
  const [distributeError, setDistributeError] = useState('');

  useEffect(() => {
    if (!user) return;

    const loadSettings = async () => {
      try {
        const docRef = doc(db, 'users', user.uid);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          let data = snapshot.data();
          
          // Generate user code if missing
          if (!data.userCode) {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let part1 = '';
            let part2 = '';
            for (let i = 0; i < 4; i++) part1 += chars.charAt(Math.floor(Math.random() * chars.length));
            for (let i = 0; i < 4; i++) part2 += chars.charAt(Math.floor(Math.random() * chars.length));
            const newCode = `LV-${part1}-${part2}`;
            await updateDoc(docRef, { userCode: newCode });
            data.userCode = newCode;
          }

          // Generate asymmetric keypair if missing (Zero-Knowledge)
          if (!data.publicKey || !data.encryptedPrivateKey) {
            try {
              const pair = await generateKeyPair();
              const pubKeyB64 = await exportPublicKey(pair.publicKey);
              const privKeyEnc = await exportPrivateKey(pair.privateKey, masterPassword);
              
              await updateDoc(docRef, {
                publicKey: pubKeyB64,
                encryptedPrivateKey: privKeyEnc
              });
              data.publicKey = pubKeyB64;
              data.encryptedPrivateKey = privKeyEnc;
            } catch (err) {
              console.error("Auto keypair generation failed:", err);
            }
          }

          setProfileData(data);
          setEnabled(data.deadMansSwitchEnabled ?? true);
          setThreshold(data.thresholdDays ?? 30);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();

    // Listen to contacts for SSS distribution
    const contactsRef = collection(db, 'users', user.uid, 'trusted_contacts');
    const unsubContacts = onSnapshot(contactsRef, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setContacts(data);
      // Default threshold = 2 or number of contacts, whichever is smaller
      setSssThreshold(Math.max(2, Math.min(2, data.length)));
    });

    return () => unsubContacts();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveSuccess(false);

    try {
      const docRef = doc(db, 'users', user.uid);
      await updateDoc(docRef, {
        deadMansSwitchEnabled: enabled,
        thresholdDays: parseInt(threshold)
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      onSignOut();
    } catch (e) {
      console.error(e);
    }
  };

  // ── SHAMIR'S SECRET SHARING: Distribute master password key shares ───────
  const handleDistributeShares = async () => {
    if (!masterPassword) {
      setDistributeError('Master password bulunamadı. Lütfen yeniden giriş yapın.');
      return;
    }
    if (selectedContactsForShare.length < 2) {
      setDistributeError('En az 2 yararlanıcı seçmelisiniz.');
      return;
    }
    if (sssThreshold < 2 || sssThreshold > selectedContactsForShare.length) {
      setDistributeError(`Eşik değeri 2 ile ${selectedContactsForShare.length} arasında olmalıdır.`);
      return;
    }

    // Check that all selected contacts have a public key
    const selectedContactObjects = contacts.filter(c => selectedContactsForShare.includes(c.id));
    const missingKey = selectedContactObjects.filter(c => !c.publicKey);
    if (missingKey.length > 0) {
      setDistributeError(`Şu kişilerin RSA public key'i yok: ${missingKey.map(c => c.name).join(', ')}. Sistemde aktif hesapları olmalıdır.`);
      return;
    }

    setDistributing(true);
    setDistributeError('');
    setDistributeSuccess(false);

    try {
      // 1. Split master password into N shares using Shamir's Secret Sharing
      const shares = splitSecret(masterPassword, sssThreshold, selectedContactsForShare.length);

      // 2. Encrypt each share with the corresponding contact's RSA public key
      for (let i = 0; i < selectedContactObjects.length; i++) {
        const contact = selectedContactObjects[i];
        const share = shares[i];

        // Encrypt the share asymmetrically with contact's public key
        const encryptedShare = await encryptAsymmetric(contact.publicKey, share);

        // 3. Store the encrypted share in the contact's document
        const contactRef = doc(db, 'users', user.uid, 'trusted_contacts', contact.id);
        await updateDoc(contactRef, {
          encryptedKeyShare: encryptedShare,
          shareIndex: i + 1,
          totalShares: selectedContactsForShare.length,
          shareThreshold: sssThreshold,
          shareDistributedAt: serverTimestamp()
        });
      }

      // 4. Mark the user's profile as SSS protected
      await updateDoc(doc(db, 'users', user.uid), {
        sssProtected: true,
        sssThreshold: sssThreshold,
        sssTotalShares: selectedContactsForShare.length,
        sssDistributedAt: serverTimestamp()
      });

      setDistributeSuccess(true);
      setSelectedContactsForShare([]);
      setTimeout(() => setDistributeSuccess(false), 5000);
    } catch (err) {
      console.error('SSS distribution failed:', err);
      setDistributeError('Anahtar parçaları dağıtılırken hata oluştu: ' + err.message);
    } finally {
      setDistributing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="lv-spin" style={{ width: 24, height: 24 }} />
      </div>
    );
  }

  const displayName = profileData?.firstName ? `${profileData.firstName} ${profileData.lastName || ''}`.trim() : user.email;
  const initials = profileData?.firstName ? `${profileData.firstName[0]}${profileData.lastName?.[0] || ''}`.toUpperCase() : user.email[0].toUpperCase();

  return (
    <div className="lv-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 800, margin: '0 auto' }}>
      
      {/* Header */}
      <div className="lv-page-header" style={{ margin: 0 }}>
        <div>
          <h1 className="lv-page-title">{t('settings_title')}</h1>
          <p className="lv-page-subtitle">Configure your security parameters and view verified KYC credentials</p>
        </div>
      </div>

      {/* Save Success Alert */}
      {saveSuccess && (
        <div className="lv-alert lv-alert-success" style={{ margin: 0 }}>
          <CheckCircle style={{ width: 16, height: 16 }} />
          <span>{t('settings_saved_success')}</span>
        </div>
      )}

      {/* Main Form/Details Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
        
        {/* Account Info */}
        <div className="lv-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="lv-section-title" style={{ margin: 0 }}>{t('settings_account_section')}</div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 8, background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.05rem', fontWeight: 700, color: 'var(--gold)' }}>
              {initials}
            </div>
            <div>
              <div style={{ fontSize: '0.90rem', fontWeight: 700, color: 'var(--text-primary)' }}>{displayName}</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{user?.email}</div>
            </div>
            {profileData?.kycStatus && (
              <span className={`lv-badge ${profileData.kycStatus === 'verified' ? 'lv-badge-green' : 'lv-badge-amber'}`} style={{ marginLeft: 'auto' }}>
                KYC: {profileData.kycStatus}
              </span>
            )}
          </div>

          {/* Invitation Code / Beneficiary Code */}
          {profileData?.userCode && (
            <div style={{ background: 'rgba(201, 168, 76, 0.03)', border: '1px solid rgba(201, 168, 76, 0.18)', borderRadius: 10, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>YARARLANICI DAVET KODUNUZ / INVITATION CODE</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-sec)', display: 'block', marginTop: 2 }}>Mirasçılarınız kasanıza bu kodu girerek güvenle eklenebilir.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
                <code style={{ fontSize: '1.00rem', fontWeight: 800, color: 'var(--gold)', fontFamily: 'monospace', background: 'var(--bg-deep)', padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-sub)', letterSpacing: '0.05em' }}>
                  {profileData.userCode}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(profileData.userCode);
                    alert('Davet kodu panoya kopyalandı!');
                  }}
                  className="lv-btn lv-btn-outline lv-btn-sm"
                  style={{ fontSize: '0.72rem', padding: '6px 12px' }}
                >
                  Kopyala
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 8 }}>
            
            {profileData?.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-deep)', border: '1px solid var(--border-sub)', borderRadius: 8, padding: 12 }}>
                <Phone style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                <div>
                  <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Phone Number</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', marginTop: 2 }}>{profileData.phone}</div>
                </div>
              </div>
            )}

            {profileData?.dateOfBirth && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-deep)', border: '1px solid var(--border-sub)', borderRadius: 8, padding: 12 }}>
                <Calendar style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                <div>
                  <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Date of Birth</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', marginTop: 2 }}>{profileData.dateOfBirth}</div>
                </div>
              </div>
            )}

            {profileData?.nationality && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-deep)', border: '1px solid var(--border-sub)', borderRadius: 8, padding: 12 }}>
                <Globe style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                <div>
                  <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Nationality</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', marginTop: 2 }}>{profileData.nationality}</div>
                </div>
              </div>
            )}

            {(profileData?.address || profileData?.country) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-deep)', border: '1px solid var(--border-sub)', borderRadius: 8, padding: 12, gridColumn: '1 / -1' }}>
                <MapPin style={{ width: 14, height: 14, color: 'var(--text-muted)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>KYC Certified Address</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', marginTop: 2, lineHeight: 1.3 }}>
                    {[profileData.address, profileData.postalCode, profileData.city, profileData.state, profileData.country].filter(Boolean).join(', ')}
                  </div>
                </div>
              </div>
            )}

          </div>

        </div>

        {/* Developer Administration Settings */}
        <div className="lv-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, border: '1px solid rgba(201, 168, 76, 0.25)', background: 'rgba(201, 168, 76, 0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldAlert style={{ width: 15, height: 15, color: 'var(--gold)' }} />
                Administrative Simulation Panel
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Grant system admin privileges to your account. This unlocks the secure claim settlement console in the sidebar.
              </div>
            </div>
            <label className="lv-toggle">
              <input 
                type="checkbox" 
                checked={profileData?.role === 'admin'} 
                onChange={async (e) => {
                  const isAdmin = e.target.checked;
                  try {
                    const docRef = doc(db, 'users', user.uid);
                    await updateDoc(docRef, { role: isAdmin ? 'admin' : 'user' });
                    setProfileData(prev => ({ ...prev, role: isAdmin ? 'admin' : 'user' }));
                  } catch (err) {
                    console.error("Failed to toggle admin role:", err);
                  }
                }} 
              />
              <span className="lv-toggle-slider" />
            </label>
          </div>
        </div>

        {/* Dead Man's Switch Configuration */}
        <div className="lv-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="lv-section-title" style={{ margin: 0, flex: 1 }}>{t('switch_section')}</div>
            <label className="lv-toggle">
              <input 
                type="checkbox" 
                checked={enabled} 
                onChange={(e) => setEnabled(e.target.checked)} 
              />
              <span className="lv-toggle-slider" />
            </label>
          </div>

          <p style={{ fontSize: '0.75rem', color: 'var(--text-sec)', margin: 0, lineHeight: 1.4 }}>
            {t('switch_enable_desc')}. If you remain inactive for longer than your configured threshold, access keys will be safely transferred to your designated heirs.
          </p>

          {enabled && (
            <div style={{ borderTop: '1px solid var(--border-sub)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.80rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sliders style={{ width: 14, height: 14, color: 'var(--gold)' }} />
                  {t('inactivity_threshold')}
                </span>
                <span className="lv-badge lv-badge-gold">
                  {threshold} {t('days')}
                </span>
              </div>
              
              <input 
                type="range" 
                min="7" 
                max="365" 
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                style={{ width: '100%' }}
              />
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                <span>7 {t('days')}</span>
                <span>365 {t('days')}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── SSS: Shamir's Secret Key Distribution ─────────────────────── */}
        <div className="lv-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="lv-section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Share2 style={{ width: 14, height: 14, color: 'var(--gold)' }} />
              Gizli Anahtar Dağıtımı (Shamir's Secret Sharing)
            </div>
            {profileData?.sssProtected && (
              <span className="lv-badge lv-badge-green" style={{ fontSize: '0.62rem', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Lock style={{ width: 10, height: 10 }} />
                SSS Aktif
              </span>
            )}
          </div>

          <p style={{ fontSize: '0.76rem', color: 'var(--text-sec)', margin: 0, lineHeight: 1.5 }}>
            Master şifreniz matematiksel parçalara bölünür ve her mirasçıya kendi RSA public key'iyle şifrelenerek güvenle teslim edilir.
            Kasanızı açmak için belirlediğiniz eşik kadar mirasçının anahtarı bir araya gelmesi gerekir.
            <strong style={{ color: 'var(--gold)' }}> Hiçbir parça tek başına işe yaramaz.</strong>
          </p>

          {/* SSS Status Banner (if already distributed) */}
          {profileData?.sssProtected && (
            <div style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 8, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--green)' }}>Anahtar Parçaları Dağıtıldı</div>
              <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                {profileData.sssTotalShares} kişiye dağıtıldı — {profileData.sssThreshold} kişinin onayı yeterli.
                {profileData.sssDistributedAt?.toDate && (
                  <span> Son dağıtım: {profileData.sssDistributedAt.toDate().toLocaleDateString()}</span>
                )}
              </div>
            </div>
          )}

          {/* Contact Selection */}
          {contacts.length === 0 ? (
            <div className="lv-alert lv-alert-warn" style={{ margin: 0 }}>
              <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
              <span style={{ fontSize: '0.75rem' }}>
                Henüz güvenilir kişi eklemediniz. SSS kullanmak için önce Beneficiaries sayfasından mirasçı ekleyin.
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Contact Checkboxes */}
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
                  Anahtar Paylaşılacak Kişiler
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-deep)', border: '1px solid var(--border-sub)', borderRadius: 8, padding: 12, maxHeight: 180, overflowY: 'auto' }}>
                  {contacts.map(contact => {
                    const hasKey = !!contact.publicKey;
                    const isPending = contact.status === 'pending';
                    const isSelected = selectedContactsForShare.includes(contact.id);
                    return (
                      <label
                        key={contact.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          fontSize: '0.76rem', cursor: hasKey && !isPending ? 'pointer' : 'not-allowed',
                          color: hasKey && !isPending ? 'var(--text-primary)' : 'var(--text-muted)',
                          opacity: hasKey && !isPending ? 1 : 0.5
                        }}
                      >
                        <input
                          type="checkbox"
                          disabled={!hasKey || isPending}
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedContactsForShare(prev => [...prev, contact.id]);
                            } else {
                              setSelectedContactsForShare(prev => prev.filter(id => id !== contact.id));
                            }
                          }}
                          style={{ accentColor: 'var(--gold)', width: 15, height: 15 }}
                        />
                        <span style={{ flex: 1 }}>{contact.name}</span>
                        {isPending && (
                          <span style={{ fontSize: '0.60rem', color: '#F59E0B', fontWeight: 700 }}>PENDING</span>
                        )}
                        {!isPending && !hasKey && (
                          <span style={{ fontSize: '0.60rem', color: 'var(--text-muted)', fontWeight: 700 }}>NO KEY</span>
                        )}
                        {!isPending && hasKey && (
                          <span style={{ fontSize: '0.60rem', color: 'var(--green)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Lock style={{ width: 9, height: 9 }} />
                            RSA
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Threshold Slider */}
              {selectedContactsForShare.length >= 2 && (
                <div style={{ borderTop: '1px solid var(--border-sub)', paddingTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Users style={{ width: 13, height: 13, color: 'var(--gold)' }} />
                      Minimum Onay Eşiği
                    </span>
                    <span className="lv-badge lv-badge-gold" style={{ fontSize: '0.66rem', padding: '3px 8px' }}>
                      {sssThreshold} / {selectedContactsForShare.length} kişi
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={selectedContactsForShare.length}
                    value={sssThreshold}
                    onChange={(e) => setSssThreshold(parseInt(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
                    Kasayı açmak için seçilen <strong>{selectedContactsForShare.length}</strong> kişiden en az <strong style={{ color: 'var(--gold)' }}>{sssThreshold}</strong> tanesinin anahtarı gerekecek.
                  </p>
                </div>
              )}

              {/* Error / Success */}
              {distributeError && (
                <div className="lv-alert lv-alert-error" style={{ margin: 0 }}>
                  <ShieldAlert style={{ width: 14, height: 14, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.75rem' }}>{distributeError}</span>
                </div>
              )}
              {distributeSuccess && (
                <div className="lv-alert lv-alert-success" style={{ margin: 0 }}>
                  <CheckCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.75rem' }}>Anahtar parçaları başarıyla dağıtıldı. Her mirasçının şifreli payı güvenle saklandı.</span>
                </div>
              )}

              {/* Distribute Button */}
              <button
                onClick={handleDistributeShares}
                disabled={distributing || selectedContactsForShare.length < 2}
                className="lv-btn lv-btn-gold"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {distributing
                  ? <><span className="lv-spin" style={{ width: 14, height: 14 }} /> Dağıtılıyor...</>
                  : <><Share2 style={{ width: 14, height: 14 }} /> Anahtar Parçalarını Şifrele &amp; Dağıt</>
                }
              </button>
            </div>
          )}
        </div>

        {/* Security Info */}
        <div className="lv-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="lv-section-title" style={{ margin: 0 }}>
            <Cpu style={{ width: 14, height: 14, color: 'var(--gold)', marginRight: 6 }} />
            {t('security_section')}
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '0.78rem', borderBottom: '1px solid var(--border-sub)', paddingBottom: 10 }}>
              <div>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, display: 'block' }}>{t('security_enc')}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: 2, display: 'block' }}>AES-256-CBC (Advanced Encryption Standard)</span>
              </div>
              <span className="lv-badge lv-badge-green">AES-256-CBC</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '0.78rem', borderBottom: '1px solid var(--border-sub)', paddingBottom: 10 }}>
              <div>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, display: 'block' }}>{t('security_kdf')}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: 2, display: 'block' }}>PBKDF2 derivation with SHA-256 digest</span>
              </div>
              <span className="lv-badge lv-badge-blue">SHA-256</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '0.78rem', borderBottom: '1px solid var(--border-sub)', paddingBottom: 10 }}>
              <div>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, display: 'block' }}>{t('security_loc')}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: 2, display: 'block' }}>Zero-Knowledge local browser decryption</span>
              </div>
              <span className="lv-badge lv-badge-gold">{t('client_encrypted')}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '0.78rem', borderBottom: '1px solid var(--border-sub)', paddingBottom: 10 }}>
              <div>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, display: 'block' }}>Key Isolation Protocol</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: 2, display: 'block' }}>Your master password is never sent to the server or cached.</span>
              </div>
              <span className="lv-badge lv-badge-muted">Zero-Knowledge</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '0.78rem', borderBottom: '1px solid var(--border-sub)', paddingBottom: 10 }}>
              <div>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, display: 'block' }}>Asymmetric Keypair (RSA-OAEP)</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: 2, display: 'block' }}>Used for zero-knowledge key sharing with beneficiaries.</span>
              </div>
              <span className="lv-badge lv-badge-green">RSA-2048</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '0.78rem' }}>
              <div>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, display: 'block' }}>Cloud Storage Security</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: 2, display: 'block' }}>Granular Firebase rules verify user identities dynamically.</span>
              </div>
              <span className="lv-badge lv-badge-green">Protected</span>
            </div>
          </div>
        </div>

      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="lv-btn lv-btn-gold"
          style={{ flex: 1 }}
        >
          {saving ? <span className="lv-spin" /> : t('save_settings_btn')}
        </button>

        <button
          onClick={handleLogout}
          className="lv-btn lv-btn-danger"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <LogOut style={{ width: 14, height: 14 }} />
          {t('sign_out')}
        </button>
      </div>

    </div>
  );
}
