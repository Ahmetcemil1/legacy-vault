import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:legacy_vault/core/services/auth_service.dart';
import 'package:legacy_vault/core/services/encryption_service.dart';
import 'package:legacy_vault/core/services/keypair_service.dart';
import 'package:legacy_vault/core/services/shamir_service.dart';
import 'package:legacy_vault/core/services/translation_service.dart';
import 'package:legacy_vault/core/theme/app_theme.dart';
import 'dart:math' as math;
import 'package:intl/intl.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _authService = AuthService();
  double _thresholdDays = 30;
  bool _switchEnabled = true;
  bool _isLoading = true;

  // Parity states
  String? _userCode;
  String? _publicKey;
  bool _sssProtected = false;
  int _sssThreshold = 2;
  int _sssTotalShares = 0;
  DateTime? _sssDistributedAt;

  List<Map<String, dynamic>> _contacts = [];
  final List<String> _selectedContactsForShare = [];
  bool _distributing = false;
  String _distributeError = '';
  bool _distributeSuccess = false;

  @override
  void initState() {
    super.initState();
    _loadSettings();
    _listenToContacts();
  }

  void _listenToContacts() {
    final user = _authService.currentUser;
    if (user == null) return;

    FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .collection('trusted_contacts')
        .snapshots()
        .listen((snap) {
      if (mounted) {
        setState(() {
          _contacts = snap.docs.map((doc) => {
            'id': doc.id,
            ...doc.data(),
          }).toList();
        });
      }
    });
  }

  void _loadSettings() async {
    final user = _authService.currentUser;
    if (user == null) return;

    try {
      final doc = await FirebaseFirestore.instance.collection('users').doc(user.uid).get();
      if (doc.exists) {
        final data = doc.data()!;
        _userCode = data['userCode'];

        // Auto-generate userCode if missing (Self-healing)
        if (_userCode == null) {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          final random = math.Random();
          String part1 = List.generate(4, (_) => chars[random.nextInt(chars.length)]).join();
          String part2 = List.generate(4, (_) => chars[random.nextInt(chars.length)]).join();
          _userCode = 'LV-$part1-$part2';
          await FirebaseFirestore.instance.collection('users').doc(user.uid).update({'userCode': _userCode});
        }

        // Auto-generate RSA Keypair if missing (Zero-Knowledge)
        _publicKey = data['publicKey'];
        final encryptedPrivateKey = data['encryptedPrivateKey'];

        if (_publicKey == null || encryptedPrivateKey == null) {
          final cachedPassword = await _authService.getCachedPassword();
          if (cachedPassword != null) {
            final pair = KeypairService.generateRSAKeyPair();
            final pubKeyB64 = KeypairService.exportPublicKey(pair.publicKey);
            final privKeyB64 = KeypairService.exportPrivateKey(pair.privateKey);

            // Encrypt private key client-side with master password
            final encService = EncryptionService.fromPassword(cachedPassword);
            final encPrivKey = encService.encrypt(privKeyB64);

            await FirebaseFirestore.instance.collection('users').doc(user.uid).update({
              'publicKey': pubKeyB64,
              'encryptedPrivateKey': encPrivKey,
            });
            _publicKey = pubKeyB64;
          }
        }

        _sssProtected = data['sssProtected'] == true;
        _sssThreshold = data['sssThreshold'] ?? 2;
        _sssTotalShares = data['sssTotalShares'] ?? 0;
        final distAt = data['sssDistributedAt'] as Timestamp?;
        _sssDistributedAt = distAt?.toDate();

        setState(() {
          _thresholdDays = (data['thresholdDays'] ?? 30).toDouble();
          _switchEnabled = data['deadMansSwitchEnabled'] ?? true;
          _isLoading = false;
        });
      } else {
        setState(() => _isLoading = false);
      }
    } catch (e) {
      print("Error loading settings: $e");
      setState(() => _isLoading = false);
    }
  }

  void _saveSettings() async {
    final user = _authService.currentUser;
    if (user == null) return;

    await FirebaseFirestore.instance.collection('users').doc(user.uid).set({
      'thresholdDays': _thresholdDays.round(),
      'deadMansSwitchEnabled': _switchEnabled,
    }, SetOptions(merge: true));

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Row(
            children: [
              Icon(Icons.check_circle, color: AppTheme.successGreen, size: 20),
              SizedBox(width: 12),
              Text('Settings saved successfully.'),
            ],
          ),
        ),
      );
    }
  }

  void _distributeKeyShares() async {
    final user = _authService.currentUser;
    if (user == null) return;

    if (_selectedContactsForShare.length < 2) {
      setState(() => _distributeError = 'En az 2 yararlanıcı seçmelisiniz.');
      return;
    }
    if (_sssThreshold < 2 || _sssThreshold > _selectedContactsForShare.length) {
      setState(() => _distributeError = 'Eşik değeri 2 ile ${_selectedContactsForShare.length} arasında olmalıdır.');
      return;
    }

    final cachedPassword = await _authService.getCachedPassword();
    if (cachedPassword == null) {
      setState(() => _distributeError = 'Master password bulunamadı. Lütfen yeniden giriş yapın.');
      return;
    }

    setState(() {
      _distributing = true;
      _distributeError = '';
      _distributeSuccess = false;
    });

    try {
      // 1. Split master password into N shares
      final shares = ShamirService.splitSecret(cachedPassword, _sssThreshold, _selectedContactsForShare.length);

      final selectedContactObjects = _contacts.where((c) => _selectedContactsForShare.contains(c['id'])).toList();

      // 2. Encrypt each share and save in contacts subcollection
      for (int i = 0; i < selectedContactObjects.length; i++) {
        final contact = selectedContactObjects[i];
        final share = shares[i];
        final contactPubKey = contact['publicKey'] as String?;

        if (contactPubKey == null) {
          throw Exception('${contact['name']} kullanıcısının RSA anahtarı yok. Dağıtım yapılamaz.');
        }

        // Encrypt asymmetrically
        final encShare = KeypairService.encryptAsymmetric(contactPubKey, share);

        await FirebaseFirestore.instance
            .collection('users')
            .doc(user.uid)
            .collection('trusted_contacts')
            .doc(contact['id'])
            .update({
          'encryptedKeyShare': encShare,
          'shareIndex': i + 1,
          'totalShares': _selectedContactsForShare.length,
          'shareThreshold': _sssThreshold,
          'shareDistributedAt': FieldValue.serverTimestamp(),
        });
      }

      // 3. Mark owner profile as SSS Protected
      await FirebaseFirestore.instance.collection('users').doc(user.uid).update({
        'sssProtected': true,
        'sssThreshold': _sssThreshold,
        'sssTotalShares': _selectedContactsForShare.length,
        'sssDistributedAt': FieldValue.serverTimestamp(),
      });

      setState(() {
        _sssProtected = true;
        _sssTotalShares = _selectedContactsForShare.length;
        _sssDistributedAt = DateTime.now();
        _distributeSuccess = true;
        _distributing = false;
        _selectedContactsForShare.clear();
      });
    } catch (e) {
      setState(() {
        _distributeError = 'Hata oluştu: ${e.toString()}';
        _distributing = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = _authService.currentUser;
    final screenWidth = MediaQuery.of(context).size.width;
    final isWide = screenWidth > 700;

    return Scaffold(
      appBar: AppBar(title: Text(TranslationService.t('settings_title'))),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [AppTheme.bgDeep, Color(0xFF0F1623)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: _isLoading
            ? const Center(child: CircularProgressIndicator(color: AppTheme.primaryPurple))
            : ListView(
                padding: EdgeInsets.symmetric(
                  horizontal: isWide ? (screenWidth - 600) / 2 : 20,
                  vertical: 20,
                ),
                children: [
                  // ── Account Info ──
                  _buildSectionTitle('ACCOUNT', Icons.person_outline_rounded),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: AppTheme.glassDecoration(borderRadius: 18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(
                                gradient: AppTheme.primaryGradient,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Center(
                                child: Text(
                                  user?.email?.substring(0, 1).toUpperCase() ?? '?',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 20,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Logged in as',
                                    style: TextStyle(color: AppTheme.textMuted, fontSize: 12),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    user?.email ?? 'Unknown',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w600,
                                      fontSize: 15,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (_userCode != null) ...[
                          const SizedBox(height: 20),
                          Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: AppTheme.warningAmber.withOpacity(0.04),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppTheme.warningAmber.withOpacity(0.18)),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'YARARLANICI DAVET KODUNUZ / INVITATION CODE',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: AppTheme.textMuted,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                const Text(
                                  'Mirasçılarınız kasanıza bu kodu girerek güvenle eklenebilir.',
                                  style: TextStyle(fontSize: 11, color: AppTheme.textMuted),
                                ),
                                const SizedBox(height: 10),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    SelectableText(
                                      _userCode!,
                                      style: const TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.w800,
                                        color: AppTheme.warningAmber,
                                        fontFamily: 'monospace',
                                        letterSpacing: 1.0,
                                      ),
                                    ),
                                    ElevatedButton.icon(
                                      onPressed: () {
                                        Clipboard.setData(ClipboardData(text: _userCode!));
                                        ScaffoldMessenger.of(context).showSnackBar(
                                          const SnackBar(content: Text('Davet kodu kopyalandı!')),
                                        );
                                      },
                                      icon: const Icon(Icons.copy_rounded, size: 14),
                                      label: const Text('KOPYALA', style: TextStyle(fontSize: 11)),
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: AppTheme.warningAmber.withOpacity(0.1),
                                        foregroundColor: AppTheme.warningAmber,
                                        side: BorderSide(color: AppTheme.warningAmber.withOpacity(0.3)),
                                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ).animate().fadeIn(duration: 400.ms),

                  const SizedBox(height: 28),

                  // ── Dead Man's Switch ──
                  _buildSectionTitle("DEAD MAN'S SWITCH", Icons.timer_outlined),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: AppTheme.glassDecoration(borderRadius: 18),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Enable Switch',
                                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 15),
                                ),
                                SizedBox(height: 4),
                                Text(
                                  'Auto-notify contacts when inactive',
                                  style: TextStyle(color: AppTheme.textMuted, fontSize: 12),
                                ),
                              ],
                            ),
                            Switch(
                              value: _switchEnabled,
                              onChanged: (v) => setState(() => _switchEnabled = v),
                              activeColor: AppTheme.successGreen,
                              inactiveTrackColor: AppTheme.bgDeep,
                            ),
                          ],
                        ),
                        if (_switchEnabled) ...[
                          const SizedBox(height: 20),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                'Inactivity Threshold',
                                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 14),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                decoration: BoxDecoration(
                                  color: AppTheme.warningAmber.withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: AppTheme.warningAmber.withOpacity(0.3)),
                                ),
                                child: Text(
                                  '${_thresholdDays.round()} days',
                                  style: const TextStyle(
                                    color: AppTheme.warningAmber,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 14,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          SliderTheme(
                            data: SliderTheme.of(context).copyWith(
                              activeTrackColor: AppTheme.warningAmber,
                              inactiveTrackColor: AppTheme.borderSubtle,
                              thumbColor: AppTheme.warningAmber,
                              overlayColor: AppTheme.warningAmber.withOpacity(0.2),
                            ),
                            child: Slider(
                              value: _thresholdDays,
                              min: 7,
                              max: 365,
                              divisions: 358,
                              onChanged: (v) => setState(() => _thresholdDays = v),
                            ),
                          ),
                          const Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('7 days', style: TextStyle(color: AppTheme.textMuted, fontSize: 11)),
                              Text('365 days', style: TextStyle(color: AppTheme.textMuted, fontSize: 11)),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ).animate().fadeIn(delay: 200.ms, duration: 400.ms),

                  const SizedBox(height: 28),

                  // ── SSS section ──
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _buildSectionTitle('GİZLİ ANAHTAR DAĞITIMI', Icons.share_rounded),
                      if (_sssProtected)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppTheme.successGreen.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: AppTheme.successGreen.withOpacity(0.3)),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.lock_rounded, size: 10, color: AppTheme.successGreen),
                              SizedBox(width: 4),
                              Text('SSS AKTİF', style: TextStyle(color: AppTheme.successGreen, fontSize: 9, fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: AppTheme.glassDecoration(borderRadius: 18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Master şifreniz matematiksel parçalara bölünür ve her mirasçıya kendi RSA public key\'iyle şifrelenerek teslim edilir. Kasanızı açmak için eşik kadar mirasçı bir araya gelmelidir.',
                          style: TextStyle(color: AppTheme.textMuted, fontSize: 12, height: 1.4),
                        ),
                        if (_sssProtected && _sssDistributedAt != null) ...[
                          const SizedBox(height: 14),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AppTheme.successGreen.withOpacity(0.04),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: AppTheme.successGreen.withOpacity(0.15)),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.verified_rounded, color: AppTheme.successGreen, size: 16),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    'Anahtar payları $_sssTotalShares kişiye dağıtıldı (Eşik: $_sssThreshold). Son: ${DateFormat('dd.MM.yyyy').format(_sssDistributedAt!)}',
                                    style: const TextStyle(color: AppTheme.successGreen, fontSize: 11, fontWeight: FontWeight.w600),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                        const SizedBox(height: 20),

                        // Contact selectors
                        if (_contacts.isEmpty)
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AppTheme.warningAmber.withOpacity(0.05),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: AppTheme.warningAmber.withOpacity(0.2)),
                            ),
                            child: const Text(
                              'Henüz mirasçı eklemediniz. Lütfen önce Beneficiaries ekranından ekleyin.',
                              style: TextStyle(color: AppTheme.warningAmber, fontSize: 12),
                            ),
                          )
                        else ...[
                          const Text(
                            'ANAHTAR PAYLAŞILACAK KİŞİLER',
                            style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppTheme.textMuted, letterSpacing: 0.5),
                          ),
                          const SizedBox(height: 8),
                          Container(
                            constraints: const BoxConstraints(maxHeight: 180),
                            decoration: BoxDecoration(
                              color: Colors.black26,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppTheme.borderSubtle.withOpacity(0.5)),
                            ),
                            child: ListView.builder(
                              shrinkWrap: true,
                              itemCount: _contacts.length,
                              itemBuilder: (context, idx) {
                                final contact = _contacts[idx];
                                final hasKey = contact['publicKey'] != null;
                                final isPending = contact['status'] == 'pending';
                                final isSelected = _selectedContactsForShare.contains(contact['id']);

                                return CheckboxListTile(
                                  value: isSelected,
                                  onChanged: (!hasKey || isPending)
                                      ? null
                                      : (val) {
                                          setState(() {
                                            if (val == true) {
                                              _selectedContactsForShare.add(contact['id']);
                                            } else {
                                              _selectedContactsForShare.remove(contact['id']);
                                            }
                                            _sssThreshold = math.max(2, math.min(2, _selectedContactsForShare.length));
                                          });
                                        },
                                  activeColor: AppTheme.warningAmber,
                                  title: Text(
                                    contact['name'] ?? 'Bekleyen Mirasçı',
                                    style: TextStyle(
                                      color: (!hasKey || isPending) ? AppTheme.textMuted : Colors.white,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  subtitle: Text(
                                    contact['email'] ?? '',
                                    style: const TextStyle(color: AppTheme.textMuted, fontSize: 11),
                                  ),
                                  secondary: isPending
                                      ? const Text('PENDING', style: TextStyle(color: Colors.orange, fontSize: 9, fontWeight: FontWeight.bold))
                                      : !hasKey
                                          ? const Text('NO KEY', style: TextStyle(color: AppTheme.textMuted, fontSize: 9, fontWeight: FontWeight.bold))
                                          : const Text('RSA ✓', style: TextStyle(color: AppTheme.successGreen, fontSize: 9, fontWeight: FontWeight.bold)),
                                );
                              },
                            ),
                          ),
                          
                          // Threshold selector
                          if (_selectedContactsForShare.length >= 2) ...[
                            const SizedBox(height: 20),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text(
                                  'Minimum Eşik Onayı',
                                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: AppTheme.warningAmber.withOpacity(0.12),
                                    borderRadius: BorderRadius.circular(6),
                                    border: Border.all(color: AppTheme.warningAmber.withOpacity(0.3)),
                                  ),
                                  child: Text(
                                    '$_sssThreshold / ${_selectedContactsForShare.length} kişi',
                                    style: const TextStyle(color: AppTheme.warningAmber, fontSize: 11, fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            SliderTheme(
                              data: SliderTheme.of(context).copyWith(
                                activeTrackColor: AppTheme.warningAmber,
                                inactiveTrackColor: AppTheme.borderSubtle,
                                thumbColor: AppTheme.warningAmber,
                              ),
                              child: Slider(
                                value: _sssThreshold.toDouble(),
                                min: 2,
                                max: _selectedContactsForShare.length.toDouble(),
                                divisions: _selectedContactsForShare.length - 1,
                                onChanged: (val) {
                                  setState(() {
                                    _sssThreshold = val.round();
                                  });
                                },
                              ),
                            ),
                            Text(
                              'Kasanızı açmak için en az $_sssThreshold mirasçının anahtarı gerekecek.',
                              style: const TextStyle(color: AppTheme.textMuted, fontSize: 11),
                            ),
                          ],

                          if (_distributeError.isNotEmpty) ...[
                            const SizedBox(height: 14),
                            Text(_distributeError, style: const TextStyle(color: AppTheme.dangerRose, fontSize: 12)),
                          ],
                          if (_distributeSuccess) ...[
                            const SizedBox(height: 14),
                            const Text('Anahtar parçaları başarıyla şifrelendi ve dağıtıldı!', style: TextStyle(color: AppTheme.successGreen, fontSize: 12, fontWeight: FontWeight.bold)),
                          ],

                          const SizedBox(height: 20),
                          SizedBox(
                            width: double.infinity,
                            height: 48,
                            child: ElevatedButton.icon(
                              onPressed: (_distributing || _selectedContactsForShare.length < 2)
                                  ? null
                                  : _distributeKeyShares,
                              icon: _distributing
                                  ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                  : const Icon(Icons.share_rounded, size: 16),
                              label: Text(_distributing ? 'DAĞITILIYOR...' : 'ANAHTARLARI ŞİFRELİ DAĞIT'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.warningAmber,
                                foregroundColor: Colors.black,
                                disabledBackgroundColor: AppTheme.warningAmber.withOpacity(0.3),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ).animate().fadeIn(delay: 300.ms, duration: 400.ms),

                  const SizedBox(height: 28),

                  // ── Security Info ──
                  _buildSectionTitle('SECURITY', Icons.verified_user_outlined),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: AppTheme.glassDecoration(borderRadius: 18),
                    child: const Column(
                      children: [
                        _SecurityInfoRow(
                          icon: Icons.enhanced_encryption_rounded,
                          title: 'Encryption',
                          value: 'AES-256-CBC',
                          color: AppTheme.successGreen,
                        ),
                        SizedBox(height: 14),
                        _SecurityInfoRow(
                          icon: Icons.key_rounded,
                          title: 'Key Derivation',
                          value: 'SHA-256 (PBKDF)',
                          color: AppTheme.accentTeal,
                        ),
                        SizedBox(height: 14),
                        _SecurityInfoRow(
                          icon: Icons.security_rounded,
                          title: 'Asymmetric Sharing',
                          value: 'RSA-OAEP 2048',
                          color: AppTheme.warningAmber,
                        ),
                        SizedBox(height: 14),
                        _SecurityInfoRow(
                          icon: Icons.lock_outline_rounded,
                          title: 'Key Isolation',
                          value: 'Zero-Knowledge',
                          color: AppTheme.primaryPurple,
                        ),
                      ],
                    ),
                  ).animate().fadeIn(delay: 400.ms, duration: 400.ms),

                  const SizedBox(height: 28),

                  // ── Save Button ──
                  SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: ElevatedButton.icon(
                      onPressed: _saveSettings,
                      icon: const Icon(Icons.save_rounded, size: 20),
                      label: const Text('SAVE SETTINGS'),
                    ),
                  ).animate().fadeIn(delay: 500.ms),

                  const SizedBox(height: 16),

                  // ── Logout ──
                  SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: OutlinedButton.icon(
                      onPressed: () {
                        _authService.signOut();
                        Navigator.popUntil(context, (route) => route.isFirst);
                      },
                      icon: const Icon(Icons.logout_rounded, size: 20),
                      label: const Text('SIGN OUT'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppTheme.dangerRose,
                        side: const BorderSide(color: AppTheme.dangerRose),
                      ),
                    ),
                  ).animate().fadeIn(delay: 600.ms),

                  const SizedBox(height: 40),
                ],
              ),
      ),
    );
  }

  Widget _buildSectionTitle(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 16, color: AppTheme.textMuted),
        const SizedBox(width: 8),
        Text(
          title,
          style: const TextStyle(
            color: AppTheme.textMuted,
            fontWeight: FontWeight.w700,
            fontSize: 12,
            letterSpacing: 2,
          ),
        ),
      ],
    );
  }
}

class _SecurityInfoRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;
  final Color color;

  const _SecurityInfoRow({
    required this.icon,
    required this.title,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 20, color: color),
        const SizedBox(width: 14),
        Expanded(
          child: Text(
            title,
            style: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: color.withOpacity(0.1),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            value,
            style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}
