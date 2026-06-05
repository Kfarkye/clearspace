import { handlePlayerPropQuery } from '../lib/player-prop-handler.js';

// Setup environment variables
process.env.GOOGLE_CLOUD_PROJECT = 'gen-lang-client-0281999829';

async function test() {
  console.log('🧪 Testing player prop handler for Yankees (MLB) - Live...');
  try {
    const result = await handlePlayerPropQuery({ team: 'Yankees', league: 'mlb' });
    console.log(`Resolved ${result.data?.props?.length || 0} props.`);
  } catch (err) {
    console.error('❌ Yankees (MLB) test failed:', err);
  }

  console.log('\n🧪 Testing player prop handler with MOCKED PrizePicks API failure (Asserting Fallbacks)...');
  const originalFetch = globalThis.fetch;
  
  // Intercept fetch to return error/abort for PrizePicks API
  globalThis.fetch = async (url, options) => {
    if (typeof url === 'string' && url.includes('prizepicks.com')) {
      console.log('   [Mock] Intercepting PrizePicks fetch and throwing error...');
      throw new Error('CORS / Rate Limit Mock Error');
    }
    return originalFetch(url, options);
  };

  try {
    const result = await handlePlayerPropQuery({ team: 'Yankees', league: 'mlb' });
    console.log('Result with Fallbacks:', JSON.stringify(result, null, 2));
    
    // Assert all returned props are marked as fallback
    const hasFallbacks = result.data?.props?.every(p => p._isFallback === true);
    if (hasFallbacks && result.data?.props?.length > 0) {
      console.log('🎉 SUCCESS: Fallback props were successfully generated and validated!');
    } else {
      console.error('❌ FAILURE: Fallback props validation failed.');
    }
  } catch (err) {
    console.error('❌ Fallback test failed:', err);
  } finally {
    globalThis.fetch = originalFetch; // Restore original fetch
  }
}

test();

