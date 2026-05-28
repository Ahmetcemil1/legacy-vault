import 'package:encrypt/encrypt.dart';
import 'package:crypto/crypto.dart';
import 'dart:convert';
import 'dart:typed_data';

/// AES-256-CBC İstemci Tarafı Şifreleme Servisi.
/// Kullanıcının Master Password'ünden SHA-256 ile deterministik anahtar türetir.
/// Her şifreleme işleminde rastgele IV kullanır ve IV'yi ciphertext ile birlikte saklar.
/// Bu sayede aynı veri bile her seferinde farklı şifreli metin üretir (semantic security).
class EncryptionService {
  final Key _key;

  /// Master Password'den AES-256 anahtarı türetir (SHA-256 = 32 byte = 256 bit).
  factory EncryptionService.fromPassword(String password) {
    final bytes = utf8.encode(password);
    final digest = sha256.convert(bytes);
    final key = Key(Uint8List.fromList(digest.bytes));
    return EncryptionService._(key);
  }

  /// Base64 encoded 32-byte key ile doğrudan başlatma.
  factory EncryptionService.fromBase64Key(String base64Key) {
    try {
      final key = Key.fromBase64(base64Key);
      if (key.length != 32) {
        throw ArgumentError('Key length must be 32 bytes for AES-256');
      }
      return EncryptionService._(key);
    } catch (e) {
      if (e is ArgumentError) rethrow;
      throw ArgumentError('Invalid base64 key: ${e.toString()}');
    }
  }

  EncryptionService._(this._key);

  /// Rastgele 32 byte (256 bit) anahtar üretir, base64 olarak döner.
  static String generateRandomKey() {
    final key = Key.fromSecureRandom(32);
    return key.base64;
  }

  /// Düz metni şifreler.
  /// Çıktı formatı: base64(IV_16_bytes + Ciphertext_bytes)
  /// Her çağrıda farklı IV kullanıldığı için aynı metin farklı çıktı üretir.
  String encrypt(String plainText) {
    final iv = IV.fromSecureRandom(16);
    final encrypter = Encrypter(AES(_key, mode: AESMode.cbc));
    final encrypted = encrypter.encrypt(plainText, iv: iv);

    // IV + Ciphertext birleştirilerek saklanır
    final combined = Uint8List.fromList(iv.bytes + encrypted.bytes);
    return base64.encode(combined);
  }

  /// Şifreli metni çözer.
  /// Giriş formatı: base64(IV_16_bytes + Ciphertext_bytes)
  String decrypt(String encryptedData) {
    final decoded = base64.decode(encryptedData);
    if (decoded.length < 17) {
      throw ArgumentError('Invalid encrypted data: too short');
    }

    final ivBytes = decoded.sublist(0, 16);
    final cipherBytes = decoded.sublist(16);

    final iv = IV(Uint8List.fromList(ivBytes));
    final encrypted = Encrypted(Uint8List.fromList(cipherBytes));
    final encrypter = Encrypter(AES(_key, mode: AESMode.cbc));

    return encrypter.decrypt(encrypted, iv: iv);
  }
}
