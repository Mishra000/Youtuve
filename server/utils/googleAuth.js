import jwt from "jsonwebtoken";

const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY ||
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  "AIzaSyAGrCfS4xNN4OLrBA13B0QhGsbAEbyoSgQ";

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  "yourtube-8e780";

let cachedCerts = null;
let certsExpiry = 0;

/**
 * Fetch and cache Google public x509 certs for Firebase Auth tokens
 */
async function getGooglePublicCerts() {
  const now = Date.now();
  if (cachedCerts && now < certsExpiry) {
    return cachedCerts;
  }

  try {
    const res = await fetch(
      "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
    );
    if (!res.ok) {
      throw new Error(`Failed to fetch certs: ${res.statusText}`);
    }
    const certs = await res.json();
    cachedCerts = certs;
    // Cache for 6 hours
    certsExpiry = now + 6 * 60 * 60 * 1000;
    return certs;
  } catch (err) {
    console.warn("[GoogleAuth] Error fetching Google public certs:", err.message);
    return cachedCerts;
  }
}

/**
 * Verify Firebase ID Token via Google Identity Toolkit REST API
 */
async function verifyViaIdentityToolkit(idToken) {
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    const data = await res.json();
    if (res.ok && data?.users && data.users.length > 0) {
      const u = data.users[0];
      return {
        valid: true,
        email: u.email,
        name: u.displayName || u.email?.split("@")[0] || "YourTube User",
        image: u.photoUrl || "https://github.com/shadcn.png",
        uid: u.localId,
        emailVerified: !!u.emailVerified,
      };
    }
    return { valid: false, error: data?.error?.message || "Invalid ID token" };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Verify Firebase ID Token locally using Google's public certificates & RS256
 */
async function verifyViaPublicCerts(idToken) {
  try {
    const decodedHeader = jwt.decode(idToken, { complete: true });
    if (!decodedHeader || !decodedHeader.header || !decodedHeader.header.kid) {
      return { valid: false, error: "Malformed token header" };
    }

    const certs = await getGooglePublicCerts();
    if (!certs) {
      return { valid: false, error: "Unable to retrieve Google certificates" };
    }

    const cert = certs[decodedHeader.header.kid];
    if (!cert) {
      return { valid: false, error: "Matching public certificate not found" };
    }

    const payload = jwt.verify(idToken, cert, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    });

    return {
      valid: true,
      email: payload.email,
      name: payload.name || payload.email?.split("@")[0] || "YourTube User",
      image: payload.picture || "https://github.com/shadcn.png",
      uid: payload.sub,
      emailVerified: !!payload.email_verified,
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Verify Google OAuth 2.0 ID Token via Google TokenInfo endpoint
 */
async function verifyViaGoogleTokenInfo(token) {
  try {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) {
      return { valid: false, error: `TokenInfo returned ${res.status}` };
    }
    const data = await res.json();
    if (data.email) {
      return {
        valid: true,
        email: data.email,
        name: data.name || data.email.split("@")[0] || "YourTube User",
        image: data.picture || "https://github.com/shadcn.png",
        uid: data.sub,
        emailVerified: data.email_verified === "true" || data.email_verified === true,
      };
    }
    return { valid: false, error: "No email in Google token" };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Main verification entrypoint.
 * Verifies either a Firebase ID Token or a raw Google OAuth ID Token.
 */
export async function verifyGoogleOrFirebaseToken(token) {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Token is required" };
  }

  // 1. Try Google Identity Toolkit API (most reliable for Firebase tokens)
  const idToolkitResult = await verifyViaIdentityToolkit(token);
  if (idToolkitResult.valid && idToolkitResult.email) {
    return idToolkitResult;
  }

  // 2. Try cryptographic verification with Google's public certificates
  const certResult = await verifyViaPublicCerts(token);
  if (certResult.valid && certResult.email) {
    return certResult;
  }

  // 3. Try Google OAuth TokenInfo API (for raw Google OAuth ID tokens)
  const tokenInfoResult = await verifyViaGoogleTokenInfo(token);
  if (tokenInfoResult.valid && tokenInfoResult.email) {
    return tokenInfoResult;
  }

  return {
    valid: false,
    error: idToolkitResult.error || certResult.error || tokenInfoResult.error || "Token verification failed",
  };
}
