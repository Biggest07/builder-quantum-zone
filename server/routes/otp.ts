import { RequestHandler } from "express";
import { z } from "zod";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { cacheService } from "../utils/cache";
import { Analytics } from "../utils/logger";

// --- Nodemailer Transport Setup ---
const useRealEmailService =
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  process.env.SMTP_USER !== "hybe.supp0rt@hotmail.com";

const transporter = useRealEmailService
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: parseInt(process.env.SMTP_PORT || "587", 10) === 465, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

// --- Route Handlers ---

const sendOtpBodySchema = z.object({
  email: z.string().email(),
});

export const handleSendOtp: RequestHandler = async (req, res) => {
  const startTime = Date.now();

  try {
    const { email } = sendOtpBodySchema.parse(req.body);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpKey = `otp:${email}`;
    const otpExpiration = 300; // 5 minutes in seconds

    // Use centralized cache service
    const cacheSuccess = await cacheService.set(otpKey, otp, otpExpiration);
    if (!cacheSuccess) {
      throw new Error("Failed to store OTP in cache");
    }

    // --- Send Email or Log to Console ---
    const templatePath = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "../email-templates/otp-template.html",
    );
    const template = fs.readFileSync(templatePath, "utf-8");
    const emailHtml = template.replace("{{OTP}}", otp);

    const emailStartTime = Date.now();
    let emailSuccess = false;

    if (transporter) {
      // Send real email
      await transporter.sendMail({
        from: `"HYBE Support" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Your HYBE Booking Verification Code",
        html: emailHtml,
      });
      emailSuccess = true;
    } else {
      // Fallback to console logging
      console.log("--- SIMULATED OTP EMAIL (SMTP not configured) ---");
      console.log(`To: ${email}`);
      console.log(emailHtml);
      console.log("--- END SIMULATED OTP EMAIL ---");
      emailSuccess = true;
    }

    Analytics.trackPerformance("email_send", Date.now() - emailStartTime, {
      email_service: transporter ? "smtp" : "console",
      success: emailSuccess,
    });

    Analytics.trackOtpRequest(email, true, req.ip);

    res.status(200).json({ success: true, message: "OTP sent successfully." });
  } catch (error) {
    Analytics.trackOtpRequest(req.body?.email || "unknown", false, req.ip);

    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ success: false, message: error.errors[0].message });
    }

    Analytics.trackError(error as Error, "otp_send", {
      email: req.body?.email,
      ip: req.ip,
      duration: Date.now() - startTime,
    });

    res.status(500).json({ success: false, message: "Failed to send OTP." });
  }
};

const verifyOtpBodySchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

export const handleVerifyOtp: RequestHandler = async (req, res) => {
  const startTime = Date.now();

  try {
    const { email, otp } = verifyOtpBodySchema.parse(req.body);
    const otpKey = `otp:${email}`;

    // Use centralized cache service
    const storedOtp = await cacheService.get<string>(otpKey);

    if (!storedOtp) {
      Analytics.trackPerformance("otp_verification", Date.now() - startTime, {
        success: false,
        reason: "not_found_or_expired",
      });
      return res
        .status(400)
        .json({
          success: false,
          message: "OTP not found or has expired. Please request a new one.",
        });
    }

    if (storedOtp !== otp) {
      Analytics.trackPerformance("otp_verification", Date.now() - startTime, {
        success: false,
        reason: "invalid_otp",
      });
      return res.status(400).json({ success: false, message: "Invalid OTP." });
    }

    // Clear the OTP after successful verification
    await cacheService.del(otpKey);

    Analytics.trackPerformance("otp_verification", Date.now() - startTime, {
      success: true,
      email: email.replace(/(.{2}).*@/, "$1***@"), // Partially hide email
    });

    res
      .status(200)
      .json({ success: true, message: "OTP verified successfully." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ success: false, message: error.errors[0].message });
    }

    Analytics.trackError(error as Error, "otp_verification", {
      email: req.body?.email,
      ip: req.ip,
      duration: Date.now() - startTime,
    });

    res.status(500).json({ success: false, message: "Failed to verify OTP." });
  }
};
