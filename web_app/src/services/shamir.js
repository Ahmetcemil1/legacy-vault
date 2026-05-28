// Galois Field GF(256) implementation for Shamir's Secret Sharing
const PRIMITIVE = 0x11d; // Generator polynomial 285
const gfExp = new Uint8Array(256);
const gfLog = new Uint8Array(256);

// Initialize exp and log tables
let x = 1;
for (let i = 0; i < 255; i++) {
  gfExp[i] = x;
  gfLog[x] = i;
  x <<= 1;
  if (x & 0x100) {
    x ^= PRIMITIVE;
  }
}
gfExp[255] = gfExp[0]; // Wrap around

// Galois Field addition & subtraction (XOR)
function gfAdd(a, b) {
  return a ^ b;
}

// Galois Field multiplication
function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return gfExp[(gfLog[a] + gfLog[b]) % 255];
}

// Galois Field division
function gfDiv(a, b) {
  if (b === 0) throw new Error("Division by zero in Galois Field");
  if (a === 0) return 0;
  return gfExp[(gfLog[a] - gfLog[b] + 255) % 255];
}

// Evaluate polynomial P(x) = coefficients[0] + coefficients[1]*x + ... at given x
function evalPolynomial(coefficients, xVal) {
  let result = 0;
  let power = 1;
  for (let i = 0; i < coefficients.length; i++) {
    result = gfAdd(result, gfMul(coefficients[i], power));
    power = gfMul(power, xVal);
  }
  return result;
}

/**
 * Splits a secret (Uint8Array or string) into N shares, requiring threshold T to combine.
 * Each share is formatted as a base64 string of: [x_byte, y_bytes...]
 * @param {Uint8Array|string} secret 
 * @param {number} threshold T (minimum shares to reconstruct)
 * @param {number} sharesCount N (total shares to generate)
 * @returns {string[]} List of base64 encoded shares
 */
export function splitSecret(secret, threshold, sharesCount) {
  if (threshold < 2) throw new Error("Threshold must be at least 2");
  if (sharesCount < threshold) throw new Error("Shares count must be greater than or equal to threshold");

  // Convert secret to Uint8Array if it's a string
  const secretBytes = typeof secret === 'string' ? new TextEncoder().encode(secret) : secret;
  const len = secretBytes.length;
  
  // Initialize N shares: each share has x index and a byte array for y values
  const shares = [];
  for (let i = 0; i < sharesCount; i++) {
    const xVal = i + 1; // x coordinates must be non-zero (1, 2, ..., N)
    shares.push({
      x: xVal,
      y: new Uint8Array(len)
    });
  }

  // Split each byte of the secret
  const randomBuffer = new Uint8Array(threshold - 1);
  for (let byteIdx = 0; byteIdx < len; byteIdx++) {
    const secretByte = secretBytes[byteIdx];
    
    // Coefficients of the polynomial: P(x) = secretByte + c1*x + c2*x^2 + ...
    const coefficients = new Uint8Array(threshold);
    coefficients[0] = secretByte;
    
    // Fill other coefficients with random non-zero bytes
    window.crypto.getRandomValues(randomBuffer);
    for (let c = 1; c < threshold; c++) {
      coefficients[c] = randomBuffer[c - 1] === 0 ? 1 : randomBuffer[c - 1];
    }

    // Generate y value for each share
    for (let i = 0; i < sharesCount; i++) {
      shares[i].y[byteIdx] = evalPolynomial(coefficients, shares[i].x);
    }
  }

  // Format shares as base64 strings: [x_coordinate, ...y_bytes]
  return shares.map(share => {
    const combined = new Uint8Array(1 + len);
    combined[0] = share.x;
    combined.set(share.y, 1);
    
    // Convert to binary string, then base64
    let binary = '';
    const bytes = new Uint8Array(combined.buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  });
}

/**
 * Combines base64 encoded shares to reconstruct the original secret.
 * @param {string[]} base64Shares List of base64 encoded shares
 * @param {boolean} asString Whether to return result as UTF-8 string or Uint8Array
 * @returns {string|Uint8Array} Original secret
 */
export function combineShares(base64Shares, asString = true) {
  if (base64Shares.length === 0) throw new Error("No shares provided");

  // Parse all shares
  const parsedShares = base64Shares.map(b64 => {
    const binary = window.atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return {
      x: bytes[0],
      y: bytes.slice(1)
    };
  });

  const len = parsedShares[0].y.length;
  const result = new Uint8Array(len);

  // Reconstruct each byte using Lagrange interpolation at x = 0
  for (let byteIdx = 0; byteIdx < len; byteIdx++) {
    let secretByte = 0;
    
    for (let j = 0; j < parsedShares.length; j++) {
      const xj = parsedShares[j].x;
      const yj = parsedShares[j].y[byteIdx];
      
      // Calculate Lagrange basis polynomial L_j(0)
      let lagrangeNumerator = 1;
      let lagrangeDenominator = 1;
      
      for (let m = 0; m < parsedShares.length; m++) {
        if (m === j) continue;
        const xm = parsedShares[m].x;
        lagrangeNumerator = gfMul(lagrangeNumerator, xm);
        lagrangeDenominator = gfMul(lagrangeDenominator, gfAdd(xj, xm));
      }
      
      const lagrangeTerm = gfDiv(lagrangeNumerator, lagrangeDenominator);
      secretByte = gfAdd(secretByte, gfMul(yj, lagrangeTerm));
    }
    
    result[byteIdx] = secretByte;
  }

  return asString ? new TextDecoder().decode(result) : result;
}
