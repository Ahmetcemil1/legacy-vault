import React, { useEffect, useState } from 'react';
import { db, storage } from '../services/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Film, Plus, Trash2, X, AlertCircle, FileText, CheckCircle, ArrowUpCircle } from 'lucide-react';
import { t } from '../services/translation';

export default function VideoMessages({ user }) {
  const [messages, setMessages] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  
  // Upload states
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;

    const messagesRef = collection(db, 'users', user.uid, 'video_messages');
    const unsubscribe = onSnapshot(messagesRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(data);
    });

    return unsubscribe;
  }, [user]);

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setError('');

    if (!title.trim() || !file) {
      setError('Title and File are required.');
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      // Create Storage reference
      const storageRef = ref(
        storage, 
        `users/${user.uid}/video_messages/${Date.now()}_${file.name}`
      );

      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setProgress(percent);
        },
        (err) => {
          console.error(err);
          setError(t('upload_failed'));
          setUploading(false);
        },
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

          // Save to Firestore
          await addDoc(collection(db, 'users', user.uid, 'video_messages'), {
            title: title.trim(),
            note: note.trim(),
            fileName: file.name,
            fileUrl: downloadUrl,
            fileSizeBytes: file.size,
            createdAt: serverTimestamp()
          });

          // Reset form
          setTitle('');
          setNote('');
          setFile(null);
          setIsAdding(false);
          setUploading(false);
          setProgress(0);
        }
      );
    } catch (e) {
      console.error(e);
      setError(t('upload_failed'));
      setUploading(false);
    }
  };

  const handleDelete = async (itemId, fileUrl) => {
    if (!window.confirm(t('confirm_delete_video'))) return;

    try {
      // 1. Delete from Storage
      if (fileUrl) {
        const storageRef = ref(storage, fileUrl);
        await deleteObject(storageRef).catch(err => console.warn("Storage delete failed:", err));
      }
      
      // 2. Delete from Firestore
      await deleteDoc(doc(db, 'users', user.uid, 'video_messages', itemId));
    } catch (e) {
      console.error(e);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div className="lv-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      
      {/* Page Header */}
      <div className="lv-page-header" style={{ margin: 0 }}>
        <div>
          <h1 className="lv-page-title">{t('video_title')}</h1>
          <p className="lv-page-subtitle">{t('video_subtitle')}</p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          disabled={uploading}
          className={`lv-btn ${isAdding ? 'lv-btn-outline' : 'lv-btn-gold'}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {isAdding ? <X style={{ width: 14, height: 14 }} /> : <Plus style={{ width: 14, height: 14 }} />}
          {isAdding ? t('cancel') : t('upload_btn')}
        </button>
      </div>

      {/* Upload Form Panel */}
      {isAdding && (
        <div className="lv-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
          <div className="lv-section-title" style={{ margin: 0 }}>Upload Heritage File / Video Message</div>

          {error && (
            <div className="lv-alert lv-alert-error" style={{ margin: 0 }}>
              <AlertCircle style={{ width: 15, height: 15 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="lv-field" style={{ margin: 0 }}>
              <label className="lv-label">{t('file_title_label')}</label>
              <input
                type="text"
                required
                disabled={uploading}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('file_title_placeholder') || "e.g. Letter to my family"}
                className="lv-input"
              />
            </div>

            <div className="lv-field" style={{ margin: 0 }}>
              <label className="lv-label">{t('select_file_btn')}</label>
              <input
                type="file"
                required
                disabled={uploading}
                onChange={handleFileChange}
                className="lv-input"
              />
            </div>

            <div className="lv-field" style={{ margin: 0 }}>
              <label className="lv-label">{t('secure_note')}</label>
              <textarea
                disabled={uploading}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('file_note_placeholder') || "Write a secure note accompanying this file..."}
                className="lv-input"
                style={{ height: 80, resize: 'none' }}
              />
            </div>

            {uploading && (
              <div style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-sub)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 600 }}>
                  <span style={{ color: 'var(--text-sec)' }}>Uploading secure file...</span>
                  <span style={{ color: 'var(--gold)' }}>{progress}%</span>
                </div>
                <div className="lv-progress-track">
                  <div className="lv-progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="submit" disabled={uploading} className="lv-btn lv-btn-gold" style={{ minWidth: 120 }}>
                {uploading ? <span className="lv-spin" /> : t('save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Messages List Grid */}
      <div>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', border: '1px solid var(--border-sub)', borderRadius: 12 }}>
            <Film style={{ width: 40, height: 40, color: 'var(--text-muted)', opacity: 0.35, marginBottom: 12 }} />
            <h3 style={{ fontSize: '0.90rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t('no_messages')}</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>{t('no_messages_desc')}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {messages.map((item) => (
              <div 
                key={item.id}
                className="lv-card"
                style={{ padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 18 }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <FileText style={{ width: 16, height: 16, color: 'var(--gold)' }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <h4 style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</h4>
                        <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{item.fileName}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(item.id, item.fileUrl)}
                      className="lv-btn lv-btn-danger lv-btn-sm"
                      style={{ padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  </div>

                  {item.note && (
                    <div style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-sub)', borderRadius: 8, padding: 12, marginTop: 12 }}>
                      <p style={{ fontSize: '0.74rem', color: 'var(--text-sec)', margin: 0, fontStyle: 'italic', lineHeight: 1.3 }}>{item.note}</p>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.70rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-sub)', paddingTop: 12 }}>
                  <span>Size: {formatFileSize(item.fileSizeBytes)}</span>
                  <span>
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
