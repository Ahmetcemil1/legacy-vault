import React, { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import {
  doc, onSnapshot, updateDoc, setDoc, serverTimestamp,
  collection, query, where, getDocs, getDoc
} from 'firebase/firestore';
import {
  Activity, ShieldCheck, AlertTriangle, KeyRound, Film,
  Calendar, CheckCircle, ArrowRight, Users, Clock,
  ThumbsUp, ThumbsDown, ShieldAlert, Bell, Inbox
} from 'lucide-react';
import { t } from '../services/translation';

export default function Dashboard({ user, onNavigate }) {
  const [userData, setUserData] = useState(null);
  const [vaultCount, setVaultCount] = useState(0);
  const [messagesCount, setMessagesCount] = useState(0);
  const [pingSuccess, setPingSuccess] = useState(false);
  const [loadingPing, setLoadingPing] = useState(false);

  // Co-Signer Panel State
  // pendingApprovals: list of { ownerUid, ownerEmail, ownerName, myContactDocId, alreadyApproved, approvedCount, requiredCount }
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [approvingId, setApprovingId] = useState(null); // ownerUid currently being approved

  useEffect(() => {
    if (!user) return;

    // Listen to user settings document
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribeUser = onSnapshot(userDocRef, (snapshot) => {
      if (snapshot.exists()) {
        setUserData(snapshot.data());
      }
    });

    // Listen to vault items count
    const vaultRef = collection(db, 'users', user.uid, 'vault_items');
    const unsubscribeVault = onSnapshot(vaultRef, (snapshot) => {
      setVaultCount(snapshot.docs.length);
    });

    // Listen to video messages count
    const messagesRef = collection(db, 'users', user.uid, 'video_messages');
    const unsubscribeMessages = onSnapshot(messagesRef, (snapshot) => {
      setMessagesCount(snapshot.docs.length);
    });

    // ── Co-Signer Listener ──────────────────────────────────────────────
    // Find all users where this user is listed as an active co-signer
    // We query the top-level users collection for releaseStatus == 'pending_release'
    // then check if we are listed as co-signer for each
    let pendingApprovalUnsubs = [];

    const loadPendingApprovals = async () => {
      try {
        // Find all user docs where releaseStatus is pending_release
        const usersRef = collection(db, 'users');
        const pendingQuery = query(usersRef, where('releaseStatus', '==', 'pending_release'));
        const pendingSnap = await getDocs(pendingQuery);

        const approvals = [];
        for (const ownerDoc of pendingSnap.docs) {
          const ownerUid = ownerDoc.id;
          if (ownerUid === user.uid) continue; // Skip own vault

          // Check if this user is listed as co-signer for this owner
          const myContactRef = doc(db, 'users', ownerUid, 'trusted_contacts', user.uid);
          const myContactSnap = await getDoc(myContactRef);

          if (myContactSnap.exists() && myContactSnap.data().isCoSigner) {
            const ownerData = ownerDoc.data();
            // Count how many co-signers have already approved
            const coSignersRef = collection(db, 'users', ownerUid, 'trusted_contacts');
            const allCoSignersSnap = await getDocs(query(coSignersRef, where('isCoSigner', '==', true)));
            const approvedCount = allCoSignersSnap.docs.filter(d => d.data().approvedRelease === true).length;
            const requiredCount = ownerData.requiredCoSigners || 2;

            approvals.push({
              ownerUid,
              ownerEmail: ownerData.email || 'Unknown',
              ownerName: `${ownerData.firstName || ''} ${ownerData.lastName || ''}`.trim() || ownerData.email,
              myContactDocId: myContactSnap.id,
              alreadyApproved: myContactSnap.data().approvedRelease === true,
              approvedCount,
              requiredCount,
              pendingReleaseAt: ownerData.pendingReleaseAt
            });
          }
        }
        setPendingApprovals(approvals);
      } catch (err) {
        console.error('Co-signer approval fetch failed:', err);
      }
    };

    loadPendingApprovals();
    // Re-check every minute (real-time would require a complex query)
    const pollInterval = setInterval(loadPendingApprovals, 60000);

    return () => {
      unsubscribeUser();
      unsubscribeVault();
      unsubscribeMessages();
      clearInterval(pollInterval);
    };
  }, [user]);

  const handlePing = async () => {
    if (!user) return;
    setLoadingPing(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        lastActive: serverTimestamp(),
        switchTriggered: false
      }, { merge: true });
      setPingSuccess(true);
      setTimeout(() => setPingSuccess(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPing(false);
    }
  };

  const handleApproveRelease = async (ownerUid) => {
    setApprovingId(ownerUid);
    try {
      const contactRef = doc(db, 'users', ownerUid, 'trusted_contacts', user.uid);
      await updateDoc(contactRef, {
        approvedRelease: true,
        approvedAt: serverTimestamp()
      });
      // Update local state optimistically
      setPendingApprovals(prev =>
        prev.map(a => a.ownerUid === ownerUid
          ? { ...a, alreadyApproved: true, approvedCount: a.approvedCount + 1 }
          : a
        )
      );
    } catch (err) {
      console.error('Approval failed:', err);
      alert('Onay işlemi başarısız oldu. Lütfen tekrar deneyin.');
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectRelease = async (ownerUid) => {
    if (!window.confirm('Bu kasanın açılmasını reddetmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) return;
    setApprovingId(ownerUid);
    try {
      const contactRef = doc(db, 'users', ownerUid, 'trusted_contacts', user.uid);
      await updateDoc(contactRef, {
        approvedRelease: false,
        rejectedAt: serverTimestamp()
      });
      setPendingApprovals(prev => prev.filter(a => a.ownerUid !== ownerUid));
    } catch (err) {
      console.error('Reject failed:', err);
    } finally {
      setApprovingId(null);
    }
  };

  const getSwitchStatus = () => {
    if (!userData) return { label: t('switch_armed'), badgeClass: 'lv-badge-green', dotClass: 'lv-dot-green' };
    if (userData.switchTriggered) {
      return { label: t('switch_triggered'), badgeClass: 'lv-badge-red', dotClass: 'lv-dot-red' };
    }
    if (!userData.deadMansSwitchEnabled) {
      return { label: t('switch_deactivated'), badgeClass: 'lv-badge-muted', dotClass: 'lv-dot-muted' };
    }
    return { label: t('switch_armed'), badgeClass: 'lv-badge-green', dotClass: 'lv-dot-green' };
  };

  const formatLastActive = () => {
    if (!userData || !userData.lastActive) return t('never');
    const date = userData.lastActive.toDate();
    return date.toLocaleString();
  };

  const status = getSwitchStatus();

  return (
    <div className="lv-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Page Header */}
      <div className="lv-page-header" style={{ margin: 0 }}>
        <div>
          <h1 className="lv-page-title">{t('dashboard_title')}</h1>
          <p className="lv-page-subtitle">{t('dashboard_subtitle')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {pendingApprovals.length > 0 && (
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <Bell style={{ width: 18, height: 18, color: '#EF4444' }} />
              <span style={{
                position: 'absolute', top: -6, right: -6,
                background: '#EF4444', color: '#fff',
                fontSize: '0.55rem', fontWeight: 800,
                borderRadius: '50%', width: 14, height: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {pendingApprovals.length}
              </span>
            </div>
          )}
          <div className={`lv-badge ${status.badgeClass}`} style={{ padding: '6px 12px', gap: 8, display: 'flex', alignItems: 'center' }}>
            <div className={`lv-dot ${status.dotClass}`} style={{ width: 6, height: 6 }} />
            <span style={{ fontSize: '0.70rem', letterSpacing: '0.06em' }}>{status.label}</span>
          </div>
        </div>
      </div>

      {/* ── CO-SIGNER APPROVAL PANEL ─────────────────────────────────── */}
      {pendingApprovals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldAlert style={{ width: 16, height: 16, color: '#EF4444' }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Acil — Kasa Açma Onayı Bekleniyor
            </span>
            <span style={{ background: '#EF4444', color: '#fff', fontSize: '0.60rem', fontWeight: 800, borderRadius: 4, padding: '1px 6px' }}>
              {pendingApprovals.length}
            </span>
          </div>

          {pendingApprovals.map((approval) => {
            const progressPct = Math.min(100, Math.round((approval.approvedCount / approval.requiredCount) * 100));
            return (
              <div
                key={approval.ownerUid}
                className="lv-card"
                style={{
                  padding: 20,
                  border: approval.alreadyApproved
                    ? '1px solid rgba(34,197,94,0.25)'
                    : '1px solid rgba(239,68,68,0.25)',
                  background: approval.alreadyApproved
                    ? 'rgba(34,197,94,0.03)'
                    : 'rgba(239,68,68,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16
                }}
              >
                {/* Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 8,
                      background: 'rgba(201,168,76,0.10)',
                      border: '1px solid rgba(201,168,76,0.20)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1rem', fontWeight: 700, color: 'var(--gold)'
                    }}>
                      {approval.ownerName ? approval.ownerName.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {approval.ownerName}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {approval.ownerEmail}
                      </div>
                    </div>
                  </div>
                  {approval.alreadyApproved ? (
                    <span className="lv-badge lv-badge-green" style={{ fontSize: '0.66rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <CheckCircle style={{ width: 11, height: 11 }} />
                      Onaylandı
                    </span>
                  ) : (
                    <span className="lv-badge lv-badge-red" style={{ fontSize: '0.66rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, borderColor: 'rgba(239,68,68,0.3)', color: '#EF4444' }}>
                      <Clock style={{ width: 11, height: 11 }} />
                      Onay Bekleniyor
                    </span>
                  )}
                </div>

                {/* Description */}
                <p style={{ fontSize: '0.78rem', color: 'var(--text-sec)', margin: 0, lineHeight: 1.5 }}>
                  Bu kişinin Ölü Adam Anahtarı tetiklendi. Dijital varlıklarının mirasçılarına aktarılabilmesi için
                  <strong style={{ color: 'var(--gold)' }}> {approval.requiredCount} onaylayıcıdan {approval.approvedCount} tanesi onay verdi</strong>.
                  Siz de çoklu imza onaylayıcısısınız.
                </p>

                {/* Progress Bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                    <span>Onay İlerlemesi</span>
                    <span>{approval.approvedCount} / {approval.requiredCount}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-deep)', border: '1px solid var(--border-sub)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${progressPct}%`,
                      background: progressPct >= 100 ? 'var(--green)' : 'var(--gold)',
                      borderRadius: 4,
                      transition: 'width 0.4s ease'
                    }} />
                  </div>
                </div>

                {/* Action Buttons */}
                {!approval.alreadyApproved && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button
                      onClick={() => handleApproveRelease(approval.ownerUid)}
                      disabled={approvingId === approval.ownerUid}
                      className="lv-btn lv-btn-gold"
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                    >
                      {approvingId === approval.ownerUid
                        ? <span className="lv-spin" style={{ width: 14, height: 14 }} />
                        : <ThumbsUp style={{ width: 14, height: 14 }} />}
                      Kasa Açılmasını Onayla
                    </button>
                    <button
                      onClick={() => handleRejectRelease(approval.ownerUid)}
                      disabled={approvingId === approval.ownerUid}
                      className="lv-btn lv-btn-danger"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 100 }}
                    >
                      <ThumbsDown style={{ width: 14, height: 14 }} />
                      Reddet
                    </button>
                  </div>
                )}

                {approval.alreadyApproved && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 8 }}>
                    <CheckCircle style={{ width: 15, height: 15, color: 'var(--green)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.76rem', color: 'var(--green)', fontWeight: 600 }}>
                      Onayınız kaydedildi. Diğer co-signer'ların onayı bekleniyor.
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>

        {/* Heartbeat Monitor Card */}
        <div className="lv-card" style={{ gridColumn: 'span 2', padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 20 }}>

          <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, background: 'rgba(201, 168, 76, 0.08)', border: '1px solid rgba(201, 168, 76, 0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Activity style={{ width: 18, height: 18, color: 'var(--gold)' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '0.90rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t('heartbeat_title')}</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('heartbeat_subtitle')}</p>
              </div>
            </div>

            {/* Pulse Button Container */}
            <div style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-sub)', borderRadius: 12, padding: '36px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              {pingSuccess ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <CheckCircle style={{ width: 44, height: 44, color: 'var(--green)' }} />
                  <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--green)', letterSpacing: '0.08em' }}>{t('pulse_recorded')}</span>
                </div>
              ) : (
                <button
                  onClick={handlePing}
                  disabled={loadingPing}
                  className="lv-btn lv-btn-gold"
                  style={{
                    width: 140, height: 140,
                    borderRadius: '50%',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 6,
                    border: '1px solid rgba(201, 168, 76, 0.3)',
                    boxShadow: '0 4px 20px rgba(201, 168, 76, 0.08)'
                  }}
                >
                  <Activity style={{ width: 24, height: 24, color: '#0A0800' }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.05em' }}>{t('i_am_alive')}</span>
                  <span style={{ fontSize: '0.54rem', opacity: 0.8, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{t('send_pulse')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Details footer */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, paddingTop: 16, borderTop: '1px solid var(--border-sub)', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Calendar style={{ width: 16, height: 16, color: 'var(--text-muted)' }} />
              <div>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('last_heartbeat')}</div>
                <div style={{ fontSize: '0.80rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>{formatLastActive()}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldCheck style={{ width: 16, height: 16, color: 'var(--gold)' }} />
              <div>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('next_trigger')}</div>
                <div style={{ fontSize: '0.80rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                  {userData ? `${userData.thresholdDays || 30} ${t('days')}` : `30 ${t('days')}`}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Vault Stats Card */}
          <div
            onClick={() => onNavigate('vault')}
            className="lv-card"
            style={{ padding: 20, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('vault_items_label')}</span>
              <span style={{ fontSize: '2.00rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{vaultCount}</span>
              <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>{t('vault_items_desc')}</span>
            </div>
            <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-sub)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <KeyRound style={{ width: 16, height: 16, color: 'var(--gold)' }} />
            </div>
          </div>

          {/* Messages Stats Card */}
          <div
            onClick={() => onNavigate('video-messages')}
            className="lv-card"
            style={{ padding: 20, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('video_messages_label')}</span>
              <span style={{ fontSize: '2.00rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{messagesCount}</span>
              <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>{t('video_messages_desc')}</span>
            </div>
            <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-sub)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Film style={{ width: 16, height: 16, color: 'var(--gold)' }} />
            </div>
          </div>

          {/* Co-signer indicator */}
          <div
            onClick={() => onNavigate('contacts')}
            className="lv-card"
            style={{ padding: 20, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Co-Signer Talepleri</span>
              <span style={{ fontSize: '2.00rem', fontWeight: 800, color: pendingApprovals.length > 0 ? '#EF4444' : 'var(--text-primary)', lineHeight: 1 }}>
                {pendingApprovals.length}
              </span>
              <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                {pendingApprovals.length > 0 ? 'Acil onay gerekiyor' : 'Bekleyen onay yok'}
              </span>
            </div>
            <div style={{ width: 36, height: 36, background: pendingApprovals.length > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${pendingApprovals.length > 0 ? 'rgba(239,68,68,0.25)' : 'var(--border-sub)'}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users style={{ width: 16, height: 16, color: pendingApprovals.length > 0 ? '#EF4444' : 'var(--gold)' }} />
            </div>
          </div>

          {/* Alert Info Banner */}
          <div className="lv-alert lv-alert-warn" style={{ margin: 0, gap: 10 }}>
            <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('zero_knowledge_warn')}</span>
              <span style={{ fontSize: '0.74rem', lineHeight: '1.4' }}>{t('zero_knowledge_desc')}</span>
            </div>
          </div>

        </div>

      </div>

      <style>{`
        @media(max-width: 768px) {
          div[style*="gridTemplateColumns"] {
            grid-template-columns: 1fr !important;
          }
          div[style*="gridColumn: 'span 2'"] {
            grid-column: span 1 !important;
          }
        }
      `}</style>

    </div>
  );
}
