import initSqlJs, { Database } from "sql.js";

export class OtpService {
  private db: Database;
  private cleanupInterval: NodeJS.Timeout;

  constructor(db: Database, cleanupMs = 60_000) {
    this.db = db;

    // Create table if not exists
    this.db.run(`
      CREATE TABLE IF NOT EXISTS otps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        code TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);

    // Cleanup expired OTPs automatically
    this.cleanupInterval = setInterval(() => this.cleanupExpired(), cleanupMs);
  }

  // Save OTP with default 5 minutes expiry
  insertOtp(userId: string, code: string, ttlMs = 5 * 60 * 1000) {
    const expiresAt = Date.now() + ttlMs;
    this.db.run(
      "INSERT INTO otps (user_id, code, expires_at) VALUES (?, ?, ?)",
      [userId, code, expiresAt]
    );
  }

  // Check OTP and delete it if valid
  verifyOtp(userId: string, code:string): boolean {
    const stmt = this.db.prepare(
      "SELECT id, expires_at FROM otps WHERE user_id = ? AND code = ?"
    );
    stmt.bind([userId, code]);

    let valid = false;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      if ((row.expires_at as number) > Date.now()) {
        valid = true;
        this.db.run("DELETE FROM otps WHERE id = ?", [row.id]);
      }
    }
    stmt.free();
    return valid;
  }

  // Remove expired OTPs
  private cleanupExpired() {
    this.db.run("DELETE FROM otps WHERE expires_at <= ?", [Date.now()]);
  }

  // Stop cleanup when shutting down
  stop() {
    clearInterval(this.cleanupInterval);
  }

  getOtpForTesting?(userId: string): string | null;
}

if (process.env.NODE_ENV === 'test') {
  OtpService.prototype.getOtpForTesting = function(userId: string): string | null {
    const stmt = this.db.prepare("SELECT code FROM otps WHERE user_id = ?");
    stmt.bind([userId]);
    let code: string | null = null;
    if (stmt.step()) {
      const row = stmt.getAsObject();
      code = row.code as string;
    }
    stmt.free();
    return code;
  }
}

// Helper to create service
export async function createOtpService(): Promise<OtpService> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  return new OtpService(db);
}
