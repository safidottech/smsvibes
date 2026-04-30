import { BaseOtpAdapter } from './BaseOtpAdapter';
// Concrete adapters will be implemented in subsequent tasks (4.3 - 4.5)
import { FiveSimAdapter } from './FiveSimAdapter';
import { SmsActivateAdapter } from './SmsActivateAdapter';
import { GrizzlySmsAdapter } from './GrizzlySmsAdapter';

/**
 * ADAPTERS Map: Maps provider slugs to their respective concrete class implementations.
 */
const ADAPTERS: Record<string, any> = {
  '5sim': FiveSimAdapter,
  'sms-activate': SmsActivateAdapter,
  'grizzlysms': GrizzlySmsAdapter,
};

/**
 * OtpAdapterFactory
 * Responsible for instantiating the correct OTP provider adapter based on the provider slug.
 */
export class OtpAdapterFactory {
  /**
   * Creates an instance of an OTP adapter based on the provider's slug.
   * @param provider - Object containing slug, apiKey, and baseUrl.
   * @returns A concrete instance of BaseOtpAdapter.
   * @throws Error if the provider slug is not supported.
   */
  static create(provider: { slug: string; apiKey: string; baseUrl: string }): BaseOtpAdapter {
    const AdapterClass = ADAPTERS[provider.slug];

    if (!AdapterClass) {
      throw new Error(`No adapter found for provider: ${provider.slug}`);
    }

    return new AdapterClass(provider);
  }
}
