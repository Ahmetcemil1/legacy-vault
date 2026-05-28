import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:legacy_vault/core/services/auth_service.dart';
import 'package:legacy_vault/core/theme/app_theme.dart';

class ContactsScreen extends StatefulWidget {
  const ContactsScreen({super.key});

  @override
  State<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends State<ContactsScreen> {
  final _authService = AuthService();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _relationController = TextEditingController();

  // Verification states
  bool _verifying = false;
  bool _isVerified = false;
  String? _verificationError;
  Map<String, dynamic>? _verifiedUserData;
  bool _notFoundButAllowAdd = false;
  bool _isCoSigner = false;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _relationController.dispose();
    super.dispose();
  }

  void _verifyEmailOrCode(StateSetter setDialogState) async {
    final input = _emailController.text.trim();
    if (input.isEmpty) {
      setDialogState(() {
        _verificationError = 'Lütfen e-posta veya davet kodu girin.';
      });
      return;
    }

    setDialogState(() {
      _verifying = true;
      _verificationError = null;
      _isVerified = false;
      _verifiedUserData = null;
      _notFoundButAllowAdd = false;
    });

    try {
      final usersCollection = FirebaseFirestore.instance.collection('users');
      QuerySnapshot querySnap;

      if (input.toUpperCase().startsWith('LV-')) {
        querySnap = await usersCollection.where('userCode', isEqualTo: input.toUpperCase()).get();
      } else {
        querySnap = await usersCollection.where('email', isEqualTo: input.toLowerCase()).get();
      }

      if (querySnap.docs.isEmpty) {
        // User not in system yet - allow pending add
        setDialogState(() {
          _notFoundButAllowAdd = true;
          _isVerified = true;
          _verifiedUserData = {
            'uid': null,
            'email': input.toLowerCase(),
            'publicKey': null,
            'displayName': _nameController.text.trim().isNotEmpty ? _nameController.text.trim() : input,
          };
          _verifying = false;
        });
      } else {
        final doc = querySnap.docs.first;
        final uDoc = doc.data() as Map<String, dynamic>;
        final contactUid = doc.id;
        final fullName = uDoc['displayName'] ?? '${uDoc['firstName'] ?? ''} ${uDoc['lastName'] ?? ''}'.trim();
        final actualName = fullName.isNotEmpty ? fullName : 'Kayıtlı Kullanıcı';

        setDialogState(() {
          _verifiedUserData = {
            'uid': contactUid,
            'email': uDoc['email'],
            'publicKey': uDoc['publicKey'],
            'displayName': actualName,
          };
          _nameController.text = actualName;
          _emailController.text = uDoc['email'].toString().toLowerCase();
          _isVerified = true;
          _verifying = false;
        });
      }
    } catch (e) {
      setDialogState(() {
        _verificationError = 'Doğrulama başarısız oldu: $e';
        _verifying = false;
      });
    }
  }

  void _addContact() async {
    final name = _nameController.text.trim();
    final email = _emailController.text.trim();
    final relation = _relationController.text.trim();

    if (email.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('E-posta alanı zorunludur.')),
      );
      return;
    }

    if (!_isVerified || _verifiedUserData == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Lütfen kaydetmeden önce yararlanıcının e-posta/kodunu doğrulayın.')),
      );
      return;
    }

    final user = _authService.currentUser;
    if (user == null) return;

    final contactUid = _verifiedUserData!['uid'];
    final isPending = contactUid == null;
    final docId = contactUid ?? 'pending_${email.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '_')}';

    await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .collection('trusted_contacts')
        .doc(docId)
        .set({
      'uid': contactUid,
      'name': name.isNotEmpty ? name : (_verifiedUserData!['displayName'] ?? 'Bekleyen Kayıt'),
      'email': email.toLowerCase(),
      'relation': relation.isEmpty ? 'Belirtilmedi' : relation,
      'isCoSigner': _isCoSigner,
      'publicKey': _verifiedUserData!['publicKey'],
      'status': isPending ? 'pending' : 'active',
      'createdAt': FieldValue.serverTimestamp(),
    });

    _nameController.clear();
    _emailController.clear();
    _relationController.clear();
    setState(() {
      _isVerified = false;
      _verifiedUserData = null;
      _isCoSigner = false;
      _notFoundButAllowAdd = false;
    });
    if (mounted) Navigator.pop(context);
  }

  void _deleteContact(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove Contact'),
        content: const Text('This person will no longer be a beneficiary of your vault.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('CANCEL')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.dangerRose),
            child: const Text('REMOVE'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    final user = _authService.currentUser;
    if (user == null) return;

    await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .collection('trusted_contacts')
        .doc(id)
        .delete();
  }

  void _showAddContactDialog() {
    _nameController.clear();
    _emailController.clear();
    _relationController.clear();
    setState(() {
      _isVerified = false;
      _verifiedUserData = null;
      _isCoSigner = false;
      _notFoundButAllowAdd = false;
      _verificationError = null;
    });

    showDialog(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Row(
                children: [
                  Icon(Icons.person_add_rounded, color: AppTheme.dangerRose),
                  SizedBox(width: 12),
                  Text('Add Trusted Contact'),
                ],
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Email or invitation code input with Verify button
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Davet Kodu veya E-posta Adresi',
                        style: TextStyle(color: AppTheme.textMuted, fontSize: 11, fontWeight: FontWeight.bold),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _emailController,
                            style: const TextStyle(color: Colors.white, fontSize: 13),
                            onChanged: (val) {
                              setDialogState(() {
                                _isVerified = false;
                                _verifiedUserData = null;
                                _notFoundButAllowAdd = false;
                                _verificationError = null;
                              });
                            },
                            decoration: const InputDecoration(
                              hintText: 'Örn: LV-XXXX-XXXX veya e-posta',
                              prefixIcon: Icon(Icons.mail_outline_rounded, size: 18),
                              contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        SizedBox(
                          height: 46,
                          child: ElevatedButton(
                            onPressed: _emailController.text.trim().isEmpty || _verifying
                                ? null
                                : () => _verifyEmailOrCode(setDialogState),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.primaryPurple,
                              padding: const EdgeInsets.symmetric(horizontal: 12),
                            ),
                            child: _verifying
                                ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Icon(Icons.search, size: 18),
                          ),
                        ),
                      ],
                    ),
                    if (_isVerified && !_notFoundButAllowAdd) ...[
                      const SizedBox(height: 8),
                      const Row(
                        children: [
                          Icon(Icons.check_circle_rounded, color: AppTheme.successGreen, size: 14),
                          SizedBox(width: 6),
                          Text('Sistem Kaydı Doğrulandı', style: TextStyle(color: AppTheme.successGreen, fontSize: 11, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ],
                    if (_notFoundButAllowAdd) ...[
                      const SizedBox(height: 8),
                      const Text(
                        'Bu e-posta sistemde kayıtlı değil. Mirasçıyı ekleyebilirsiniz, kaydolduğunda otomatik olarak kasanıza bağlanacaktır.',
                        style: TextStyle(color: Colors.orange, fontSize: 10, height: 1.3),
                      ),
                    ],
                    if (_verificationError != null) ...[
                      const SizedBox(height: 8),
                      Text(_verificationError!, style: const TextStyle(color: AppTheme.dangerRose, fontSize: 11)),
                    ],

                    const SizedBox(height: 14),
                    TextField(
                      controller: _nameController,
                      style: const TextStyle(color: Colors.white),
                      enabled: !_isVerified || _notFoundButAllowAdd,
                      decoration: const InputDecoration(
                        labelText: 'Full Name',
                        prefixIcon: Icon(Icons.person_outline),
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _relationController,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Relationship (optional)',
                        hintText: 'e.g. Spouse, Child, Lawyer',
                        prefixIcon: Icon(Icons.family_restroom),
                      ),
                    ),
                    const SizedBox(height: 14),
                    
                    // Co-Signer designator
                    CheckboxListTile(
                      value: _isCoSigner,
                      onChanged: (val) {
                        setDialogState(() {
                          _isCoSigner = val ?? false;
                        });
                      },
                      activeColor: AppTheme.dangerRose,
                      title: const Text('Designate as Co-Signer', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                      subtitle: const Text('Bu mirasçıyı kasanın açılması için onaylayıcı yapar.', style: TextStyle(color: AppTheme.textMuted, fontSize: 11)),
                      contentPadding: EdgeInsets.zero,
                    ),

                    const SizedBox(height: 8),
                    const Row(
                      children: [
                        Icon(Icons.info_outline, size: 14, color: AppTheme.warningAmber),
                        SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'This person will receive vault access when the Dead Man\'s Switch triggers.',
                            style: TextStyle(color: AppTheme.warningAmber, fontSize: 11),
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
                  child: const Text('CANCEL'),
                ),
                ElevatedButton.icon(
                  onPressed: !_isVerified ? null : _addContact,
                  icon: const Icon(Icons.person_add_rounded, size: 18),
                  label: const Text('ADD CONTACT'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.dangerRose,
                    disabledBackgroundColor: AppTheme.dangerRose.withOpacity(0.3),
                  ),
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
    final user = _authService.currentUser;
    final screenWidth = MediaQuery.of(context).size.width;
    final isWide = screenWidth > 700;

    return Scaffold(
      appBar: AppBar(title: const Text('Trusted Contacts')),
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
              .doc(user?.uid)
              .collection('trusted_contacts')
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
                    Icon(Icons.people_outline_rounded, size: 64, color: AppTheme.textMuted.withOpacity(0.3)),
                    const SizedBox(height: 16),
                    const Text(
                      'No trusted contacts yet',
                      style: TextStyle(color: AppTheme.textMuted, fontSize: 16),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Add people who should inherit your vault.',
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
                return _buildContactCard(doc.id, data, index);
              },
            );
          },
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddContactDialog,
        backgroundColor: AppTheme.dangerRose,
        child: const Icon(Icons.person_add_rounded),
      ).animate().fadeIn(delay: 300.ms).scale(begin: const Offset(0.5, 0.5), curve: Curves.elasticOut),
    );
  }

  Widget _buildContactCard(String docId, Map<String, dynamic> data, int index) {
    final name = data['name'] ?? 'Unknown';
    final email = data['email'] ?? 'No email';
    final relation = data['relation'] ?? 'Not specified';
    final initials = name.isNotEmpty ? name[0].toUpperCase() : '?';
    final isCoSigner = data['isCoSigner'] == true;
    final isPending = data['status'] == 'pending';
    final hasKey = data['publicKey'] != null;

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: AppTheme.glassDecoration(borderRadius: 18),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        leading: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            gradient: isCoSigner ? AppTheme.primaryGradient : AppTheme.dangerGradient,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Center(
            child: Text(
              initials,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                name,
                style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.white, fontSize: 15),
              ),
            ),
            if (isCoSigner)
              Container(
                margin: const EdgeInsets.only(left: 8),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppTheme.primaryPurple.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: AppTheme.primaryPurple.withOpacity(0.3)),
                ),
                child: const Text('CO-SIGNER', style: TextStyle(color: AppTheme.primaryPurple, fontSize: 9, fontWeight: FontWeight.bold)),
              ),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text(email, style: const TextStyle(color: AppTheme.textMuted, fontSize: 13)),
            const SizedBox(height: 4),
            Row(
              children: [
                Text(
                  relation,
                  style: const TextStyle(color: AppTheme.warningAmber, fontSize: 11, fontWeight: FontWeight.w600),
                ),
                const Spacer(),
                if (isPending)
                  const Text('PENDING', style: TextStyle(color: Colors.orange, fontSize: 10, fontWeight: FontWeight.bold))
                else if (!hasKey)
                  const Text('NO KEY', style: TextStyle(color: AppTheme.textMuted, fontSize: 10, fontWeight: FontWeight.bold))
                else
                  const Text('RSA ✓', style: TextStyle(color: AppTheme.successGreen, fontSize: 10, fontWeight: FontWeight.bold)),
              ],
            ),
          ],
        ),
        trailing: IconButton(
          icon: const Icon(Icons.delete_outline_rounded, color: AppTheme.dangerRose),
          onPressed: () => _deleteContact(docId),
        ),
      ),
    ).animate().fadeIn(delay: Duration(milliseconds: 100 * index), duration: 400.ms).slideX(begin: 0.05);
  }
}
