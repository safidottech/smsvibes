import { BaseOtpAdapter } from './BaseOtpAdapter';

/**
 * SmsActivateAdapter
 * 
 * Concrete implementation for the SMS-Activate (.ae) OTP provider.
 * Interacts with the legacy SMSHUB protocol using plaintext responses and query-string authentication.
 * 
 * API Reference: https://sms-activate.org/en/api2 (Protocol matches legacy .ae endpoint)
 */
export class SmsActivateAdapter extends BaseOtpAdapter {
  /**
   * The base URL for the SMS-Activate stub handler.
   */
  private readonly baseUrl: string = 'https://api.sms-activate.ae/stubs/handler_api.php';

  /**
   * Requests a new phone number from SMS-Activate.
   * 
   * @param service - Short code for the service (e.g., 'tg' for Telegram)
   * @param countryCode - Numeric integer ID for the country (e.g., '0' for Russia)
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
    throw new Error(`SMS-Activate: Unexpected response during number request: ${text}`);
  }

  /**
   * Checks the status of an activation and retrieves the OTP code.
   * 
   * @param numberId - The unique activation ID from SMS-Activate.
   * @returns Normalized response with the OTP and status.
   */
  async checkOtp(
    numberId: string
  ): Promise<{ otp: string | null; status: string }> {
    const url = `${this.baseUrl}?api_key=${this.getApiKey()}&action=getStatus&id=${numberId}`;

    const response = await fetch(url);
    const text = await response.text();

    // Response STATUS_OK:$code means the SMS has been received.
    if (text.startsWith('STATUS_OK')) {
      const parts = text.split(':');
      return {
        otp: parts[1],
        status: 'received'
      };
    }

    // Response STATUS_WAIT_CODE means the SMS has not yet arrived.
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
   * Cancels a pending activation (status 8).
   * 
   * @param numberId - The unique activation ID.
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
   * Fetches the list of available services and their current number counts.
   * 
   * @returns A flat array of available service short codes.
   */
  async getServiceList(): Promise<string[]> {
    const url = `${this.baseUrl}?api_key=${this.getApiKey()}&action=getNumbersStatus`;

    const response = await fetch(url);
    
    // getNumbersStatus returns a JSON object even in the stubs API.
    const data = await response.json();

    if (typeof data === 'object' && data !== null) {
      return Object.keys(data);
    }

    throw new Error('SMS-Activate: Failed to parse service list JSON.');
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
        throw new Error('PROVIDER_NO_NUMBERS_AVAILABLE');
      
      case 'BAD_ACTION':
        throw new Error('SMS-Activate Error: BAD_ACTION (Unverified reseller or invalid action)');
      
      case 'BAD_KEY':
        throw new Error('SMS-Activate Error: BAD_KEY (Invalid API Key)');
      
      default:
        if (cleanError.startsWith('ERROR_')) {
          throw new Error(`SMS-Activate API Error: ${cleanError}`);
        }
    }
  }
}
