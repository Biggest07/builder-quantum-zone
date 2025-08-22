import express from "express";
import bodyParser from "body-parser";
import { createOtpService } from "./utils/OtpService";

async function main() {
  const otpService = await createOtpService();
  const app = express();
  app.use(bodyParser.json());

  // Helper: make random 6-digit OTP
  function generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // POST /otp/send
  app.post("/otp/send", (req, res) => {
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const code = generateOtp();
    otpService.insertOtp(user_id, code);

    // In real life → send code by SMS/email
    return res.json({ message: "OTP created", otp: code });
  });

  // POST /otp/verify
  app.post("/otp/verify", (req, res) => {
    const { user_id, code } = req.body;
    if (!user_id || !code) {
      return res.status(400).json({ error: "user_id and code are required" });
    }

    const valid = otpService.verifyOtp(user_id, code);
    if (!valid) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    return res.json({ message: "OTP verified successfully" });
  });

  // Start server
  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`✅ OTP service running at http://localhost:${port}`);
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    otpService.stop();
    console.log("🛑 Stopped OTP service.");
    process.exit();
  });
}

main();
