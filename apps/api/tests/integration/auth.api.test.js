const request = require('supertest');
const app = require('../../src/app');

// Mock the auth service to prevent actual DB hits during API testing
jest.mock('../../src/services/auth.service', () => ({
  login: jest.fn(),
  getCookieOptions: jest.fn(() => ({ httpOnly: true, secure: false })),
}));

const authService = require('../../src/services/auth.service');

describe('Auth API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should reject login if email is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'Password123' })
        .set('Accept', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid email format');
    });

    it('should reject login if password is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'employee@spheronix.com' })
        .set('Accept', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Password is required');
    });

    it('should return 401 when the service throws an authentication error', async () => {
      // Mock the service throwing an error (e.g., wrong password)
      const error = new Error('Invalid credentials.');
      error.statusCode = 401;
      authService.login.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@spheronix.com', password: 'wrongpassword' })
        .set('Accept', 'application/json');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid credentials.');
    });

    it('should successfully log in, set a cookie, and return a JWT', async () => {
      // Mock the service returning a valid token
      const mockResult = {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy',
        user: { _id: '123', email: 'test@spheronix.com', role: 'employee' },
        mfaRequired: false,
      };
      authService.login.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@spheronix.com', password: 'correctpassword' })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.data.token).toBe(mockResult.token);
      
      // Verify the cookie was set
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toMatch(/token_employee=/);
    });
    
    it('should return 200 with an MFA challenge if MFA is required', async () => {
      // Mock the service requiring MFA
      const mockResult = {
        mfaRequired: true,
        mfaEnrolled: true,
        tempToken: 'temp_mfa_token_123'
      };
      authService.login.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'manager@spheronix.com', password: 'correctpassword' })
        .set('Accept', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('MFA authentication code required');
      expect(response.body.data.tempToken).toBe('temp_mfa_token_123');
    });
  });
});
