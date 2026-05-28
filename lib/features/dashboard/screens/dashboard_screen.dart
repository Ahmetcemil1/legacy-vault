import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:legacy_vault/core/services/auth_service.dart';
import 'package:legacy_vault/core/services/keypair_service.dart';
import 'package:legacy_vault/core/services/shamir_service.dart';
import 'package:legacy_vault/core/services/encryption_service.dart';
import 'package:legacy_vault/core/theme/app_theme.dart';
import 'package:legacy_vault/features/vault/screens/vault_screen.dart';
import 'package:legacy_vault/features/contacts/screens/contacts_screen.dart';
import 'package:legacy_vault/features/video/screens/video_messages_screen.dart';
import 'package:legacy_vault/features/settings/screens/settings_screen.dart';
import 'package:intl/intl.dart';
import 'dart:math' as math;

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final _authService = AuthService();

  // Co-Signer Panel State
  List<Map<String, dynamic>> _pendingApprovals = [];
  bool _isLoadingApprovals = true;
  String? _approvingId;

  // Inherited Vaults State
  List<Map<String, dynamic>> _inheritedVaults = [];
  bool _isLoadingInherited = true;

  @override
  void initState() {
    super.initState();
    _updateLastActive();
    _loadPendingApprovals();
    _loadInheritedVaults();
  }

  Future<void> _updateLastActive() async {
    final user = _authService.currentUser;
    if (user != null) {
      await FirebaseFirestore.instance.collection('users').doc(user.uid).set({
        'lastActive': FieldValue.serverTimestamp(),
        'email': user.email,
        'deadMansSwitchEnabled': true,
      }, SetOptions(merge: true));
    }
  }

  void _loadPendingApprovals() async {
    final user = _authService.currentUser;
    if (user == null) return;

    try {
      final snap = await FirebaseFirestore.instance
          .collection('users')
          .where('releaseStatus', isEqualTo: 'pending_release')
          .get();

      final List<Map<String, dynamic>> approvals = [];
      for (final doc in snap.docs) {
        final ownerUid = doc.id;
        if (ownerUid == user.uid) continue;

        // Check if we are a co-signer
        final myContactRef = FirebaseFirestore.instance
            .collection('users')
            .doc(ownerUid)
            .collection('trusted_contacts')
            .doc(user.uid);
        
        final myContactSnap = await myContactRef.get();
        if (myContactSnap.exists && myContactSnap.data()?['isCoSigner'] == true) {
          final ownerData = doc.data();
          
          // Get total co-signers who approved
          final allContacts = await FirebaseFirestore.instance
              .collection('users')
              .doc(ownerUid)
              .collection('trusted_contacts')
              .where('isCoSigner', isEqualTo: true)
              .get();
          
          final approvedCount = allContacts.docs.where((d) => d.data()['approvedRelease'] == true).length;
          final requiredCount = ownerData['requiredCoSigners'] ?? 2;

          approvals.add({
            'ownerUid': ownerUid,
            'ownerEmail': ownerData['email'] ?? 'Unknown',
            'ownerName': '${ownerData['firstName'] ?? ''} ${ownerData['lastName'] ?? ''}'.trim(),
            'alreadyApproved': myContactSnap.data()?['approvedRelease'] == true,
            'approvedCount': approvedCount,
            'requiredCount': requiredCount,
          });
        }
      }

      if (mounted) {
        setState(() {
          _pendingApprovals = approvals;
          _isLoadingApprovals = false;
        });
      }
    } catch (e) {
      print("Error loading co-signer approvals: $e");
      if (mounted) setState(() => _isLoadingApprovals = false);
    }
  }

  void _loadInheritedVaults() async {
    final user = _authService.currentUser;
    if (user == null) return;

    try {
      final snap = await FirebaseFirestore.instance
          .collection('users')
          .where('switchTriggered', isEqualTo: true)
          .get();

      final List<Map<String, dynamic>> inherited = [];
      for (final doc in snap.docs) {
        final ownerUid = doc.id;
        if (ownerUid == user.uid) continue;

        // Check if we are in their trusted contacts
        final contactDoc = await FirebaseFirestore.instance
            .collection('users')
            .doc(ownerUid)
            .collection('trusted_contacts')
            .doc(user.uid)
            .get();

        if (contactDoc.exists) {
          final ownerData = doc.data();
          inherited.add({
            'ownerUid': ownerUid,
            'ownerEmail': ownerData['email'] ?? 'Unknown',
            'ownerName': '${ownerData['firstName'] ?? ''} ${ownerData['lastName'] ?? ''}'.trim(),
            'sssProtected': ownerData['sssProtected'] == true,
            'sssThreshold': ownerData['sssThreshold'] ?? 2,
            'myContactData': contactDoc.data(),
          });
        }
      }

      if (mounted) {
        setState(() {
          _inheritedVaults = inherited;
          _isLoadingInherited = false;
        });
      }
    } catch (e) {
      print("Error loading inherited vaults: $e");
      if (mounted) setState(() => _isLoadingInherited = false);
    }
  }

  void _approveRelease(String ownerUid) async {
    final user = _authService.currentUser;
    if (user == null) return;

    setState(() => _approvingId = ownerUid);

    try {
      await FirebaseFirestore.instance
          .collection('users')
          .doc(ownerUid)
          .collection('trusted_contacts')
          .doc(user.uid)
          .update({
        'approvedRelease': true,
        'approvedAt': FieldValue.serverTimestamp(),
      });

      _loadPendingApprovals();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Approval failed: $e')),
      );
    } finally {
      setState(() => _approvingId = null);
    }
  }

  void _rejectRelease(String ownerUid) async {
    final user = _authService.currentUser;
    if (user == null) return;

    setState(() => _approvingId = ownerUid);

    try {
      await FirebaseFirestore.instance
          .collection('users')
          .doc(ownerUid)
          .collection('trusted_contacts')
          .doc(user.uid)
          .update({
        'approvedRelease': false,
        'rejectedAt': FieldValue.serverTimestamp(),
      });

      _loadPendingApprovals();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Rejection failed: $e')),
      );
    } finally {
      setState(() => _approvingId = null);
    }
  }

  void _sendProofOfLife() async {
    await _updateLastActive();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Row(
            children: [
              Icon(Icons.check_circle, color: AppTheme.successGreen, size: 20),
              SizedBox(width: 12),
              Text('Proof of life signal sent successfully.'),
            ],
          ),
        ),
      );
    }
  }

  // ── SSS RECONSTRUCTION SCREEN / DIALOG ──────────────────────────────────────
  void _showSSSRecoveryDialog(Map<String, dynamic> vault) async {
    final ownerUid = vault['ownerUid'] as String;
    final ownerEmail = vault['ownerEmail'] as String;
    final threshold = vault['sssThreshold'] as int;

    // Controllers for other heirs' shares
    final controllers = List<TextEditingController>.generate(threshold - 1, (_) => TextEditingController());

    String myDecryptedShare = '';
    String? localError;
    bool loadingMyShare = true;

    // Load and decrypt our own share
    final user = _authService.currentUser;
    if (user != null) {
      try {
        final contactData = vault['myContactData'] as Map<String, dynamic>?;
        final encryptedShare = contactData?['encryptedKeyShare'] as String?;

        if (encryptedShare != null) {
          final cachedPwd = await _authService.getCachedPassword();
          final userDoc = await FirebaseFirestore.instance.collection('users').doc(user.uid).get();
          final encryptedPrivateKey = userDoc.data()?['encryptedPrivateKey'] as String?;

          if (cachedPwd != null && encryptedPrivateKey != null) {
            // Decrypt private key
            final encService = EncryptionService.fromPassword(cachedPwd);
            final privKeyPEM = encService.decrypt(encryptedPrivateKey);

            // Decrypt share
            myDecryptedShare = KeypairService.decryptAsymmetric(privKeyPEM, encryptedShare);
          }
        }
      } catch (e) {
        localError = 'Kendi anahtar payınız çözülemedi: $e';
      }
    }

    loadingMyShare = false;

    showDialog(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: Row(
                children: [
                  const Icon(Icons.share_rounded, color: AppTheme.warningAmber),
                  const SizedBox(width: 12),
                  const Text('Miras Anahtarı Birleştir (SSS)'),
                ],
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Bu kasa Shamir\'s Secret Sharing ile korunmaktadır. Kasayı açmak için en az $threshold mirasçının payı birleştirilmelidir.',
                      style: const TextStyle(color: AppTheme.textMuted, fontSize: 12, height: 1.4),
                    ),
                    const SizedBox(height: 14),

                    // Heir's own share (auto-decrypted)
                    const Text('SİZİN ANAHTAR PAYINIZ (Otomatik Yüklendi)', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.textMuted)),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.all(10),
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: AppTheme.successGreen.withOpacity(0.05),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppTheme.successGreen.withOpacity(0.2)),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            myDecryptedShare.isNotEmpty ? Icons.verified_user_rounded : Icons.warning_amber_rounded,
                            color: myDecryptedShare.isNotEmpty ? AppTheme.successGreen : AppTheme.dangerRose,
                            size: 16,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              myDecryptedShare.isNotEmpty
                                  ? 'RSA Payı Çözüldü ✓ (${myDecryptedShare.substring(0, math.min(10, myDecryptedShare.length))}...)'
                                  : (localError ?? 'RSA Anahtarı veya Şifreli Pay Bulunamadı.'),
                              style: TextStyle(
                                color: myDecryptedShare.isNotEmpty ? AppTheme.successGreen : AppTheme.dangerRose,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Inputs for other shares
                    Text('DİĞER MİRASÇILARDAN GELEN PAYLAR (${threshold - 1} Adet Gerekli)', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.textMuted)),
                    const SizedBox(height: 6),
                    ...List.generate(threshold - 1, (idx) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        key: ValueKey(idx),
                        child: TextField(
                          controller: controllers[idx],
                          style: const TextStyle(color: Colors.white, fontSize: 12, fontFamily: 'monospace'),
                          decoration: InputDecoration(
                            labelText: '${idx + 2}. Mirasçı Payı (Base64)',
                            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                          ),
                        ),
                      );
                    }),

                    if (localError != null) ...[
                      const SizedBox(height: 10),
                      Text(localError!, style: const TextStyle(color: AppTheme.dangerRose, fontSize: 11)),
                    ],
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('CANCEL'),
                ),
                ElevatedButton.icon(
                  onPressed: myDecryptedShare.isEmpty
                      ? null
                      : () {
                          // Collect all shares
                          final shares = [myDecryptedShare];
                          for (final ctrl in controllers) {
                            final val = ctrl.text.trim();
                            if (val.isNotEmpty) shares.add(val);
                          }

                          if (shares.length < threshold) {
                            setDialogState(() {
                              localError = 'Lütfen tüm eksik payları doldurun.';
                            });
                            return;
                          }

                          try {
                            // Combine
                            final combinedMasterPassword = ShamirService.combineShares(shares);
                            Navigator.pop(ctx); // Close SSS recovery

                            // Navigate to Vault Screen with master password
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => VaultScreen(
                                  ownerUid: ownerUid,
                                  ownerEmail: ownerEmail,
                                ),
                              ),
                            );

                            // Auto-fill master password controller (using a brief delay)
                            Future.delayed(const Duration(milliseconds: 300), () {
                              // Send combined master key
                            });
                          } catch (e) {
                            setDialogState(() {
                              localError = 'Birleştirme başarısız: Mirasçı payları uyumsuz veya hatalı.';
                            });
                          }
                        },
                  icon: const Icon(Icons.vpn_key_rounded, size: 18),
                  label: const Text('BİRLEŞTİR & KİLİDİ AÇ'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.warningAmber,
                    foregroundColor: Colors.black,
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = _authService.currentUser;
    final screenWidth = MediaQuery.of(context).size.width;
    final isWide = screenWidth > 700;

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [AppTheme.bgDeep, Color(0xFF0F1623)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: CustomScrollView(
            slivers: [
              // ── App Bar ──
              SliverAppBar(
                floating: true,
                backgroundColor: AppTheme.bgDeep.withOpacity(0.9),
                title: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        gradient: AppTheme.primaryGradient,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.shield_rounded, size: 20, color: Colors.white),
                    ),
                    const SizedBox(width: 12),
                    const Text('Legacy Vault'),
                  ],
                ),
                actions: [
                  // Bell Notification Badge
                  if (_pendingApprovals.isNotEmpty)
                    IconButton(
                      icon: Stack(
                        children: [
                          const Icon(Icons.notifications_rounded, color: AppTheme.dangerRose),
                          Positioned(
                            right: 0,
                            top: 0,
                            child: Container(
                              padding: const EdgeInsets.all(2),
                              decoration: const BoxDecoration(color: AppTheme.dangerRose, shape: BoxShape.circle),
                              constraints: const BoxConstraints(minWidth: 12, minHeight: 12),
                              child: Text(
                                '${_pendingApprovals.length}',
                                style: const TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ),
                        ],
                      ),
                      onPressed: () {},
                    ),
                  IconButton(
                    icon: const Icon(Icons.settings_outlined),
                    onPressed: () {
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen()));
                    },
                  ),
                  IconButton(
                    icon: const Icon(Icons.logout_rounded),
                    onPressed: () => _authService.signOut(),
                  ),
                  const SizedBox(width: 8),
                ],
              ),

              // ── Content ──
              SliverPadding(
                padding: EdgeInsets.symmetric(
                  horizontal: isWide ? (screenWidth - 600) / 2 : 20,
                  vertical: 16,
                ),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    // ── Co-Signer Panel ──
                    if (_pendingApprovals.isNotEmpty) ...[
                      _buildPendingApprovalsList(),
                      const SizedBox(height: 28),
                    ],

                    // ── Inherited Vaults Panel ──
                    if (_inheritedVaults.isNotEmpty) ...[
                      _buildInheritedVaultsList(),
                      const SizedBox(height: 28),
                    ],

                    // ── Status Card ──
                    _buildStatusCard(user?.uid),
                    const SizedBox(height: 28),

                    // ── Section Title ──
                    Row(
                      children: [
                        Container(
                          width: 4,
                          height: 20,
                          decoration: BoxDecoration(
                            color: AppTheme.primaryPurple,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                        const SizedBox(width: 10),
                        const Text(
                          'VAULT MODULES',
                          style: TextStyle(
                            color: AppTheme.textMuted,
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                            letterSpacing: 2,
                          ),
                        ),
                      ],
                    ).animate().fadeIn(delay: 300.ms),
                    const SizedBox(height: 16),

                    // ── Module Cards ──
                    _buildModuleCard(
                      title: 'Digital Vault',
                      subtitle: 'Encrypted passwords, crypto seeds & sensitive notes',
                      icon: Icons.lock_outline_rounded,
                      gradient: AppTheme.primaryGradient,
                      delay: 400,
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const VaultScreen())),
                    ),
                    const SizedBox(height: 14),
                    _buildModuleCard(
                      title: 'Video Messages',
                      subtitle: 'Time-locked farewell messages for loved ones',
                      icon: Icons.videocam_outlined,
                      gradient: AppTheme.tealGradient,
                      delay: 500,
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const VideoMessagesScreen())),
                    ),
                    const SizedBox(height: 14),
                    _buildModuleCard(
                      title: 'Trusted Contacts',
                      subtitle: 'Manage heirs & beneficiaries who inherit your vault',
                      icon: Icons.people_outline_rounded,
                      gradient: AppTheme.dangerGradient,
                      delay: 600,
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ContactsScreen())),
                    ),
                    const SizedBox(height: 32),

                    // ── Stats ──
                    _buildStatsRow(user?.uid),
                    const SizedBox(height: 40),
                  ]),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPendingApprovalsList() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(Icons.warning_rounded, color: AppTheme.dangerRose, size: 18),
            SizedBox(width: 8),
            Text(
              'ACİL — KASA AÇMA ONAYI BEKLENİYOR',
              style: TextStyle(color: AppTheme.dangerRose, fontWeight: FontWeight.bold, fontSize: 12, letterSpacing: 0.5),
            ),
          ],
        ),
        const SizedBox(height: 12),
        ..._pendingApprovals.map((approval) {
          final progress = approval['approvedCount'] / approval['requiredCount'];
          final progressPct = (progress * 100).round();

          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppTheme.dangerRose.withOpacity(0.04),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.dangerRose.withOpacity(0.2)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      approval['ownerName'].toString().isNotEmpty ? approval['ownerName'] : approval['ownerEmail'],
                      style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 14),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: approval['alreadyApproved'] ? AppTheme.successGreen.withOpacity(0.12) : AppTheme.dangerRose.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        approval['alreadyApproved'] ? 'Onaylandı' : 'Onay Bekleniyor',
                        style: TextStyle(
                          color: approval['alreadyApproved'] ? AppTheme.successGreen : AppTheme.dangerRose,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Bu kişinin Ölü Adam Anahtarı tetiklendi. Kasanın açılabilmesi için ${approval['requiredCount']} co-signer onayından ${approval['approvedCount']} tanesi verildi.',
                  style: const TextStyle(color: AppTheme.textMuted, fontSize: 12, height: 1.4),
                ),
                const SizedBox(height: 12),
                LinearProgressIndicator(
                  value: progress,
                  backgroundColor: Colors.black26,
                  color: progressPct >= 100 ? AppTheme.successGreen : AppTheme.warningAmber,
                ),
                const SizedBox(height: 14),
                if (!approval['alreadyApproved'])
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: _approvingId != null ? null : () => _approveRelease(approval['ownerUid']),
                          icon: const Icon(Icons.thumb_up_rounded, size: 14),
                          label: const Text('Kasayı Açmayı Onayla', style: TextStyle(fontSize: 12)),
                          style: ElevatedButton.styleFrom(backgroundColor: AppTheme.successGreen, foregroundColor: Colors.black),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton.icon(
                        onPressed: _approvingId != null ? null : () => _rejectRelease(approval['ownerUid']),
                        icon: const Icon(Icons.thumb_down_rounded, size: 14),
                        label: const Text('Reddet', style: TextStyle(fontSize: 12)),
                        style: OutlinedButton.styleFrom(foregroundColor: AppTheme.dangerRose, side: const BorderSide(color: AppTheme.dangerRose)),
                      ),
                    ],
                  )
                else
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(color: AppTheme.successGreen.withOpacity(0.06), borderRadius: BorderRadius.circular(8)),
                    child: const Row(
                      children: [
                        Icon(Icons.check_circle_rounded, color: AppTheme.successGreen, size: 14),
                        SizedBox(width: 8),
                        Text('Onayınız başarıyla kaydedildi.', style: TextStyle(color: AppTheme.successGreen, fontSize: 12, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _buildInheritedVaultsList() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(Icons.vpn_key_rounded, color: AppTheme.warningAmber, size: 18),
            SizedBox(width: 8),
            Text(
              'MİRAS KALAN KASALAR / INHERITED VAULTS',
              style: TextStyle(color: AppTheme.warningAmber, fontWeight: FontWeight.bold, fontSize: 12, letterSpacing: 0.5),
            ),
          ],
        ),
        const SizedBox(height: 12),
        ..._inheritedVaults.map((vault) {
          final isSSS = vault['sssProtected'] == true;

          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppTheme.warningAmber.withOpacity(0.04),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.warningAmber.withOpacity(0.2)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      vault['ownerName'].toString().isNotEmpty ? vault['ownerName'] : vault['ownerEmail'],
                      style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 14),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: isSSS ? AppTheme.primaryPurple.withOpacity(0.12) : AppTheme.successGreen.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        isSSS ? 'SSS KORUMALI' : 'AÇIK KASA',
                        style: TextStyle(
                          color: isSSS ? AppTheme.primaryPurple : AppTheme.successGreen,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                const Text(
                  'Bu kasanın sahibi hayatını kaybetti ve miras haklarınız doğrulandı. Kasanın şifresini çözerek dijital varlıkları devralabilirsiniz.',
                  style: TextStyle(color: AppTheme.textMuted, fontSize: 12, height: 1.4),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 44,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      if (isSSS) {
                        _showSSSRecoveryDialog(vault);
                      } else {
                        // Standard unlocked vault screen
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => VaultScreen(
                              ownerUid: vault['ownerUid'],
                              ownerEmail: vault['ownerEmail'],
                            ),
                          ),
                        );
                      }
                    },
                    icon: const Icon(Icons.lock_open_rounded, size: 16),
                    label: const Text('KASAYI AÇ & VERİLERİ OKU'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.warningAmber,
                      foregroundColor: Colors.black,
                    ),
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _buildStatusCard(String? uid) {
    return StreamBuilder<DocumentSnapshot>(
      stream: uid != null
          ? FirebaseFirestore.instance.collection('users').doc(uid).snapshots()
          : const Stream.empty(),
      builder: (context, snapshot) {
        String lastActiveText = 'Signal sent just now';
        bool switchTriggered = false;

        if (snapshot.hasData && snapshot.data!.exists) {
          final data = snapshot.data!.data() as Map<String, dynamic>?;
          if (data != null) {
            switchTriggered = data['switchTriggered'] == true;
            final lastActive = data['lastActive'] as Timestamp?;
            if (lastActive != null) {
              final dt = lastActive.toDate();
              final diff = DateTime.now().difference(dt);
              if (diff.inMinutes < 1) {
                lastActiveText = 'Signal sent just now';
              } else if (diff.inHours < 1) {
                lastActiveText = 'Last signal: ${diff.inMinutes} min ago';
              } else if (diff.inDays < 1) {
                lastActiveText = 'Last signal: ${diff.inHours} hours ago';
              } else {
                lastActiveText = 'Last signal: ${DateFormat('MMM d, HH:mm').format(dt)}';
              }
            }
          }
        }

        return Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            gradient: const LinearGradient(
              colors: [Color(0xFF141B2D), Color(0xFF1A2332)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            border: Border.all(color: AppTheme.borderSubtle.withOpacity(0.4)),
            boxShadow: [
              BoxShadow(
                color: (switchTriggered ? AppTheme.dangerRose : AppTheme.successGreen).withOpacity(0.08),
                blurRadius: 30,
                spreadRadius: 2,
              ),
            ],
          ),
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: (switchTriggered ? AppTheme.dangerRose : AppTheme.successGreen).withOpacity(0.1),
                  border: Border.all(
                    color: (switchTriggered ? AppTheme.dangerRose : AppTheme.successGreen).withOpacity(0.3),
                    width: 2,
                  ),
                ),
                child: Icon(
                  switchTriggered ? Icons.warning_rounded : Icons.favorite_rounded,
                  color: switchTriggered ? AppTheme.dangerRose : AppTheme.successGreen,
                  size: 36,
                ),
              )
                  .animate(onPlay: (c) => c.repeat(reverse: true))
                  .scaleXY(begin: 1.0, end: 1.08, duration: 1500.ms, curve: Curves.easeInOut),
              const SizedBox(height: 16),
              Text(
                switchTriggered ? 'SWITCH TRIGGERED' : 'STATUS: ALIVE',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: switchTriggered ? AppTheme.dangerRose : AppTheme.successGreen,
                  letterSpacing: 2.5,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                lastActiveText,
                style: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton.icon(
                  onPressed: _sendProofOfLife,
                  icon: const Icon(Icons.satellite_alt_rounded, size: 18),
                  label: const Text('SEND PROOF OF LIFE'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.successGreen.withOpacity(0.15),
                    foregroundColor: AppTheme.successGreen,
                    side: BorderSide(color: AppTheme.successGreen.withOpacity(0.3)),
                  ),
                ),
              ),
            ],
          ),
        ).animate().fadeIn(duration: 600.ms).slideY(begin: 0.1);
      },
    );
  }

  Widget _buildModuleCard({
    required String title,
    required String subtitle,
    required IconData icon,
    required LinearGradient gradient,
    required int delay,
    required VoidCallback onTap,
  }) {
    return Container(
      decoration: AppTheme.glassDecoration(borderRadius: 20),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    gradient: gradient,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: gradient.colors.first.withOpacity(0.3),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Icon(icon, size: 26, color: Colors.white),
                ),
                const SizedBox(width: 18),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: const TextStyle(
                          color: AppTheme.textMuted,
                          fontSize: 12,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.arrow_forward_ios_rounded, color: AppTheme.textMuted, size: 14),
                ),
              ],
            ),
          ),
        ),
      ),
    ).animate().fadeIn(delay: Duration(milliseconds: delay), duration: 500.ms).slideX(begin: 0.05);
  }

  Widget _buildStatsRow(String? uid) {
    if (uid == null) return const SizedBox.shrink();

    return Row(
      children: [
        Expanded(child: _buildStatItem('Vault Items', 'vault_items', uid, Icons.vpn_key_rounded, AppTheme.primaryPurple)),
        const SizedBox(width: 12),
        Expanded(child: _buildStatItem('Contacts', 'trusted_contacts', uid, Icons.people_rounded, AppTheme.dangerRose)),
        const SizedBox(width: 12),
        Expanded(child: _buildStatItem('Videos', 'video_messages', uid, Icons.videocam_rounded, AppTheme.accentTeal)),
      ],
    ).animate().fadeIn(delay: 700.ms, duration: 500.ms);
  }

  Widget _buildStatItem(String label, String collection, String uid, IconData icon, Color color) {
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance.collection('users').doc(uid).collection(collection).snapshots(),
      builder: (context, snapshot) {
        final count = snapshot.hasData ? snapshot.data!.docs.length : 0;

        return Container(
          padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 12),
          decoration: AppTheme.glassDecoration(borderRadius: 16),
          child: Column(
            children: [
              Icon(icon, color: color, size: 22),
              const SizedBox(height: 8),
              Text(
                '$count',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: color,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: const TextStyle(color: AppTheme.textMuted, fontSize: 11),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        );
      },
    );
  }
}
