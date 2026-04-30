export abstract class BaseOtpAdapter {
  protected provider: { slug: string; apiKey: string; baseUrl: string };

  constructor(provider: { slug: string; apiKey: string; baseUrl: string }) {
    this.provider = provider;
  }

  abstract requestNumber(service: string, countryCode: string): Promise<{ numberId: string, phoneNumber: string, status: string }>;
  abstract checkOtp(numberId: string): Promise<{ otp: string | null, status: string }>;
  abstract cancelNumber(numberId: string): Promise<{ status: string }>;
  abstract getServiceList(): Promise<string[]>;

  protected getApiKey(): string {
    // Note: Decryption logic (AES-256) will be implemented in Sprint 5
    return this.provider.apiKey;
  }
}
