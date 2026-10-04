import { NextResponse } from "next/server";

// Served at https://<domain>/.well-known/assetlinks.json — Android's
// equivalent of apple-app-site-association, for App Links. REPLACE
// "sha256_cert_fingerprints" with your real signing certificate's SHA-256
// fingerprint before this verifies (get it from `eas credentials`, or
// `keytool -list -v` on your keystore for a manual build — it's a
// colon-separated hex string). Until it's real, Android links keep
// opening in the browser instead of the app — harmless fallback, not a
// crash.
export async function GET() {
  return NextResponse.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.yourcompany.linkedout",
        sha256_cert_fingerprints: ["REPLACE:WITH:YOUR:REAL:SHA256:SIGNING:CERT:FINGERPRINT"],
      },
    },
  ]);
}
