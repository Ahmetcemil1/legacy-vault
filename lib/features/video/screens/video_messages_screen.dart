import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:file_picker/file_picker.dart';
import 'package:legacy_vault/core/services/auth_service.dart';
import 'package:legacy_vault/core/theme/app_theme.dart';
import 'package:intl/intl.dart';
import 'dart:typed_data';

class VideoMessagesScreen extends StatefulWidget {
  const VideoMessagesScreen({super.key});

  @override
  State<VideoMessagesScreen> createState() => _VideoMessagesScreenState();
}

class _VideoMessagesScreenState extends State<VideoMessagesScreen> {
  final _authService = AuthService();
  final _titleController = TextEditingController();
  final _noteController = TextEditingController();
  bool _isUploading = false;
  double _uploadProgress = 0;

  @override
  void dispose() {
    _titleController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  /// Dosya seçici açar, video yükler ve Firestore'a kaydeder.
  void _pickAndUploadVideo() async {
    _titleController.clear();
    _noteController.clear();

    // Önce başlık bilgisi al
    final shouldProceed = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.videocam_rounded, color: AppTheme.accentTeal),
              SizedBox(width: 12),
              Text('New Video Message'),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _titleController,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Title',
                  hintText: 'e.g. To my daughter...',
                  prefixIcon: Icon(Icons.title),
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _noteController,
                style: const TextStyle(color: Colors.white),
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Note (optional)',
                  hintText: 'A message to go with the video...',
                  prefixIcon: Icon(Icons.note_alt_outlined),
                  alignLabelWithHint: true,
                ),
              ),
              const SizedBox(height: 12),
              const Row(
                children: [
                  Icon(Icons.info_outline, size: 14, color: AppTheme.accentTeal),
                  SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Video will be stored in Firebase Storage and released when your Dead Man\'s Switch triggers.',
                      style: TextStyle(color: AppTheme.accentTeal, fontSize: 11),
                    ),
                  ),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('CANCEL')),
            ElevatedButton.icon(
              onPressed: () => Navigator.pop(ctx, true),
              icon: const Icon(Icons.attach_file_rounded, size: 18),
              label: const Text('SELECT FILE'),
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.accentTeal),
            ),
          ],
        );
      },
    );

    if (shouldProceed != true || _titleController.text.trim().isEmpty) return;

    // Dosya seçici aç (video veya ses)
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['mp4', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'm4a', 'pdf', 'txt', 'jpg', 'png'],
      withData: true, // Web uyumluluğu için
    );

    if (result == null || result.files.isEmpty) return;

    final file = result.files.first;
    final Uint8List? fileBytes = file.bytes;
    final fileName = file.name;

    if (fileBytes == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not read file data.')),
        );
      }
      return;
    }

    final user = _authService.currentUser;
    if (user == null) return;

    setState(() {
      _isUploading = true;
      _uploadProgress = 0;
    });

    try {
      // Firebase Storage'a yükle
      final storageRef = FirebaseStorage.instance
          .ref()
          .child('users/${user.uid}/video_messages/${DateTime.now().millisecondsSinceEpoch}_$fileName');

      final uploadTask = storageRef.putData(
        fileBytes,
        SettableMetadata(contentType: _getContentType(fileName)),
      );

      uploadTask.snapshotEvents.listen((event) {
        if (mounted) {
          setState(() {
            _uploadProgress = event.bytesTransferred / event.totalBytes;
          });
        }
      });

      await uploadTask;
      final downloadUrl = await storageRef.getDownloadURL();

      // Firestore'a meta data kaydet
      await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .collection('video_messages')
          .add({
        'title': _titleController.text.trim(),
        'note': _noteController.text.trim(),
        'fileName': fileName,
        'fileUrl': downloadUrl,
        'fileSizeBytes': fileBytes.length,
        'createdAt': FieldValue.serverTimestamp(),
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Row(
              children: [
                Icon(Icons.check_circle, color: AppTheme.successGreen, size: 20),
                SizedBox(width: 12),
                Text('File uploaded and saved successfully.'),
              ],
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isUploading = false;
          _uploadProgress = 0;
        });
      }
    }
  }

  String _getContentType(String fileName) {
    final ext = fileName.split('.').last.toLowerCase();
    switch (ext) {
      case 'mp4':
        return 'video/mp4';
      case 'mov':
        return 'video/quicktime';
      case 'avi':
        return 'video/x-msvideo';
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'pdf':
        return 'application/pdf';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      default:
        return 'application/octet-stream';
    }
  }

  String _formatFileSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    if (bytes < 1024 * 1024 * 1024) return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
  }

  IconData _getFileIcon(String fileName) {
    final ext = fileName.split('.').last.toLowerCase();
    switch (ext) {
      case 'mp4':
      case 'mov':
      case 'avi':
      case 'mkv':
        return Icons.videocam_rounded;
      case 'mp3':
      case 'wav':
      case 'm4a':
        return Icons.audiotrack_rounded;
      case 'pdf':
        return Icons.picture_as_pdf_rounded;
      case 'jpg':
      case 'jpeg':
      case 'png':
        return Icons.image_rounded;
      default:
        return Icons.insert_drive_file_rounded;
    }
  }

  void _deleteMessage(String docId, String? fileUrl) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Message'),
        content: const Text('This file and its message will be permanently deleted.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('CANCEL')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.dangerRose),
            child: const Text('DELETE'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    final user = _authService.currentUser;
    if (user == null) return;

    // Storage'dan sil
    if (fileUrl != null && fileUrl.isNotEmpty) {
      try {
        await FirebaseStorage.instance.refFromURL(fileUrl).delete();
      } catch (_) {}
    }

    // Firestore'dan sil
    await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .collection('video_messages')
        .doc(docId)
        .delete();
  }

  @override
  Widget build(BuildContext context) {
    final user = _authService.currentUser;
    final screenWidth = MediaQuery.of(context).size.width;
    final isWide = screenWidth > 700;

    return Scaffold(
      appBar: AppBar(title: const Text('Video & File Messages')),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [AppTheme.bgDeep, Color(0xFF0F1623)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: Column(
          children: [
            // Upload progress bar
            if (_isUploading)
              Container(
                margin: const EdgeInsets.all(16),
                padding: const EdgeInsets.all(20),
                decoration: AppTheme.glassDecoration(borderRadius: 16),
                child: Column(
                  children: [
                    const Row(
                      children: [
                        SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.accentTeal),
                        ),
                        SizedBox(width: 12),
                        Text('Uploading...', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                        value: _uploadProgress,
                        backgroundColor: AppTheme.bgDeep,
                        color: AppTheme.accentTeal,
                        minHeight: 6,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${(_uploadProgress * 100).toStringAsFixed(0)}%',
                      style: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
                    ),
                  ],
                ),
              ),

            // Messages list
            Expanded(
              child: StreamBuilder<QuerySnapshot>(
                stream: FirebaseFirestore.instance
                    .collection('users')
                    .doc(user?.uid)
                    .collection('video_messages')
                    .orderBy('createdAt', descending: true)
                    .snapshots(),
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator(color: AppTheme.primaryPurple));
                  }
                  if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.videocam_off_rounded, size: 64, color: AppTheme.textMuted.withOpacity(0.3)),
                          const SizedBox(height: 16),
                          const Text(
                            'No messages yet',
                            style: TextStyle(color: AppTheme.textMuted, fontSize: 16),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Upload videos, audio, or documents for your loved ones.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: AppTheme.textMuted, fontSize: 13),
                          ),
                        ],
                      ),
                    );
                  }

                  final docs = snapshot.data!.docs;
                  return ListView.builder(
                    padding: EdgeInsets.symmetric(
                      horizontal: isWide ? (screenWidth - 600) / 2 : 16,
                      vertical: 16,
                    ),
                    itemCount: docs.length,
                    itemBuilder: (context, index) {
                      final doc = docs[index];
                      final data = doc.data() as Map<String, dynamic>;
                      return _buildMessageCard(doc.id, data, index);
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _isUploading ? null : _pickAndUploadVideo,
        backgroundColor: _isUploading ? AppTheme.textMuted : AppTheme.accentTeal,
        child: Icon(_isUploading ? Icons.hourglass_top_rounded : Icons.add_rounded),
      ).animate().fadeIn(delay: 300.ms).scale(begin: const Offset(0.5, 0.5), curve: Curves.elasticOut),
    );
  }

  Widget _buildMessageCard(String docId, Map<String, dynamic> data, int index) {
    final title = data['title'] ?? 'Untitled';
    final note = data['note'] ?? '';
    final fileName = data['fileName'] ?? 'unknown';
    final fileUrl = data['fileUrl'] as String?;
    final fileSizeBytes = data['fileSizeBytes'] as int? ?? 0;
    final createdAt = data['createdAt'] as Timestamp?;
    final dateStr = createdAt != null ? DateFormat('MMM d, yyyy – HH:mm').format(createdAt.toDate()) : 'Just now';

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: AppTheme.glassDecoration(borderRadius: 18),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    gradient: AppTheme.tealGradient,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(_getFileIcon(fileName), size: 24, color: Colors.white),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: Colors.white),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '$fileName • ${_formatFileSize(fileSizeBytes)}',
                        style: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline_rounded, color: AppTheme.dangerRose, size: 20),
                  onPressed: () => _deleteMessage(docId, fileUrl),
                ),
              ],
            ),
            if (note.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.bgDeep.withOpacity(0.5),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  note,
                  style: const TextStyle(color: AppTheme.textMuted, fontSize: 13, height: 1.4, fontStyle: FontStyle.italic),
                ),
              ),
            ],
            const SizedBox(height: 10),
            Text(
              dateStr,
              style: TextStyle(color: AppTheme.textMuted.withOpacity(0.6), fontSize: 11),
            ),
          ],
        ),
      ),
    ).animate().fadeIn(delay: Duration(milliseconds: 100 * index), duration: 400.ms).slideX(begin: 0.05);
  }
}
