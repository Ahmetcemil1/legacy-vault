import 'package:flutter_test/flutter_test.dart';
import 'package:legacy_vault/core/services/encryption_service.dart';

void main() {
  group('EncryptionService', () {
    test('should encrypt and decrypt string successfully', () {
      final key = EncryptionService.generateRandomKey();
      final service = EncryptionService.fromBase64Key(key);
      
      const plainText = 'This is a highly sensitive recovery phrase';
      
      final encrypted = service.encrypt(plainText);
      expect(encrypted, isNot(equals(plainText)));
      
      final decrypted = service.decrypt(encrypted);
      expect(decrypted, equals(plainText));
    });

    test('should throw argument error for invalid key length', () {
      expect(() => EncryptionService.fromBase64Key('invalid_length_key_123'), throwsArgumentError);
    });

    test('should generate 32-byte (44 char base64) keys', () {
      final key = EncryptionService.generateRandomKey();
      expect(key.length, equals(44)); // Base64 encoding of 32 bytes
    });
  });
}
