import { BaseOtpAdapter } from './BaseOtpAdapter';

/**
 * TODO: Task S4.3-S4.5 - Uncomment these imports once the concrete adapter files are created.
 */
import { FiveSimAdapter } from './FiveSimAdapter';
import { SmsActivateAdapter } from './SmsActivateAdapter';
import { GrizzlySmsAdapter } from './GrizzlySmsAdapter';

/**
 * Placeholder constants to prevent IDE errors until concrete adapters are implemented.
 * These will be replaced by the actual imports above.
 */
// const FiveSimAdapter: any = null;
// const SmsActivateAdapter: any = null;
// const GrizzlySmsAdapter: any = null;

/**
 * Registry Mapping: Maps provider unique slugs to their respective adapter classes.
 * This centralized registry allows the factory to be provider-count agnostic.
 */
const ADAPTERS: Record<string, any> = {
  '5sim': FiveSimAdapter,
  'sms-activate': SmsActivateAdapter,
  'grizzlysms': GrizzlySmsAdapter,
};

/**
 * OtpAdapterFactory
 * 
 * Implements the Factory Pattern to manage the instantiation of concrete OTP provider adapters.
 * This decoupling allows the core business logic (like OTP workers) to interact with 
 * providers without knowing their specific implementation details.
 */
export class OtpAdapterFactory {
  /**
   * Instantiates the appropriate adapter based on provider slug.
   * 
   * @param provider - The provider configuration/document from MongoDB.
   * @returns An instance of a concrete adapter extending BaseOtpAdapter.
   * @throws Error if the provider slug is not found in the registry or not yet implemented.
   */
  static create(provider: { slug: string; apiKey: string; baseUrl: string }): BaseOtpAdapter {
    const AdapterClass = ADAPTERS[provider.slug];

    if (!AdapterClass && AdapterClass !== null) {
      throw new Error(`OTP Adapter not found for provider slug: ${provider.slug}`);
    }

    if (AdapterClass === null) {
      throw new Error(`OTP Adapter for '${provider.slug}' is registered but the implementation is pending (Task S4.3-S4.5).`);
    }

    // Every adapter takes the provider config in its constructor
    return new AdapterClass(provider);
  }
}
