import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

/// Galois Field GF(256) implementation for Shamir's Secret Sharing on Mobile.
/// Fully compatible with the web's GF(256) implementation in shamir.js.
class ShamirService {
  static const int primitive = 0x11d; // 285
  static final Uint8List gfExp = Uint8List(256);
  static final Uint8List gfLog = Uint8List(256);
  static bool _initialized = false;

  /// Initializes log and exponential lookup tables for fast GF(256) arithmetic.
  static void _init() {
    if (_initialized) return;
    int x = 1;
    for (int i = 0; i < 255; i++) {
      gfExp[i] = x;
      gfLog[x] = i;
      x <<= 1;
      if ((x & 0x100) != 0) {
        x ^= primitive;
      }
    }
    gfExp[255] = gfExp[0]; // Wrap around
    _initialized = true;
  }

  /// Galois Field addition & subtraction (XOR)
  static int gfAdd(int a, int b) {
    return a ^ b;
  }

  /// Galois Field multiplication using logarithm tables
  static int gfMul(int a, int b) {
    if (a == 0 || b == 0) return 0;
    _init();
    return gfExp[(gfLog[a] + gfLog[b]) % 255];
  }

  /// Galois Field division
  static int gfDiv(int a, int b) {
    if (b == 0) throw ArgumentError("Division by zero in Galois Field");
    if (a == 0) return 0;
    _init();
    return gfExp[(gfLog[a] - gfLog[b] + 255) % 255];
  }

  /// Evaluates polynomial P(x) = coefficients[0] + coefficients[1]*x + ... at given x
  static int _evalPolynomial(Uint8List coefficients, int xVal) {
    int result = 0;
    int power = 1;
    for (int i = 0; i < coefficients.length; i++) {
      result = gfAdd(result, gfMul(coefficients[i], power));
      power = gfMul(power, xVal);
    }
    return result;
  }

  /// Splits a secret string into N shares, requiring threshold T to combine.
  /// Output format: base64(x_byte + y_bytes...) per share.
  static List<String> splitSecret(String secret, int threshold, int sharesCount) {
    _init();
    if (threshold < 2) throw ArgumentError("Threshold must be at least 2");
    if (sharesCount < threshold) throw ArgumentError("Shares count must be greater than or equal to threshold");

    final secretBytes = utf8.encode(secret);
    final len = secretBytes.length;

    // Initialize shares
    final sharesX = List<int>.generate(sharesCount, (i) => i + 1);
    final sharesY = List<Uint8List>.generate(sharesCount, (_) => Uint8List(len));

    final random = Random.secure();

    // Split each byte of the secret
    for (int byteIdx = 0; byteIdx < len; byteIdx++) {
      final secretByte = secretBytes[byteIdx];

      // P(x) = secretByte + c1*x + c2*x^2 + ...
      final coefficients = Uint8List(threshold);
      coefficients[0] = secretByte;

      for (int c = 1; c < threshold; c++) {
        int r = random.nextInt(256);
        coefficients[c] = r == 0 ? 1 : r; // Fill with non-zero random coefficients
      }

      // Generate y value for each share
      for (int i = 0; i < sharesCount; i++) {
        sharesY[i][byteIdx] = _evalPolynomial(coefficients, sharesX[i]);
      }
    }

    // Format shares as base64 strings: [x_coordinate, ...y_bytes]
    return List<String>.generate(sharesCount, (i) {
      final combined = Uint8List(1 + len);
      combined[0] = sharesX[i];
      combined.setRange(1, 1 + len, sharesY[i]);
      return base64.encode(combined);
    });
  }

  /// Combines base64 encoded shares to reconstruct the original secret.
  static String combineShares(List<String> base64Shares) {
    _init();
    if (base64Shares.isEmpty) throw ArgumentError("No shares provided");

    final parsedSharesX = <int>[];
    final parsedSharesY = <Uint8List>[];

    for (final b64 in base64Shares) {
      final bytes = base64.decode(b64);
      if (bytes.isEmpty) continue;
      parsedSharesX.add(bytes[0]);
      parsedSharesY.add(bytes.sublist(1));
    }

    if (parsedSharesX.isEmpty) throw ArgumentError("No valid shares found");

    final len = parsedSharesY[0].length;
    final result = Uint8List(len);

    // Reconstruct each byte using Lagrange interpolation at x = 0
    for (int byteIdx = 0; byteIdx < len; byteIdx++) {
      int secretByte = 0;

      for (int j = 0; j < parsedSharesX.length; j++) {
        final xj = parsedSharesX[j];
        final yj = parsedSharesY[j][byteIdx];

        // L_j(0)
        int lagrangeNumerator = 1;
        int lagrangeDenominator = 1;

        for (int m = 0; m < parsedSharesX.length; m++) {
          if (m == j) continue;
          final xm = parsedSharesX[m];
          lagrangeNumerator = gfMul(lagrangeNumerator, xm);
          lagrangeDenominator = gfMul(lagrangeDenominator, gfAdd(xj, xm));
        }

        final lagrangeTerm = gfDiv(lagrangeNumerator, lagrangeDenominator);
        secretByte = gfAdd(secretByte, gfMul(yj, lagrangeTerm));
      }

      result[byteIdx] = secretByte;
    }

    return utf8.decode(result);
  }
}
