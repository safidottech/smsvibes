/**
 * BaseOtpAdapter
 * 
 * Abstract class serving as the standard blueprint for all OTP provider adapters.
 * This ensures that the core business logic remains provider-agnostic by 
 * normalizing interactions with multiple OTP vendors (5sim, sms-activate, etc.).
 * 
 * Part of the Adapter Design Pattern implementation for SMSVIBES.
 */
export abstract class BaseOtpAdapter {
  /**
   * Holds the Provider configuration retrieved from the database.
   */
  protected provider: any;

  /**
   * @param provider - Configuration object for the specific provider.
   */
  constructor(provider: any) {
    this.provider = provider;
  }

  /**
   * Requests a new phone number for a specific service and country.
   * 
   * @param service - The service identifier (e.g., 'tg', 'wa')
   * @param countryCode - The country identifier code
   * @returns A promise resolving to a normalized response containing the number ID, the phone number, and current status.
   */
  abstract requestNumber(
    service: string, 
    countryCode: string
  ): Promise<{ numberId: string; phoneNumber: string; status: string }>;

  /**
   * Checks for an incoming OTP for a specific activation.
   * 
   * @param numberId - The unique identifier of the number request
   * @returns A promise resolving to an object containing the OTP (if available) and the status.
   */
  abstract checkOtp(
    numberId: string
  ): Promise<{ otp: string | null; status: string }>;

  /**
   * Cancels a pending number activation.
   * 
   * @param numberId - The unique identifier of the number request
   * @returns A promise resolving to the status of the cancellation.
   */
  abstract cancelNumber(
    numberId: string
  ): Promise<{ status: string }>;

  /**
   * Retrieves the list of available services from the provider.
   * 
   * @returns A promise resolving to an array of service strings.
   */
  abstract getServiceList(): Promise<string[]>;

  /**
   * Internal helper to retrieve the provider's API key.
   * 
   * NOTE: Full AES-256 decryption logic will be integrated here in Sprint 5.5.
   * Currently, it retrieves the key directly from the provider configuration.
   * 
   * @returns The API key for the provider.
   */
  protected getApiKey(): string {
    // For now, assume this.provider.apiKey is available.
    // Full decryption logic using utils/encryption.ts will be added in S5.5.
    return this.provider.apiKey;
  }
}
