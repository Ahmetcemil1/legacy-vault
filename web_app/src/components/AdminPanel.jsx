import React, { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import {
  ShieldAlert, CheckCircle, XCircle, FileText, ExternalLink,
  Clock, User, Calendar, Mail, Phone, ShieldCheck, Search, Filter
} from 'lucide-react';

export default function AdminPanel() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [actioningId, setActioningId] = useState(null);

  useEffect(() => {
    const claimsQuery = query(collection(db, 'claims'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(claimsQuery, (snapshot) => {
      const loadedClaims = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setClaims(loadedClaims);
      setLoading(false);
    }, (error) => {
      console.error("Failed to load claims:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleUpdateStatus = async (claimId, newStatus) => {
    setActioningId(claimId);
    try {
      const claimRef = doc(db, 'claims', claimId);
      await updateDoc(claimRef, {
        status: newStatus,
        reviewedAt: serverTimestamp()
      });
    } catch (e) {
      console.error("Failed to update claim status:", e);
      alert("Error: Insufficient permissions or network error.");
    } finally {
      setActioningId(null);
    }
  };

  const filteredClaims = claims.filter(c => {
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    const searchString = `${c.deceasedEmail} ${c.deceasedFirstName} ${c.deceasedLastName} ${c.claimantEmail} ${c.claimantName}`.toLowerCase();
    const matchesSearch = searchString.includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return <span className="lv-badge lv-badge-green" style={{ fontSize: '0.68rem' }}>Approved</span>;
      case 'rejected':
        return <span className="lv-badge lv-badge-red" style={{ fontSize: '0.68rem' }}>Rejected</span>;
      default:
        return <span className="lv-badge lv-badge-amber" style={{ fontSize: '0.68rem' }}>Pending Review</span>;
    }
  };

  const stats = {
    total: claims.length,
    pending: claims.filter(c => c.status === 'pending').length,
    approved: claims.filter(c => c.status === 'approved').length,
    rejected: claims.filter(c => c.status === 'rejected').length,
  };

  return (
    <div className="lv-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      
      {/* Header */}
      <div className="lv-page-header" style={{ margin: 0 }}>
        <div>
          <h1 className="lv-page-title">Administrative Settlement Console</h1>
          <p className="lv-page-subtitle">Verify official death certificates, inspect claimant records, and approve digital estate releases.</p>
        </div>
        <div className="lv-badge lv-badge-gold" style={{ padding: '6px 12px', gap: 8 }}>
          <ShieldAlert style={{ width: 14, height: 14 }} />
          <span style={{ fontSize: '0.70rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>System Admin Mode</span>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {[
          { label: 'Total Submitted Claims', value: stats.total, color: 'var(--text-primary)' },
          { label: 'Pending Assessment', value: stats.pending, color: 'var(--gold)' },
          { label: 'Approved Claims', value: stats.approved, color: 'var(--green)' },
          { label: 'Rejected / Disputed', value: stats.rejected, color: '#EF4444' }
        ].map((stat, i) => (
          <div key={i} className="lv-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</span>
            <span style={{ fontSize: '1.60rem', fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Filters & Actions Panel */}
      <div className="lv-card" style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search email, claimant, or deceased name..."
            className="lv-input"
            style={{ paddingLeft: 36, fontSize: '0.80rem' }}
          />
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Filter style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
          <div style={{ display: 'flex', background: 'var(--bg-deep)', border: '1px solid var(--border-sub)', borderRadius: 8, padding: 3 }}>
            {['all', 'pending', 'approved', 'rejected'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: filterStatus === st ? 'var(--bg-surface)' : 'transparent',
                  color: filterStatus === st ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.15s'
                }}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Claims List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div className="lv-spin" style={{ width: 24, height: 24 }} />
        </div>
      ) : filteredClaims.length === 0 ? (
        <div className="lv-card" style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <ShieldCheck style={{ width: 36, height: 36, color: 'var(--text-muted)' }} />
          <div>
            <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>No Claims Found</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>All submitted claims have been assessed and processed.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filteredClaims.map((claim) => (
            <div key={claim.id} className="lv-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              
              {/* Header Info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid var(--border-sub)', paddingBottom: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Claim: {claim.id.slice(0, 16)}
                    </span>
                    {getStatusBadge(claim.status)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Clock style={{ width: 12, height: 12 }} />
                    Submitted: {claim.createdAt ? claim.createdAt.toDate().toLocaleString() : 'Just now'}
                  </div>
                </div>

                {claim.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleUpdateStatus(claim.id, 'rejected')}
                      disabled={actioningId === claim.id}
                      className="lv-btn lv-btn-outline lv-btn-sm"
                      style={{ color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.2)', padding: '6px 12px', fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <XCircle style={{ width: 14, height: 14 }} />
                      Reject Claim
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(claim.id, 'approved')}
                      disabled={actioningId === claim.id}
                      className="lv-btn lv-btn-gold lv-btn-sm"
                      style={{ padding: '6px 14px', fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <CheckCircle style={{ width: 14, height: 14, color: '#0A0800' }} />
                      Approve Release
                    </button>
                  </div>
                )}
              </div>

              {/* Two-Column Details View */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                
                {/* Deceased Profile */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: '0.66rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Deceased Profile</div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-deep)', border: '1px solid var(--border-sub)', borderRadius: 8, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
                      <User style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {claim.deceasedFirstName} {claim.deceasedLastName}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.74rem' }}>
                      <Mail style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                      <span style={{ color: 'var(--text-sec)' }}>{claim.deceasedEmail}</span>
                    </div>
                    {claim.deceasedPhone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.74rem' }}>
                        <Phone style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                        <span style={{ color: 'var(--text-sec)' }}>{claim.deceasedPhone}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', borderTop: '1px solid var(--border-sub)', paddingTop: 8, marginTop: 4 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Date of Birth: {claim.deceasedDob || 'N/A'}</span>
                      <span style={{ color: '#EF4444', fontWeight: 600 }}>Death Date: {claim.dateOfDeath || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Claimant Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: '0.66rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Claimant & Relationship</div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-deep)', border: '1px solid var(--border-sub)', borderRadius: 8, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
                      <User style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{claim.claimantName}</span>
                      <span className="lv-badge lv-badge-gold" style={{ fontSize: '0.58rem', textTransform: 'uppercase', marginLeft: 'auto', padding: '2px 6px' }}>
                        {claim.relationship}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.74rem' }}>
                      <Mail style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                      <span style={{ color: 'var(--text-sec)' }}>{claim.claimantEmail}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.74rem' }}>
                      <Phone style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                      <span style={{ color: 'var(--text-sec)' }}>{claim.claimantPhone}</span>
                    </div>
                    {claim.claimantAddress && (
                      <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-sub)', paddingTop: 8, marginTop: 4, lineHeight: 1.3 }}>
                        Address: {[claim.claimantAddress, claim.claimantCity, claim.claimantCountry].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Uploaded Certificate Document */}
              <div style={{ background: 'rgba(201, 168, 76, 0.03)', border: '1px solid rgba(201, 168, 76, 0.15)', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'between', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileText style={{ width: 18, height: 18, color: 'var(--gold)' }} />
                  <div>
                    <div style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--text-primary)' }}>Official Certified Death Certificate</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>Securely stored under AES-256 cloud encryption</div>
                  </div>
                </div>
                
                <a
                  href={claim.certificateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lv-btn lv-btn-outline lv-btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', marginLeft: 'auto' }}
                >
                  View Document
                  <ExternalLink style={{ width: 12, height: 12 }} />
                </a>
              </div>

            </div>
          ))}
        </div>
      )}

      <style>{`
        @media(max-width: 768px) {
          div[style*="gridTemplateColumns"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
