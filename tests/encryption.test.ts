import { encryptToken, decryptToken } from "../src/lib/crypto";

// Ensure test encryption key is set
process.env.TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function runTests() {
  console.log("Running Token Encryption & Decryption Tests...");

  const sampleToken = "1//04abcDEF123456_sample_refresh_token_xyz987";
  const encrypted = encryptToken(sampleToken);

  console.log("Original token:", sampleToken);
  console.log("Encrypted format:", encrypted);

  if (!encrypted.includes(":")) {
    throw new Error("FAIL: Encrypted token does not contain IV/AuthTag separators");
  }

  const decrypted = decryptToken(encrypted);
  console.log("Decrypted token:", decrypted);

  if (decrypted !== sampleToken) {
    throw new Error(`FAIL: Decrypted token does not match original! Expected: ${sampleToken}, got: ${decrypted}`);
  }

  // Test tamper resistance
  try {
    const tampered = encrypted.slice(0, -2) + "ff";
    decryptToken(tampered);
    throw new Error("FAIL: Tampered payload should have failed decryption with AuthTag verification!");
  } catch (err: any) {
    console.log("Tamper detection passed:", err.message);
  }

  console.log("ALL ENCRYPTION TESTS PASSED!");
}

runTests();
