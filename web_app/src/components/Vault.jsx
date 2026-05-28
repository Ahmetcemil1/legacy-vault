import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../services/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { EncryptionService } from '../services/encryption';
import { 
  KeyRound, ShieldAlert, Eye, EyeOff, Copy, Check, Trash2, 
  Plus, Search, X, ShieldCheck, Lock, Unlock, Users
} from 'lucide-react';
import { t } from '../services/translation';

export default function Vault({ user, masterPassword }) {
  const [items, setItems] = useState([]);
  const [contacts, setContacts] = useState([]); // Fetch trusted contacts
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [decryptedValues, setDecryptedValues] = useState({}); // itemId -> { username, password, note }
  const [copiedField, setCopiedField] = useState(null); // itemId_field -> boolean
  const [decryptError, setDecryptError] = useState(''); // User-friendly error state

  // Form states
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [selectedBeneficiaries, setSelectedBeneficiaries] = useState([]); // Selected emails for current secret
  const [error, setError] = useState('');

  // Stable EncryptionService instance - only recreates when masterPassword changes
  const encService = useMemo(() => new EncryptionService(masterPassword), [masterPassword]);

  useEffect(() => {
    if (!user) return;

    // Listen to vault items
    const vaultRef = collection(db, 'users', user.uid, 'vault_items');
    const unsubscribeVault = onSnapshot(vaultRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setItems(data);
    });

    // Listen to trusted contacts
    const contactsRef = collection(db, 'users', user.uid, 'trusted_contacts');
    const unsubscribeContacts = onSnapshot(contactsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setContacts(data);
    });

    return () => {
      unsubscribeVault();
      unsubscribeContacts();
    };
  }, [user]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');

    if (!title.trim() || !username.trim() || !password.trim()) {
      setError(t('required_fields_error'));
      return;
    }

    try {
      // Client-side encryption
      const encryptedUser = encService.encrypt(username);
      const encryptedPass = encService.encrypt(password);
      const encryptedNote = note.trim() ? encService.encrypt(note) : '';

      await addDoc(collection(db, 'users', user.uid, 'vault_items'), {
        title: title.trim(),
        encryptedUsername: encryptedUser,
        encryptedPassword: encryptedPass,
        encryptedNote: encryptedNote,
        allowedBeneficiaries: selectedBeneficiaries, // Granular permissions
        createdAt: serverTimestamp()
      });

      // Clear form
      setTitle('');
      setUsername('');
      setPassword('');
      setNote('');
      setSelectedBeneficiaries([]);
      setIsAdding(false);
    } catch (e) {
      console.error(e);
      setError(t('failed_encrypt_save'));
    }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm(t('confirm_delete_secret'))) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'vault_items', itemId));
      // Remove from decrypted cache
      const updated = { ...decryptedValues };
      delete updated[itemId];
      setDecryptedValues(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleDecrypt = (item) => {
    if (decryptedValues[item.id]) {
      // Relock
      const updated = { ...decryptedValues };
      delete updated[item.id];
      setDecryptedValues(updated);
      setDecryptError('');
    } else {
      // Validate that masterPassword is present
      if (!masterPassword || masterPassword.trim() === '') {
        setDecryptError('Master password is required. Please sign out and sign in again.');
        return;
      }
      // Decrypt
      try {
        const decUser = encService.decrypt(item.encryptedUsername);
        const decPass = encService.decrypt(item.encryptedPassword);
        const decNote = item.encryptedNote ? encService.decrypt(item.encryptedNote) : '';

        if (!decUser && !decPass) {
          throw new Error('Decryption returned empty values - wrong master password');
        }

        setDecryptError('');
        setDecryptedValues({
          ...decryptedValues,
          [item.id]: { username: decUser, password: decPass, note: decNote }
        });
      } catch (err) {
        console.error('Decrypt failed:', err);
        setDecryptError('Decryption failed. Master password may be incorrect or data corrupted.');
      }
    }
  };

  const handleCopy = (itemId, field, val) => {
    navigator.clipboard.writeText(val);
    const key = `${itemId}_${field}`;
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleExportBackup = () => {
    if (items.length === 0) {
      alert("No vault items to export.");
      return;
    }
    const backupData = {
      exportedAt: new Date().toISOString(),
      vaultOwner: user.email,
      items: items.map(({ title, encryptedUsername, encryptedPassword, encryptedNote, allowedBeneficiaries }) => ({
        title,
        encryptedUsername,
        encryptedPassword,
        encryptedNote: encryptedNote || '',
        allowedBeneficiaries: allowedBeneficiaries || []
      }))
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `legacy_vault_encrypted_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredItems = items.filter(item => 
    item.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="lv-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      
      {/* Page Header */}
      <div className="lv-page-header" style={{ margin: 0 }}>
        <div>
          <h1 className="lv-page-title">{t('vault_title')}</h1>
          <p className="lv-page-subtitle">{t('vault_subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {items.length > 0 && (
            <button
              onClick={handleExportBackup}
              className="lv-btn lv-btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Copy style={{ width: 14, height: 14 }} />
              Export Backup
            </button>
          )}
          <button
            onClick={() => setIsAdding(!isAdding)}
            className={`lv-btn ${isAdding ? 'lv-btn-outline' : 'lv-btn-gold'}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {isAdding ? <X style={{ width: 14, height: 14 }} /> : <Plus style={{ width: 14, height: 14 }} />}
            {isAdding ? t('cancel_secret') : t('add_secret')}
          </button>
        </div>
      </div>

      {/* Add Secret Panel */}
      {isAdding && (
        <div className="lv-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
          <div className="lv-section-title" style={{ margin: 0 }}>{t('encrypt_secret')}</div>
          
          {error && (
            <div className="lv-alert lv-alert-error" style={{ margin: 0 }}>
              <ShieldAlert style={{ width: 15, height: 15 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="lv-field" style={{ margin: 0 }}>
              <label className="lv-label">{t('secret_title')}</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('secret_title_placeholder') || "e.g. Email account, Bank access"}
                className="lv-input"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="lv-field" style={{ margin: 0 }}>
                <label className="lv-label">{t('secret_user')}</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('secret_user_placeholder')}
                  className="lv-input"
                />
              </div>

              <div className="lv-field" style={{ margin: 0 }}>
                <label className="lv-label">{t('secret_pass')}</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="lv-input"
                />
              </div>
            </div>

            {/* Granular Heirs Selection */}
            <div style={{ borderTop: '1px solid var(--border-sub)', paddingTop: 16 }}>
              <label className="lv-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Users style={{ width: 14, height: 14, color: 'var(--gold)' }} />
                Allowed Beneficiaries (Inheritance Access Restrictions)
              </label>

              {contacts.length === 0 ? (
                <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
                  No trusted contacts registered yet. If unselected, this credential defaults to administrator-only manual settlement release.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-deep)', border: '1px solid var(--border-sub)', borderRadius: 8, padding: 12, maxHeight: 150, overflowY: 'auto' }}>
                  {contacts.map((contact) => (
                    <label key={contact.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.76rem', color: 'var(--text-sec)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedBeneficiaries.includes(contact.email)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedBeneficiaries([...selectedBeneficiaries, contact.email]);
                          } else {
                            setSelectedBeneficiaries(selectedBeneficiaries.filter(email => email !== contact.email));
                          }
                        }}
                      />
                      <span className="truncate">{contact.name} ({contact.email})</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="lv-field" style={{ margin: 0 }}>
              <label className="lv-label">{t('secret_note')}</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('secret_note_placeholder') || "Secret notes, backup pins..."}
                className="lv-input"
                style={{ height: 80, resize: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="submit" className="lv-btn lv-btn-gold">
                {t('save_to_cloud')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Decrypt Error Banner */}
      {decryptError && (
        <div className="lv-alert lv-alert-error" style={{ margin: 0 }}>
          <ShieldAlert style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span style={{ fontSize: '0.78rem' }}>{decryptError}</span>
          <button onClick={() => setDecryptError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', marginLeft: 'auto', opacity: 0.7 }}>✕</button>
        </div>
      )}

      {/* Main List & Search */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {/* Search Input */}
        <div style={{ position: 'relative', maxWidth: 400 }}>
          <Search style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_placeholder')}
            className="lv-input"
            style={{ paddingLeft: 40 }}
          />
        </div>

        {filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', border: '1px solid var(--border-sub)', borderRadius: 12 }}>
            <Lock style={{ width: 40, height: 40, color: 'var(--text-muted)', opacity: 0.35, marginBottom: 12 }} />
            <h3 style={{ fontSize: '0.90rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t('vault_empty')}</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>{t('vault_empty_desc')}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            {filteredItems.map((item) => {
              const dec = decryptedValues[item.id];
              return (
                <div 
                  key={item.id}
                  className="lv-card"
                  style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
                >
                  {/* Item Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <KeyRound style={{ width: 16, height: 16, color: 'var(--gold)' }} />
                      </div>
                      <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{item.title}</h4>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => toggleDecrypt(item)}
                        className="lv-btn lv-btn-outline lv-btn-sm"
                        style={{ padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: dec ? 'rgba(34,197,94,0.3)' : undefined, background: dec ? 'rgba(34,197,94,0.05)' : undefined }}
                        title={dec ? 'Lock Item' : 'Decrypt Item'}
                      >
                        {dec ? <Unlock style={{ width: 14, height: 14, color: 'var(--green)' }} /> : <Lock style={{ width: 14, height: 14 }} />}
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="lv-btn lv-btn-danger lv-btn-sm"
                        style={{ padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Trash2 style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                  </div>

                  {/* Allowed Beneficiaries Badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: 4 }}>Allowed Heirs:</span>
                    {item.allowedBeneficiaries && item.allowedBeneficiaries.length > 0 ? (
                      item.allowedBeneficiaries.map((email, idx) => (
                        <span key={idx} className="lv-badge lv-badge-gold" style={{ fontSize: '0.62rem', padding: '2px 6px' }}>
                          {email}
                        </span>
                      ))
                    ) : (
                      <span className="lv-badge lv-badge-muted" style={{ fontSize: '0.62rem', padding: '2px 6px' }}>
                        Admin Release Only
                      </span>
                    )}
                  </div>

                  {/* Credentials Content */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-deep)', border: '1px solid var(--border-sub)', borderRadius: 8, padding: 12 }}>
                    
                    {/* Username */}
                    <div>
                      <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{t('username')}</span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <code style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, paddingRight: 10 }}>
                          {dec ? dec.username : '••••••••••••••••'}
                        </code>
                        {dec && (
                          <button
                            onClick={() => handleCopy(item.id, 'user', dec.username)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
                          >
                            {copiedField === `${item.id}_user` ? <Check style={{ width: 13, height: 13, color: 'var(--green)' }} /> : <Copy style={{ width: 13, height: 13 }} />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Password */}
                    <div style={{ borderTop: '1px solid var(--border-sub)', paddingTop: 8 }}>
                      <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{t('password')}</span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <code style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, paddingRight: 10 }}>
                          {dec ? dec.password : '••••••••••••••••'}
                        </code>
                        {dec && (
                          <button
                            onClick={() => handleCopy(item.id, 'pass', dec.password)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}
                          >
                            {copiedField === `${item.id}_pass` ? <Check style={{ width: 13, height: 13, color: 'var(--green)' }} /> : <Copy style={{ width: 13, height: 13 }} />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Note */}
                    {((dec && dec.note) || (!dec && item.encryptedNote)) && (
                      <div style={{ borderTop: '1px solid var(--border-sub)', paddingTop: 8 }}>
                        <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{t('secure_note')}</span>
                        <p style={{ fontSize: '0.74rem', color: 'var(--text-sec)', margin: 0, fontStyle: 'italic', lineHeight: 1.3, whiteSpace: 'pre-wrap' }}>
                          {dec ? dec.note : '••••••••••••••••••••••••••••'}
                        </p>
                      </div>
                    )}

                  </div>

                  {/* Card Footer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-sub)', paddingTop: 10 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ShieldCheck style={{ width: 12, height: 12, color: 'var(--green)' }} />
                      {t('client_encrypted')}
                    </span>
                    <span>
                      {item.createdAt ? new Date(item.createdAt.toDate()).toLocaleDateString() : t('just_now')}
                    </span>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
