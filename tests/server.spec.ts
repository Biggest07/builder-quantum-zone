import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import { OtpService, createOtpService } from '../server/utils/OtpService';

let app: express.Express;
let otpService: OtpService;

beforeAll(async () => {
  app = express();
  app.use(bodyParser.json());
  otpService = await createOtpService();

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
});

describe('OTP Server', () => {
  const testUserId = 'test-user';

  it('should send an OTP to a valid user', async () => {
    const response = await supertest(app)
      .post('/otp/send')
      .send({ user_id: testUserId });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('OTP created');
    expect(response.body.otp).toBeDefined();
  });

  it('should return an error if user_id is missing on send', async () => {
    const response = await supertest(app)
      .post('/otp/send')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('user_id is required');
  });

  it('should verify a valid OTP', async () => {
    // 1. Send OTP
    const sendResponse = await supertest(app)
      .post('/otp/send')
      .send({ user_id: testUserId });

    const otp = sendResponse.body.otp;

    // 2. Verify the OTP
    const verifyResponse = await supertest(app)
      .post('/otp/verify')
      .send({ user_id: testUserId, code: otp });

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.message).toBe('OTP verified successfully');
  });

  it('should return an error for an invalid OTP', async () => {
    const response = await supertest(app)
      .post('/otp/verify')
      .send({ user_id: testUserId, code: '000000' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid or expired OTP');
  });

  it('should return an error if user_id or code is missing on verify', async () => {
    const response1 = await supertest(app)
      .post('/otp/verify')
      .send({ user_id: testUserId });

    expect(response1.status).toBe(400);
    expect(response1.body.error).toBe('user_id and code are required');

    const response2 = await supertest(app)
      .post('/otp/verify')
      .send({ code: '123456' });

    expect(response2.status).toBe(400);
    expect(response2.body.error).toBe('user_id and code are required');
  });
});
