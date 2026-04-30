import { BaseOtpAdapter } from './BaseOtpAdapter';

/**
 * GrizzlySmsAdapter
 * 
 * Concrete implementation for the GrizzlySMS Retail API.
 * This provider is SMSHUB-protocol compatible, utilizing plaintext responses 
 * and query-parameter authentication.
 * 
 * API Reference: https://grizzlysms.com/api
 */
export class GrizzlySmsAdapter extends BaseOtpAdapter {
  /**
   * The base URL for the GrizzlySMS stub handler.
   */
  private readonly baseUrl: string = 'https://api.grizzlysms.com/stubs/handler_api.php';

  /**
   * Requests a new phone number from GrizzlySMS.
   * 
   * @param service - Short code for the service (e.g., 'tg' for Telegram)
   * @param countryCode - Numeric string ID for the country (e.g., '2' for Kazakhstan)
   * @returns Normalized response with numberId and phoneNumber.
   */
  async requestNumber(
    service: string, 
    countryCode: string
  ): Promise<{ numberId: string; phoneNumber: string; status: string }> {
    const url = `${this.baseUrl}?api_key=${this.getApiKey()}&action=getNumber&service=${service}&country=${countryCode}`;

    const response = await fetch(url);
    const text = await response.text();

    // Successful response format: ACCESS_NUMBER:$id:$phone
    if (text.startsWith('ACCESS_NUMBER')) {
      const parts = text.split(':');
      return {
        numberId: parts[1],
        phoneNumber: parts[2],
        status: 'active'
      };
    }

    this.handleErrors(text);
    throw new Error(`GrizzlySMS: Unexpected response during number request: ${text}`);
  }

  /**
   * Checks for an incoming OTP code for a specific activation ID.
   * 
   * @param numberId - The activation ID.
   * @returns Normalized response with the OTP and status.
   */
  async checkOtp(
    numberId: string
  ): Promise<{ otp: string | null; status: string }> {
    const url = `${this.baseUrl}?api_key=${this.getApiKey()}&action=getStatus&id=${numberId}`;

    const response = await fetch(url);
    const text = await response.text();

    if (text.startsWith('STATUS_OK')) {
      const parts = text.split(':');
      return {
        otp: parts[1],
        status: 'received'
      };
    }

    if (text === 'STATUS_WAIT_CODE') {
      return {
        otp: null,
        status: 'pending'
      };
    }

    this.handleErrors(text);
    return {
      otp: null,
      status: 'unknown'
    };
  }

  /**
   * Cancels an active activation (status 8).
   * 
   * @param numberId - The activation ID.
   * @returns Normalized status.
   */
  async cancelNumber(
    numberId: string
  ): Promise<{ status: string }> {
    const url = `${this.baseUrl}?api_key=${this.getApiKey()}&action=setStatus&status=8&id=${numberId}`;

    const response = await fetch(url);
    const text = await response.text();

    if (text === 'ACCESS_CANCEL') {
      return { status: 'cancelled' };
    }

    this.handleErrors(text);
    return { status: text };
  }

  /**
   * Fetches the list of available services.
   * 
   * @returns Flat array of service short codes.
   */
  async getServiceList(): Promise<string[]> {
    const url = `${this.baseUrl}?api_key=${this.getApiKey()}&action=getNumbersStatus`;

    const response = await fetch(url);
    const data = await response.json();

    if (typeof data === 'object' && data !== null) {
      return Object.keys(data);
    }

    throw new Error('GrizzlySMS: Failed to parse service list JSON.');
  }

  /**
   * Internal helper to handle standardized plaintext error strings.
   * 
   * @param errorText - The plaintext error returned by the API.
   * @throws Standardized errors for failover logic.
   */
  private handleErrors(errorText: string): void {
    const cleanError = errorText.trim();

    switch (cleanError) {
      case 'NO_BALANCE':
        throw new Error('PROVIDER_INSUFFICIENT_BALANCE');
      
      case 'NO_NUMBERS':
      case 'SERVICE_UNAVAILABLE_REGION':
        throw new Error('PROVIDER_NO_NUMBERS_AVAILABLE');
      
      case 'BAD_KEY':
        throw new Error('GrizzlySMS Error: BAD_KEY (Invalid API Key)');
      
      case 'BAD_ACTION':
        throw new Error('GrizzlySMS Error: BAD_ACTION');
      
      default:
        if (cleanError.startsWith('ERROR_')) {
          throw new Error(`GrizzlySMS API Error: ${cleanError}`);
        }
    }
  }

  /**
   * Internal helper for the Cents Law.
   * Converts float strings/numbers from the API to integer cents.
   * 
   * @param value - The float value (e.g., 12.34 or "12.34")
   * @returns Integer cents (e.g., 1234)
   */
  protected toCents(value: number | string): number {
    const floatVal = typeof value === 'string' ? parseFloat(value) : value;
    return Math.round(floatVal * 100);
  }
}
