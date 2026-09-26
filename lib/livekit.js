// Real-time audio for Vent Rooms, via LiveKit (open-source WebRTC media
// server — self-hostable or LiveKit Cloud). Same lazy-client, graceful-
// fallback pattern as lib/stripe.js and lib/email.js: if the env vars
// below aren't set, isLiveKitConfigured() returns false and every
// caller (the /api/rooms/[id]/token route, the VentAudioRoom client
// component) falls back to the existing identity-only "waiting room"
// behavior instead of crashing or faking a connection.
//
// Setup (see README § Vent Room audio setup):
//   1. Either self-host LiveKit (https://docs.livekit.io/home/self-hosting/)
//      or create a free LiveKit Cloud project (https://cloud.livekit.io).
//   2. `npm install livekit-server-sdk livekit-client` (not bundled by
//      default — this file only imports the server SDK lazily, at call
//      time, so the app still runs without it installed).
//   3. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL (server) and
//      NEXT_PUBLIC_LIVEKIT_URL (same value, exposed to the browser) in
//      .env.local.

let _sdk = null;

async function getSdk() {
  if (_sdk) return _sdk;
  try {
    _sdk = await import("livekit-server-sdk");
    return _sdk;
  } catch {
    // Package not installed — treated exactly like a missing API key:
    // isLiveKitConfigured() below is what callers should check first,
    // this is just the second line of defense.
    return null;
  }
}

export function isLiveKitConfigured() {
  return Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL);
}

// identity: the room's own anonymous_id for this account (never the
// real account id or display name tied to their non-anon identity) —
// same anonymity guarantee the rest of the content layer holds to.
// displayName: what other participants see in the LiveKit room roster
// (their existing alias/anon display label — not their real name).
export async function createRoomToken({ roomName, identity, displayName, canPublish = true }) {
  if (!isLiveKitConfigured()) return null;
  const sdk = await getSdk();
  if (!sdk) return null;

  const { AccessToken } = sdk;
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity,
    name: displayName,
    ttl: "4h",
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish,
    canSubscribe: true,
    // Listeners (canPublish: false) can still see who's talking and
    // react — they just can't open their mic, matching an X Spaces
    // "listener" role vs. "speaker" role.
    canPublishData: true,
  });
  return {
    jwt: await token.toJwt(),
    url: process.env.LIVEKIT_URL,
  };
}

