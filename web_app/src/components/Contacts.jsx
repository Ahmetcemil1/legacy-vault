import React, { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query, where, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { Users, Plus, Trash2, X, AlertTriangle, ShieldCheck, Mail, Heart, Search, CheckCircle, ShieldAlert, Clock } from 'lucide-react';
import { t } from '../services/translation';
export default function Contacts({ user }) {
  const [contacts, setContacts] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  
  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [relation, setRelation] = useState('');
  const [isCoSigner, setIsCoSigner] = useState(false);
  const [error, setError] = useState('');

  // Verification states
  const [verifying, setVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [verifiedUserData, setVerifiedUserData] = useState(null);
  // When email not found in system but user still wants to add
  const [notFoundButAllowAdd, setNotFoundButAllowAdd] = useState(false);

  useEffect(() => {
    if (!user) return;

    const contactsRef = collection(db, 'users', user.uid, 'trusted_contacts');
    const unsubscribe = onSnapshot(contactsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setContacts(data);
    });

    return unsubscribe;
  }, [user]);

  const handleVerifyEmail = async () => {
    const input = email.trim();
    if (!input) {
      setVerificationError('Lütfen geçerli bir e-posta adresi veya davet kodu girin.');
      return;
    }
    
    setVerifying(true);
    setVerificationError('');
    setIsVerified(false);
    setVerifiedUserData(null);
    setNotFoundButAllowAdd(false);
    setError('');

    try {
      const usersRef = collection(db, 'users');
      let q;
      if (input.toUpperCase().startsWith('LV-')) {
        q = query(usersRef, where('userCode', '==', input.toUpperCase()));
      } else {
        q = query(usersRef, where('email', '==', input.toLowerCase()));
      }
      const snap = await getDocs(q);

      if (snap.empty) {
        // User not in system yet — allow adding as "pending"
        setNotFoundButAllowAdd(true);
        setVerificationError('');
        setIsVerified(true); // Allow saving with "pending" status
        setVerifiedUserData({ uid: null, email: input.toLowerCase(), publicKey: null, displayName: name || input });
      } else {
        const uDoc = snap.docs[0].data();
        const contactUid = snap.docs[0].id;
        const fullName = uDoc.displayName || `${uDoc.firstName || ''} ${uDoc.lastName || ''}`.trim() || 'Kayıtlı Kullanıcı';
        setVerifiedUserData({
          uid: contactUid,
          email: uDoc.email,
          publicKey: uDoc.publicKey || null,
          displayName: fullName
        });
        setName(fullName);
        setEmail(uDoc.email.toLowerCase()); // Auto-fill their actual verified email
        setIsVerified(true);
      }
    } catch (e) {
      console.error(e);
      setVerificationError('Doğrulama işlemi başarısız oldu. Lütfen yetkilerinizi ve internet bağlantınızı kontrol edin.');
    } finally {
      setVerifying(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('E-posta alanı zorunludur.');
      return;
    }

    if (!isVerified || !verifiedUserData) {
      setError('Lütfen kaydetmeden önce yararlanıcının e-posta adresini doğrulayın.');
      return;
    }

    try {
      const contactUid = verifiedUserData.uid;
      const isPending = !contactUid; // No UID = not registered yet

      // Use email-based doc ID for pending contacts, UID for registered ones
      const docId = contactUid || `pending_${email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      
      await setDoc(doc(db, 'users', user.uid, 'trusted_contacts', docId), {
        uid: contactUid || null,
        name: name.trim() || verifiedUserData.displayName || 'Bekleyen Kayıt',
        email: email.trim().toLowerCase(),
        relation: relation.trim() || 'Belirtilmedi',
        isCoSigner: isCoSigner,
        publicKey: verifiedUserData.publicKey || null,
        status: isPending ? 'pending' : 'active', // pending = not yet registered
        createdAt: serverTimestamp()
      });

      // Reset form
      setName('');
      setEmail('');
      setRelation('');
      setIsCoSigner(false);
      setIsVerified(false);
      setVerifiedUserData(null);
      setNotFoundButAllowAdd(false);
      setIsAdding(false);
    } catch (e) {
      console.error(e);
      setError('Kişi kaydedilirken hata oluştu.');
    }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm(t('confirm_delete_contact'))) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'trusted_contacts', itemId));
    } catch (e) {
      console.error(e);
    }
  };

  const getInitials = (fullName) => {
    if (!fullName) return '?';
    const words = fullName.trim().split(' ');
    if (words.length === 1) return words[0].substring(0, 1).toUpperCase();
    return (words[0].substring(0, 1) + words[words.length - 1].substring(0, 1)).toUpperCase();
  };

  return (
    <div className="lv-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      
      {/* Page Header */}
      <div className="lv-page-header" style={{ margin: 0 }}>
        <div>
          <h1 className="lv-page-title">{t('contacts_title')}</h1>
          <p className="lv-page-subtitle">{t('contacts_subtitle')}</p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className={`lv-btn ${isAdding ? 'lv-btn-outline' : 'lv-btn-gold'}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {isAdding ? <X style={{ width: 14, height: 14 }} /> : <Plus style={{ width: 14, height: 14 }} />}
          {isAdding ? t('cancel') : t('add_contact_btn')}
        </button>
      </div>

      {/* Add Form Panel */}
      {isAdding && (
        <div className="lv-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="lv-section-title" style={{ margin: 0 }}>Create Trusted Beneficiary</div>
          
          {error && (
            <div className="lv-alert lv-alert-error" style={{ margin: 0 }}>
              <AlertTriangle style={{ width: 15, height: 15 }} />
              <span>{error}</span>
            </div>
          )}

          {verificationError && (
            <div className="lv-alert lv-alert-error" style={{ margin: 0, gap: 10 }}>
              <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ fontSize: '0.76rem', lineHeight: 1.4 }}>{verificationError}</span>
            </div>
          )}
          
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
              
              {/* Step 1: Email/Code Input + Verification button */}
              <div className="lv-field" style={{ margin: 0 }}>
                <label className="lv-label">Yararlanıcı Davet Kodu veya E-posta Adresi / Beneficiary Invitation Code or Email</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Mail style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    <input
                      type="text"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setIsVerified(false);
                        setVerifiedUserData(null);
                        setVerificationError('');
                      }}
                      placeholder="Örn: LV-XXXX-XXXX veya yararlanici@example.com"
                      className="lv-input"
                      style={{ paddingLeft: 40 }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleVerifyEmail}
                    disabled={verifying || !email}
                    className="lv-btn lv-btn-gold"
                    style={{ minWidth: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: '0.78rem' }}
                  >
                    {verifying ? <span className="lv-spin" style={{ width: 14, height: 14 }} /> : <Search style={{ width: 14, height: 14 }} />}
                    Doğrula
                  </button>
                </div>
                {isVerified && !notFoundButAllowAdd && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontSize: '0.74rem', marginTop: 8, fontWeight: 600 }}>
                    <CheckCircle style={{ width: 14, height: 14 }} />
                    Sistem Kaydı Doğrulandı: {name}
                  </div>
                )}
                {notFoundButAllowAdd && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#F59E0B', fontSize: '0.73rem', marginTop: 8, fontWeight: 600 }}>
                    <Clock style={{ width: 13, height: 13 }} />
                    Bu e-posta sistemde kayıtlı değil. Kişiyi şimdi ekleyebilirsiniz — sisteme kaydolduğunda otomatik olarak bağlanacak.
                  </div>
                )}
              </div>

              {/* Step 2: Registered Name */}
              <div className="lv-field" style={{ margin: 0 }}>
                <label className="lv-label">Tam Adı / Full Name</label>
                <input
                  type="text"
                  required
                  disabled={isVerified && !notFoundButAllowAdd}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={notFoundButAllowAdd ? 'Ad Soyad girin...' : 'E-posta doğrulaması bekleniyor...'}
                  className="lv-input"
                  style={{ background: 'rgba(255,255,255,0.01)', color: isVerified ? 'var(--text-primary)' : 'var(--text-muted)' }}
                />
              </div>

              {/* Step 3: Relation */}
              <div className="lv-field" style={{ margin: 0 }}>
                <label className="lv-label">{t('contact_relation')}</label>
                <input
                  type="text"
                  value={relation}
                  onChange={(e) => setRelation(e.target.value)}
                  placeholder={t('contact_relation_placeholder') || "e.g. Spouse, Child"}
                  className="lv-input"
                  disabled={!isVerified}
                />
              </div>

              {/* Step 4: Co-Signer Designation Checkbox */}
              <div className="lv-field" style={{ margin: 0, flexDirection: 'row', alignItems: 'center', gap: 10, display: 'flex' }}>
                <input
                  type="checkbox"
                  id="isCoSigner"
                  checked={isCoSigner}
                  onChange={(e) => setIsCoSigner(e.target.checked)}
                  disabled={!isVerified}
                  style={{ width: 16, height: 16, accentColor: 'var(--gold)', cursor: 'pointer' }}
                />
                <label htmlFor="isCoSigner" style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                  Çoklu İmza Onaylayıcısı (Designate as Co-Signer)
                </label>
              </div>
            </div>

            <div className="lv-alert lv-alert-warn" style={{ margin: 0, gap: 10 }}>
              <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ fontSize: '0.74rem', lineHeight: 1.4 }}>{t('contact_warning')}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button
                type="submit"
                disabled={!isVerified}
                className="lv-btn lv-btn-gold"
                style={{ minWidth: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <ShieldCheck style={{ width: 14, height: 14 }} />
                Yararlanıcıyı Kaydet
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Global warning reminder */}
      {contacts.length > 0 && (
        <div className="lv-alert lv-alert-warn" style={{ margin: 0, gap: 10 }}>
          <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sistem Kayıt Kontrolü / System Registration Warning</span>
            <span style={{ fontSize: '0.74rem', lineHeight: '1.4' }}>
              {t('contact_warning')}
            </span>
          </div>
        </div>
      )}

      {/* Contacts List Grid */}
      <div>
        {contacts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', border: '1px solid var(--border-sub)', borderRadius: 12 }}>
            <Users style={{ width: 40, height: 40, color: 'var(--text-muted)', opacity: 0.35, marginBottom: 12 }} />
            <h3 style={{ fontSize: '0.90rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t('no_contacts')}</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>{t('no_contacts_desc')}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {contacts.map((item) => (
              <div 
                key={item.id}
                className="lv-card"
                style={{ padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 18 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Avatar */}
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.80rem', fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>
                      {getInitials(item.name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h4 style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Mail style={{ width: 12, height: 12, flexShrink: 0 }} />
                        <span>{item.email}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {item.status === 'pending' && (
                          <span className="lv-badge lv-badge-muted" style={{ fontSize: '0.60rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 4, borderColor: '#F59E0B', color: '#F59E0B' }}>
                            <Clock style={{ width: 10, height: 10 }} />
                            Pending Registration
                          </span>
                        )}
                        {item.isCoSigner && (
                          <span className="lv-badge lv-badge-gold" style={{ fontSize: '0.60rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <ShieldAlert style={{ width: 10, height: 10 }} />
                            Co-Signer
                          </span>
                        )}
                        {item.publicKey ? (
                          <span className="lv-badge lv-badge-green" style={{ fontSize: '0.60rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center' }}>
                            Encrypted Link Active
                          </span>
                        ) : (
                          <span className="lv-badge lv-badge-muted" style={{ fontSize: '0.60rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center' }}>
                            No Key
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(item.id)}
                    className="lv-btn lv-btn-danger lv-btn-sm"
                    style={{ padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.70rem', borderTop: '1px solid var(--border-sub)', paddingTop: 12 }}>
                  <span className="lv-badge lv-badge-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Heart style={{ width: 10, height: 10 }} />
                    {item.relation}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {item.createdAt ? new Date(item.createdAt.toDate()).toLocaleDateString() : t('just_now')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
