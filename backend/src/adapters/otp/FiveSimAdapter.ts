import { BaseOtpAdapter } from './BaseOtpAdapter';

/**
 * FiveSimAdapter
 * 
 * Concrete implementation for the 5sim.net OTP provider.
 * Implements the BaseOtpAdapter to provide normalized access to 5sim's services.
 * 
 * API Reference: https://5sim.net/v1/
 */
export class FiveSimAdapter extends BaseOtpAdapter {
  /**
   * The base URL for 5sim API v1.
   */
  private readonly baseUrl: string = 'https://5sim.net/v1';

  /**
   * Requests a new phone number from 5sim.
   * 
   * @param service - The product/service slug (e.g., 'telegram', 'whatsapp')
   * @param countryCode - The country name slug (e.g., 'england', 'russia')
   * @returns Normalized response with numberId and phoneNumber.
   * 
   * @NOTE: 5sim uses long-form country names (slugs) instead of ISO alpha-2 codes.
   * Ensure the worker or a mapping helper converts ISO codes to 5sim slugs before calling.
   */
  async requestNumber(
    service: string, 
    countryCode: string
  ): Promise<{ numberId: string; phoneNumber: string; status: string }> {
    // 5sim dimensions: country/operator/product
    // Using 'any' as a default operator for maximum availability.
    const operator = 'any';
    const url = `${this.baseUrl}/user/buy/activation/${countryCode}/${operator}/${service}`;

    const response = await fetch(url, {
      method: 'POST', 
      headers: {
        'Authorization': `Bearer ${this.getApiKey()}`,
        'Accept': 'application/json'
      }
    });

    const data = await this.parseResponse(response);

    return {
      numberId: data.id.toString(),
      phoneNumber: data.phone,
      status: data.status
    };
  }

  /**
   * Checks for an incoming OTP code for a specific activation ID.
   * 
   * @param numberId - The 5sim activation ID
   * @returns Normalized response with the OTP (if received) and status.
   */
  async checkOtp(
    numberId: string
  ): Promise<{ otp: string | null; status: string }> {
    const url = `${this.baseUrl}/user/check/${numberId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.getApiKey()}`,
        'Accept': 'application/json'
      }
    });

    const data = await this.parseResponse(response);

    // 5sim returns an 'sms' array. If messages exist, take the code from the first one.
    const otp = data.sms && data.sms.length > 0 ? data.sms[0].code : null;
    
    return {
      otp,
      status: otp ? 'received' : 'pending'
    };
  }

  /**
   * Cancels an active number request.
   * 
   * @param numberId - The 5sim activation ID
   * @returns Normalized status.
   */
  async cancelNumber(
    numberId: string
  ): Promise<{ status: string }> {
    const url = `${this.baseUrl}/user/cancel/${numberId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.getApiKey()}`,
        'Accept': 'application/json'
      }
    });

    const data = await this.parseResponse(response);

    return {
      status: data.status
    };
  }

  /**
   * Fetches the list of available services from 5sim.
   * 
   * @returns Array of service slugs.
   */
  async getServiceList(): Promise<string[]> {
    // Products are specific to country/operator. Using 'any' for a general list.
    const country = 'any';
    const operator = 'any';
    const url = `${this.baseUrl}/guest/products/${country}/${operator}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch 5sim service list: ${response.statusText}`);
    }

    const data: Record<string, any> = await response.json();

    // 5sim returns an object where keys are service slugs.
    return Object.keys(data);
  }

  /**
   * Internal helper to parse responses and handle 5sim specific error strings.
   * 
   * @param response - The Fetch API Response object.
   * @throws Error with 'PROVIDER_INSUFFICIENT_BALANCE' or other descriptive messages.
   */
  private async parseResponse(response: Response): Promise<any> {
    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text; // 5sim sometimes returns plain text errors
    }

    if (!response.ok) {
      const errorMsg = typeof data === 'string' ? data : (data.error || text);
      
      // Critical check for balance errors to trigger failover logic
      if (errorMsg.toLowerCase().includes('not enough user balance')) {
        throw new Error('PROVIDER_INSUFFICIENT_BALANCE');
      }

      throw new Error(`5sim API Error (${response.status}): ${errorMsg}`);
    }

    return data;
  }
}
