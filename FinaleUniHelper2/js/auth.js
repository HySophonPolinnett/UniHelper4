/* UniHelper accounts.
 * The "database" is this browser's own storage: accounts are saved on this device only (passwords are salted + hashed,
 * never stored as plain text). Logging in looks the student up in that database first. Each student's degree audit,
 * schedule and plan are saved under their own account.
 */
(function () {
  "use strict";
  const UH = window.UH;
  const LS_USERS = "unihelper_users_v1", LS_SESSION = "unihelper_session_v1";
  const A = (UH.auth = {});

  const readDB = () => { try { const d = JSON.parse(localStorage.getItem(LS_USERS) || "[]"); return Array.isArray(d) ? d : []; } catch (e) { return []; } };
  const writeDB = (d) => { try { localStorage.setItem(LS_USERS, JSON.stringify(d)); return true; } catch (e) { return false; } };
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const rand = () => { const a = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => (a[i] = Math.floor(Math.random() * 256))); return hex(a); };
  async function hash(pw, salt) {
    const enc = new TextEncoder();
    if (window.crypto && crypto.subtle) {
      try {
        const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
        return "p1:" + hex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" }, key, 256));
      } catch (e) {}
    }
    let h = 2166136261; const s = salt + "|" + pw; // fallback when the browser blocks crypto (insecure page)
    for (let r = 0; r < 2000; r++) for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return "f1:" + h.toString(16);
  }
  const normId = (s) => String(s || "").trim().toLowerCase();
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, SID = /^[A-Za-z0-9][A-Za-z0-9-]{2,19}$/;

  A.count = () => readDB().length;

  /* create an account: needs email, school ID and password */
  A.signup = async function (email, schoolId, password) {
    email = String(email || "").trim(); schoolId = String(schoolId || "").trim(); password = String(password || "");
    if (!email || !schoolId || !password) return { ok: false, error: "Please fill in your email, school ID and password." };
    if (!EMAIL.test(email)) return { ok: false, error: "That email doesn't look right. Example: name@aupp.edu.kh", field: "email" };
    if (!SID.test(schoolId)) return { ok: false, error: "Your school ID should be 3–20 letters or numbers (no spaces).", field: "sid" };
    if (password.length < 6) return { ok: false, error: "Choose a password with at least 6 characters.", field: "pw" };
    const db = readDB();
    if (db.some((u) => u.email === normId(email))) return { ok: false, error: "An account with this email already exists. Please log in instead.", field: "email" };
    if (db.some((u) => u.schoolId === normId(schoolId))) return { ok: false, error: "An account with this school ID already exists. Please log in instead.", field: "sid" };
    const salt = rand();
    db.push({ email: normId(email), schoolId: normId(schoolId), salt, hash: await hash(password, salt), created: Date.now() });
    if (!writeDB(db)) return { ok: false, error: "I couldn't save your account (browser storage is blocked or full)." };
    return { ok: true };
  };

  /* log in with school ID or email + password: first scans the database for the account */
  A.login = async function (identifier, password) {
    const id = normId(identifier); password = String(password || "");
    if (!id || !password) return { ok: false, error: "Enter your school ID or email, and your password." };
    const u = readDB().find((x) => x.email === id || x.schoolId === id);
    if (!u) return { ok: false, error: "We couldn't find an account with that school ID or email. Please sign up first.", notFound: true };
    if ((await hash(password, u.salt)) !== u.hash) return { ok: false, error: "That password isn't right. Try again.", field: "pw" };
    try { localStorage.setItem(LS_SESSION, JSON.stringify({ schoolId: u.schoolId, email: u.email })); } catch (e) {}
    return { ok: true, user: { schoolId: u.schoolId, email: u.email } };
  };

  A.current = function () {
    try {
      const s = JSON.parse(localStorage.getItem(LS_SESSION) || "null");
      if (s && readDB().some((u) => u.schoolId === s.schoolId)) return s; // still exists in the database
    } catch (e) {}
    return null;
  };
  A.logout = function () { try { localStorage.removeItem(LS_SESSION); } catch (e) {} };
})();
