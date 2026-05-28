import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:legacy_vault/core/services/auth_service.dart';
import 'package:legacy_vault/core/services/encryption_service.dart';
import 'package:legacy_vault/core/services/translation_service.dart';
import 'package:legacy_vault/core/theme/app_theme.dart';

class VaultScreen extends StatefulWidget {
  final String? ownerUid;
  final String? ownerEmail;
  const VaultScreen({super.key, this.ownerUid, this.ownerEmail});

  @override
  State<VaultScreen> createState() => _VaultScreenState();
}

class _VaultScreenState extends State<VaultScreen> {
  final _authService = AuthService();
  final _masterPasswordController = TextEditingController();
  final _titleController = TextEditingController();
  final _contentController = TextEditingController();

  EncryptionService? _encryptionService;
  bool _isUnlocked = false;
  bool _isUnlocking = false;
  bool _obscureMaster = true;

  // List of selected contact emails for granular secret access
  final List<String> _selectedBeneficiaries = [];
  List<Map<String, dynamic>> _contacts = [];

  @override
  void initState() {
    super.initState();
    _loadContacts();
    _checkCachedPassword();
  }

  @override
  void dispose() {
    _masterPasswordController.dispose();
    _titleController.dispose();
    _contentController.dispose();
    super.dispose();
  }

  // Pre-load securely cached password if viewing own vault
  void _checkCachedPassword() async {
    if (widget.ownerUid != null) return; // For inherited vaults, wait for manual or combined password entry
    final pwd = await _authService.getCachedPassword();
    if (pwd != null) {
      _masterPasswordController.text = pwd;
      _unlockVault();
    }
  }

  void _loadContacts() async {
    final user = _authService.currentUser;
    if (user == null) return;

    final targetUid = widget.ownerUid ?? user.uid;
    final snapshot = await FirebaseFirestore.instance
        .collection('users')
        .doc(targetUid)
        .collection('trusted_contacts')
        .get();

    setState(() {
      _contacts = snapshot.docs.map((doc) => {
        'id': doc.id,
        'name': doc.data()['name'] ?? 'Unknown',
        'email': doc.data()['email'] ?? '',
      }).toList();
    });
  }

  void _unlockVault() async {
    final password = _masterPasswordController.text.trim();
    if (password.isEmpty) {
      _showError('Please enter the vault master password.');
      return;
    }

    setState(() => _isUnlocking = true);
    await Future.delayed(const Duration(milliseconds: 600));

    try {
      final service = EncryptionService.fromPassword(password);
      setState(() {
        _encryptionService = service;
        _isUnlocked = true;
        _isUnlocking = false;
      });
    } catch (e) {
      setState(() => _isUnlocking = false);
      _showError('Failed to initialize encryption: $e');
    }
  }

  void _showError(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.error_outline, color: AppTheme.dangerRose, size: 20),
            const SizedBox(width: 12),
            Expanded(child: Text(msg)),
          ],
        ),
      ),
    );
  }

  void _addVaultItem() async {
    final title = _titleController.text.trim();
    final content = _contentController.text.trim();
    if (title.isEmpty || content.isEmpty) {
      _showError('Please fill in both title and secret content.');
      return;
    }
    if (_encryptionService == null) return;

    final user = _authService.currentUser;
    if (user == null) return;

    // Encrypt content
    final ciphertext = _encryptionService!.encrypt(content);

    await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .collection('vault_items')
        .add({
      'title': title,
      'ciphertext': ciphertext,
      'type': 'secret',
      'allowedBeneficiaries': _selectedBeneficiaries,
      'createdAt': FieldValue.serverTimestamp(),
    });

    _titleController.clear();
    _contentController.clear();
    setState(() => _selectedBeneficiaries.clear());
    if (mounted) Navigator.pop(context);
  }

  void _deleteVaultItem(String docId) async {
    final user = _authService.currentUser;
    if (user == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(TranslationService.t('delete')),
        content: const Text('This encrypted item will be permanently deleted. This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(TranslationService.t('cancel'))),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.dangerRose),
            child: Text(TranslationService.t('delete')),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .collection('vault_items')
          .doc(docId)
          .delete();
    }
  }

  void _showAddItemDialog() {
    _titleController.clear();
    _contentController.clear();
    setState(() => _selectedBeneficiaries.clear());

    showDialog(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: Row(
                children: [
                  const Icon(Icons.add_circle_outline, color: AppTheme.primaryPurple),
                  const SizedBox(width: 12),
                  Text(TranslationService.t('add_secret')),
                ],
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: _titleController,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Title',
                        hintText: 'e.g. Bitcoin Seed, Bank PIN',
                        prefixIcon: Icon(Icons.label_outline),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _contentController,
                      style: const TextStyle(color: Colors.white, fontFamily: 'monospace'),
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: 'Secret Content',
                        hintText: 'Enter sensitive data...',
                        prefixIcon: Icon(Icons.vpn_key_outlined),
                        alignLabelWithHint: true,
                      ),
                    ),
                    const SizedBox(height: 16),
                    
                    // Granular Heirs Selection
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Allowed Beneficiaries',
                        style: TextStyle(color: AppTheme.textMuted, fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                    ),
                    const SizedBox(height: 8),
                    _contacts.isEmpty
                        ? const Text(
                            'No trusted contacts added yet.',
                            style: TextStyle(color: AppTheme.textMuted, fontSize: 11, fontStyle: FontStyle.italic),
                          )
                        : Container(
                            constraints: const BoxConstraints(maxHeight: 120),
                            width: double.maxFinite,
                            decoration: BoxDecoration(
                              color: Colors.black12,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: Colors.white10),
                            ),
                            child: ListView.builder(
                              shrinkWrap: true,
                              itemCount: _contacts.length,
                              itemBuilder: (context, idx) {
                                final contact = _contacts[idx];
                                final email = contact['email'];
                                final isSelected = _selectedBeneficiaries.contains(email);
                                return CheckboxListTile(
                                  title: Text(contact['name'], style: const TextStyle(color: Colors.white, fontSize: 12)),
                                  subtitle: Text(email, style: const TextStyle(color: AppTheme.textMuted, fontSize: 10)),
                                  value: isSelected,
                                  activeColor: AppTheme.primaryPurple,
                                  dense: true,
                                  onChanged: (val) {
                                    setDialogState(() {
                                      if (val == true) {
                                        _selectedBeneficiaries.add(email);
                                      } else {
                                        _selectedBeneficiaries.remove(email);
                                      }
                                    });
                                  },
                                );
                              },
                            ),
                          ),
                    const SizedBox(height: 12),
                    const Row(
                      children: [
                        Icon(Icons.info_outline, size: 14, color: AppTheme.accentTeal),
                        SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'Data is encrypted client-side with AES-256.',
                            style: TextStyle(color: AppTheme.accentTeal, fontSize: 11),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: Text(TranslationService.t('cancel')),
                ),
                ElevatedButton.icon(
                  onPressed: _addVaultItem,
                  icon: const Icon(Icons.enhanced_encryption_rounded, size: 18),
                  label: const Text('ENCRYPT & SAVE'),
                ),
              ],
            );
          }
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_isUnlocked) {
      return _buildLockedView();
    }
    return _buildUnlockedView();
  }

  Widget _buildLockedView() {
    final screenWidth = MediaQuery.of(context).size.width;
    final isWide = screenWidth > 600;
    final isInherited = widget.ownerUid != null;

    return Scaffold(
      appBar: AppBar(title: Text(isInherited ? 'Unlock Inherited Vault' : TranslationService.t('vault_title'))),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [AppTheme.bgDeep, Color(0xFF0F1623)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: SizedBox(
              width: isWide ? 400 : double.infinity,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppTheme.warningAmber.withOpacity(0.1),
                      border: Border.all(color: AppTheme.warningAmber.withOpacity(0.3), width: 2),
                    ),
                    child: const Icon(Icons.lock_rounded, size: 56, color: AppTheme.warningAmber),
                  )
                      .animate()
                      .fadeIn(duration: 600.ms)
                      .scale(begin: const Offset(0.6, 0.6), curve: Curves.elasticOut, duration: 800.ms),
                  const SizedBox(height: 28),
                  Text(
                    isInherited ? 'Reconstructed Master Key' : 'Vault is Locked',
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Colors.white),
                  ).animate().fadeIn(delay: 200.ms),
                  const SizedBox(height: 8),
                  Text(
                    isInherited
                        ? 'Enter the reconstructed master password of ${widget.ownerEmail} to decrypt their secrets.'
                        : TranslationService.t('password_hint'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
                  ).animate().fadeIn(delay: 300.ms),
                  const SizedBox(height: 32),
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: AppTheme.glassDecoration(borderRadius: 20),
                    child: Column(
                      children: [
                        TextField(
                          controller: _masterPasswordController,
                          obscureText: _obscureMaster,
                          textInputAction: TextInputAction.done,
                          onSubmitted: (_) => _unlockVault(),
                          style: const TextStyle(color: Colors.white),
                          decoration: InputDecoration(
                            labelText: isInherited ? 'Reconstructed Password' : TranslationService.t('password_label'),
                            prefixIcon: const Icon(Icons.key_rounded),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscureMaster ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                                color: AppTheme.textMuted,
                              ),
                              onPressed: () => setState(() => _obscureMaster = !_obscureMaster),
                            ),
                          ),
                        ),
                        const SizedBox(height: 24),
                        SizedBox(
                          width: double.infinity,
                          height: 52,
                          child: ElevatedButton.icon(
                            onPressed: _isUnlocking ? null : _unlockVault,
                            icon: _isUnlocking
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                  )
                                : const Icon(Icons.lock_open_rounded, size: 20),
                            label: Text(_isUnlocking ? 'DECRYPTING...' : 'UNLOCK VAULT'),
                          ),
                        ),
                      ],
                    ),
                  ).animate().fadeIn(delay: 400.ms, duration: 600.ms).slideY(begin: 0.15),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildUnlockedView() {
    final user = _authService.currentUser;
    final screenWidth = MediaQuery.of(context).size.width;
    final isWide = screenWidth > 700;
    final isInherited = widget.ownerUid != null;
    final targetUid = widget.ownerUid ?? user?.uid;

    return Scaffold(
      appBar: AppBar(
        title: Text(isInherited ? '${widget.ownerEmail} - Vault' : TranslationService.t('vault_title')),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 12),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: AppTheme.successGreen.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.successGreen.withOpacity(0.3)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.lock_open_rounded, size: 14, color: AppTheme.successGreen),
                const SizedBox(width: 6),
                Text(isInherited ? 'Inherited' : 'Unlocked', style: const TextStyle(color: AppTheme.successGreen, fontSize: 12, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [AppTheme.bgDeep, Color(0xFF0F1623)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: StreamBuilder<QuerySnapshot>(
          stream: FirebaseFirestore.instance
              .collection('users')
              .doc(targetUid)
              .collection('vault_items')
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
                    Icon(Icons.vpn_key_off_rounded, size: 64, color: AppTheme.textMuted.withOpacity(0.3)),
                    const SizedBox(height: 16),
                    const Text(
                      'No secrets stored yet',
                      style: TextStyle(color: AppTheme.textMuted, fontSize: 16),
                    ),
                  ],
                ),
              );
            }

            // If inherited, filter secrets by permitted beneficiary list
            final docs = snapshot.data!.docs.where((doc) {
              if (!isInherited) return true;
              final data = doc.data() as Map<String, dynamic>;
              final List<dynamic> allowed = data['allowedBeneficiaries'] ?? [];
              // If allowed list is empty, treat as Admin Release (public to all beneficiaries)
              if (allowed.isEmpty) return true;
              return allowed.contains(user?.email);
            }).toList();

            if (docs.isEmpty) {
              return const Center(
                child: Padding(
                  padding: EdgeInsets.all(24.0),
                  child: Text(
                    'Owner has restricted your access permissions for these vault items.',
                    style: TextStyle(color: AppTheme.textMuted, fontSize: 14),
                    textAlign: TextAlign.center,
                  ),
                ),
              );
            }

            return ListView.builder(
              padding: EdgeInsets.symmetric(
                horizontal: isWide ? (screenWidth - 600) / 2 : 16,
                vertical: 16,
              ),
              itemCount: docs.length,
              itemBuilder: (context, index) {
                final doc = docs[index];
                final data = doc.data() as Map<String, dynamic>;
                return _buildVaultItemCard(doc.id, data, index);
              },
            );
          },
        ),
      ),
      floatingActionButton: isInherited
          ? null
          : FloatingActionButton(
              onPressed: _showAddItemDialog,
              child: const Icon(Icons.add_rounded),
            ).animate().fadeIn(delay: 300.ms).scale(begin: const Offset(0.5, 0.5), curve: Curves.elasticOut),
    );
  }

  Widget _buildVaultItemCard(String docId, Map<String, dynamic> data, int index) {
    String decryptedText;
    bool decryptionFailed = false;

    try {
      decryptedText = _encryptionService!.decrypt(data['ciphertext'] ?? '');
    } catch (e) {
      decryptedText = 'Decryption failed. Wrong master password or corrupted data.';
      decryptionFailed = true;
    }

    final List<dynamic> allowed = data['allowedBeneficiaries'] ?? [];
    final isInherited = widget.ownerUid != null;

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: AppTheme.glassDecoration(borderRadius: 18),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
          childrenPadding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          leading: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              gradient: AppTheme.primaryGradient,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.vpn_key_rounded, size: 20, color: Colors.white),
          ),
          title: Text(
            data['title'] ?? 'Untitled',
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: Colors.white),
          ),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                decryptionFailed ? 'Decryption error' : 'Tap to reveal',
                style: TextStyle(
                  color: decryptionFailed ? AppTheme.dangerRose : AppTheme.textMuted,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 4),
              Wrap(
                spacing: 4,
                children: allowed.isEmpty
                    ? [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppTheme.warningAmber.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text('Admin Release', style: TextStyle(color: AppTheme.warningAmber, fontSize: 9)),
                        )
                      ]
                    : allowed
                        .map((email) => Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppTheme.primaryPurple.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(email.toString(), style: const TextStyle(color: AppTheme.primaryPurple, fontSize: 9)),
                            ))
                        .toList(),
              ),
            ],
          ),
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppTheme.bgDeep.withOpacity(0.5),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: decryptionFailed
                      ? AppTheme.dangerRose.withOpacity(0.3)
                      : AppTheme.successGreen.withOpacity(0.2),
                ),
              ),
              child: SelectableText(
                decryptedText,
                style: TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 14,
                  color: decryptionFailed ? AppTheme.dangerRose : AppTheme.successGreen,
                  height: 1.5,
                ),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (!decryptionFailed)
                  TextButton.icon(
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: decryptedText));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Copied to clipboard')),
                      );
                    },
                    icon: const Icon(Icons.copy_rounded, size: 16),
                    label: const Text('Copy'),
                    style: TextButton.styleFrom(foregroundColor: AppTheme.accentTeal),
                  ),
                if (!isInherited)
                  TextButton.icon(
                    onPressed: () => _deleteVaultItem(docId),
                    icon: const Icon(Icons.delete_outline_rounded, size: 16),
                    label: Text(TranslationService.t('delete')),
                    style: TextButton.styleFrom(foregroundColor: AppTheme.dangerRose),
                  ),
              ],
            ),
          ],
        ),
      ),
    ).animate().fadeIn(delay: Duration(milliseconds: 100 * index), duration: 400.ms).slideX(begin: 0.05);
  }
}
