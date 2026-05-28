import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:convert';
import 'package:encrypt/encrypt.dart' as enc;
import 'package:pointycastle/export.dart';
import 'package:pointycastle/asn1.dart';

/// Cryptographically secure Zero-Knowledge RSA key pair management service.
/// Fully compatible with Web Crypto API (RSA-OAEP 2048 / SHA-256) used in the web app.
class KeypairService {
  /// Generates a cryptographically secure 2048-bit RSA keypair.
  static AsymmetricKeyPair<RSAPublicKey, RSAPrivateKey> generateRSAKeyPair() {
    final secureRandom = FortunaRandom();
    final seedSource = math.Random.secure();
    final seeds = List<int>.generate(32, (_) => seedSource.nextInt(256));
    secureRandom.seed(KeyParameter(Uint8List.fromList(seeds)));

    final keyGen = RSAKeyGenerator()
      ..init(ParametersWithRandom(
        RSAKeyGeneratorParameters(BigInt.parse('65537'), 2048, 64),
        secureRandom,
      ));

    final pair = keyGen.generateKeyPair();
    return AsymmetricKeyPair<RSAPublicKey, RSAPrivateKey>(
      pair.publicKey as RSAPublicKey,
      pair.privateKey as RSAPrivateKey,
    );
  }

  /// Encodes RSAPublicKey into SubjectPublicKeyInfo (SPKI) DER bytes.
  static Uint8List encodePublicKeyToSPKI(RSAPublicKey publicKey) {
    final rsaPubKeySeq = ASN1Sequence();
    rsaPubKeySeq.add(ASN1Integer(publicKey.modulus));
    rsaPubKeySeq.add(ASN1Integer(publicKey.exponent));

    final algoSeq = ASN1Sequence();
    algoSeq.add(ASN1ObjectIdentifier.fromName("rsaEncryption"));
    algoSeq.add(ASN1Null());

    final pubKeyBitString = ASN1BitString(stringValues: rsaPubKeySeq.encode());

    final spkiSeq = ASN1Sequence();
    spkiSeq.add(algoSeq);
    spkiSeq.add(pubKeyBitString);

    return spkiSeq.encode();
  }

  /// Encodes RSAPrivateKey into PrivateKeyInfo (PKCS#8) DER bytes.
  static Uint8List encodePrivateKeyToPKCS8(RSAPrivateKey privateKey) {
    final rsaPrivKeySeq = ASN1Sequence();
    rsaPrivKeySeq.add(ASN1Integer(BigInt.zero)); // Version 0
    rsaPrivKeySeq.add(ASN1Integer(privateKey.modulus));
    rsaPrivKeySeq.add(ASN1Integer(privateKey.publicExponent));
    rsaPrivKeySeq.add(ASN1Integer(privateKey.privateExponent));
    rsaPrivKeySeq.add(ASN1Integer(privateKey.p));
    rsaPrivKeySeq.add(ASN1Integer(privateKey.q));

    final pMinus1 = privateKey.p! - BigInt.one;
    final qMinus1 = privateKey.q! - BigInt.one;
    final exp1 = privateKey.privateExponent! % pMinus1;
    final exp2 = privateKey.privateExponent! % qMinus1;
    final coeff = privateKey.q!.modInverse(privateKey.p!);

    rsaPrivKeySeq.add(ASN1Integer(exp1));
    rsaPrivKeySeq.add(ASN1Integer(exp2));
    rsaPrivKeySeq.add(ASN1Integer(coeff));

    final algoSeq = ASN1Sequence();
    algoSeq.add(ASN1ObjectIdentifier.fromName("rsaEncryption"));
    algoSeq.add(ASN1Null());

    final privKeyOctetString = ASN1OctetString(octets: rsaPrivKeySeq.encode());

    final pkcs8Seq = ASN1Sequence();
    pkcs8Seq.add(ASN1Integer(BigInt.zero)); // Version 0
    pkcs8Seq.add(algoSeq);
    pkcs8Seq.add(privKeyOctetString);

    return pkcs8Seq.encode();
  }

  /// Exports an RSA Public Key to SPKI Base64.
  static String exportPublicKey(RSAPublicKey key) {
    return base64.encode(encodePublicKeyToSPKI(key));
  }

  /// Exports an RSA Private Key to PKCS#8 Base64.
  static String exportPrivateKey(RSAPrivateKey key) {
    return base64.encode(encodePrivateKeyToPKCS8(key));
  }

  /// Helper to convert a Base64 SPKI public key string to RSAPublicKey object.
  static RSAPublicKey parsePublicKey(String spkiBase64) {
    final cleanB64 = spkiBase64.replaceAll(RegExp(r'\s+'), '');
    final pem = "-----BEGIN PUBLIC KEY-----\n$cleanB64\n-----END PUBLIC KEY-----";
    final parser = enc.RSAKeyParser();
    return parser.parse(pem) as RSAPublicKey;
  }

  /// Helper to convert a Base64 PKCS#8 private key string to RSAPrivateKey object.
  static RSAPrivateKey parsePrivateKey(String pkcs8Base64) {
    final cleanB64 = pkcs8Base64.replaceAll(RegExp(r'\s+'), '');
    final pem = "-----BEGIN PRIVATE KEY-----\n$cleanB64\n-----END PRIVATE KEY-----";
    final parser = enc.RSAKeyParser();
    return parser.parse(pem) as RSAPrivateKey;
  }

  /// Encrypts plaintext using RSAPublicKey with RSA-OAEP / SHA-256 padding.
  static String encryptAsymmetric(String spkiPublicKeyBase64, String plaintext) {
    final publicKey = parsePublicKey(spkiPublicKeyBase64);
    final encrypter = enc.Encrypter(
      enc.RSA(
        publicKey: publicKey,
        encoding: enc.RSAEncoding.OAEP,
        digest: enc.RSADigest.SHA256,
      ),
    );
    return encrypter.encrypt(plaintext).base64;
  }

  /// Decrypts ciphertext using RSAPrivateKey with RSA-OAEP / SHA-256 padding.
  static String decryptAsymmetric(String pkcs8PrivateKeyBase64, String ciphertextB64) {
    final privateKey = parsePrivateKey(pkcs8PrivateKeyBase64);
    final encrypter = enc.Encrypter(
      enc.RSA(
        privateKey: privateKey,
        encoding: enc.RSAEncoding.OAEP,
        digest: enc.RSADigest.SHA256,
      ),
    );
    return encrypter.decrypt(enc.Encrypted.fromBase64(ciphertextB64));
  }
}
