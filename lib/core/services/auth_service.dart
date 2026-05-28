import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final _secureStorage = const FlutterSecureStorage();

  Stream<User?> get userChanges => _auth.authStateChanges();
  User? get currentUser => _auth.currentUser;

  /// Retrieves the securely cached master password of the logged-in user.
  Future<String?> getCachedPassword() async {
    final uid = _auth.currentUser?.uid;
    if (uid == null) return null;
    return await _secureStorage.read(key: 'master_password_$uid');
  }

  Future<UserCredential> signInWithEmailPassword(String email, String password) async {
    final creds = await _auth.signInWithEmailAndPassword(email: email, password: password);
    if (creds.user != null) {
      await _secureStorage.write(key: 'master_password_${creds.user!.uid}', value: password);
    }
    return creds;
  }

  Future<UserCredential> registerWithEmailPassword(String email, String password) async {
    final creds = await _auth.createUserWithEmailAndPassword(email: email, password: password);
    if (creds.user != null) {
      await _secureStorage.write(key: 'master_password_${creds.user!.uid}', value: password);
    }
    return creds;
  }

  Future<void> signOut() async {
    final uid = _auth.currentUser?.uid;
    if (uid != null) {
      await _secureStorage.delete(key: 'master_password_$uid');
    }
    await _auth.signOut();
  }
}
