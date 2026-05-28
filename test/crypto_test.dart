import 'package:flutter_test/flutter_test.dart';
import 'package:legacy_vault/core/services/shamir_service.dart';
import 'package:legacy_vault/core/services/keypair_service.dart';
import 'package:pointycastle/export.dart';

void main() {
  group("Shamir's Secret Sharing Tests", () {
    test("Should split and combine secrets correctly", () {
      const secret = "SuperSecretMasterPassword123!";
      final shares = ShamirService.splitSecret(secret, 2, 3);
      expect(shares.length, 3);

      final reconstructed1 = ShamirService.combineShares([shares[0], shares[1]]);
      final reconstructed2 = ShamirService.combineShares([shares[1], shares[2]]);
      final reconstructed3 = ShamirService.combineShares([shares[0], shares[2]]);

      expect(reconstructed1, secret);
      expect(reconstructed2, secret);
      expect(reconstructed3, secret);
      print("Mobile SSS Unit Test passed!");
    });
  });

  group("RSA Asymmetric Cryptography Tests", () {
    test("Should generate, export, parse, and encrypt/decrypt correctly", () {
      final pair = KeypairService.generateRSAKeyPair();
      
      final pubB64 = KeypairService.exportPublicKey(pair.publicKey);
      final privB64 = KeypairService.exportPrivateKey(pair.privateKey);

      expect(pubB64.isNotEmpty, true);
      expect(privB64.isNotEmpty, true);

      // Verify parsing
      final parsedPub = KeypairService.parsePublicKey(pubB64);
      final parsedPriv = KeypairService.parsePrivateKey(privB64);

      expect(parsedPub.modulus, pair.publicKey.modulus);
      expect(parsedPriv.privateExponent, pair.privateKey.privateExponent);

      // Verify RSA-OAEP SHA-256 Asymmetric Encrypt & Decrypt
      const plaintext = "This is a secret share of the master key!";
      final ciphertext = KeypairService.encryptAsymmetric(pubB64, plaintext);
      final decrypted = KeypairService.decryptAsymmetric(privB64, ciphertext);

      expect(decrypted, plaintext);
      print("Mobile RSA Unit Test passed!");
    });
  });
}
