import { ArtifactRegistry } from '../backend/lib/artifact-registry';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables for Spanner/GCS
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const registry = new ArtifactRegistry(
  process.env.GCP_PROJECT_ID || 'clearspace-dev',
  process.env.SPANNER_INSTANCE_ID || 'aura-core',
  process.env.SPANNER_DATABASE_ID || 'sports-ledger',
  process.env.GCS_BUCKET_NAME || 'clearspace-artifacts'
);

const htmlPayload = `<!-- Artifact Payload: Consumer Prediction Canvas (Type: HTML) -->
<div class="w-full bg-charcoal border border-white/5 shadow-glass p-6 font-sans flex flex-col gap-6">
  
  <!-- Header: The Intent -->
  <div class="flex flex-col gap-2">
    <span class="font-mono text-xs text-taupe uppercase tracking-widest">WWDC 2026</span>
    <h2 class="text-sand text-xl font-medium tracking-tight leading-snug">
      Will Apple announce new AR hardware?
    </h2>
    <div class="flex items-center gap-2 mt-1">
      <span class="w-1.5 h-1.5 bg-emerald rounded-full animate-breathe"></span>
      <span class="text-taupe text-xs font-mono">Consensus: 32% Yes</span>
    </div>
  </div>

  <!-- Interactive State Machine -->
  <div id="prediction-interface" class="flex flex-col gap-6">
    
    <!-- Tactile Selection -->
    <div class="grid grid-cols-2 gap-3">
      <button 
        onclick="setOutcome('YES', 0.32)"
        id="opt-yes"
        class="relative overflow-hidden bg-ink border border-white/5 shadow-inset p-4 flex flex-col items-start gap-1 transition-all duration-300 ease-out hover:border-emerald/50 focus:outline-none"
      >
        <span class="text-sand font-medium text-lg">Yes</span>
        <span class="text-taupe font-mono text-xs">Pays 3.1x</span>
      </button>
      
      <button 
        onclick="setOutcome('NO', 0.68)"
        id="opt-no"
        class="relative overflow-hidden bg-ink border border-white/5 shadow-inset p-4 flex flex-col items-start gap-1 transition-all duration-300 ease-out hover:border-clay/50 focus:outline-none"
      >
        <span class="text-sand font-medium text-lg">No</span>
        <span class="text-taupe font-mono text-xs">Pays 1.4x</span>
      </button>
    </div>

    <!-- The Stake (Hidden until selection) -->
    <div id="stake-section" class="hidden flex-col gap-4 opacity-0 transition-opacity duration-500">
      <div class="bg-ink border border-white/5 shadow-inset p-4 flex items-center justify-between">
        <span class="text-taupe font-mono text-sm">Stake $</span>
        <input 
          type="number" 
          id="stake-amount" 
          value="50" 
          oninput="calculateReturn()"
          class="bg-transparent text-sand text-xl font-mono outline-none text-right w-32 placeholder-taupe/30" 
        />
      </div>

      <div class="flex justify-between items-center px-1">
        <span class="text-taupe text-sm">Potential Return</span>
        <span id="projected-return" class="text-emerald font-mono text-lg">$156.25</span>
      </div>

      <!-- Execution -->
      <button 
        onclick="dispatchPrediction()" 
        id="exec-btn"
        class="w-full bg-sand text-ink py-4 font-medium text-sm shadow-btn hover:shadow-glass-hover transition-all duration-300 ease-out mt-2"
      >
        Confirm Prediction
      </button>
    </div>
  </div>

  <script>
    let currentSelection = null;
    let currentPrice = 0;

    function setOutcome(choice, price) {
      currentSelection = choice;
      currentPrice = price;

      const btnYes = document.getElementById('opt-yes');
      const btnNo = document.getElementById('opt-no');
      const stakeSection = document.getElementById('stake-section');

      // Reset states
      btnYes.className = "relative overflow-hidden bg-ink border border-white/5 shadow-inset p-4 flex flex-col items-start gap-1 transition-all duration-300 ease-out hover:border-emerald/50 focus:outline-none";
      btnNo.className = "relative overflow-hidden bg-ink border border-white/5 shadow-inset p-4 flex flex-col items-start gap-1 transition-all duration-300 ease-out hover:border-clay/50 focus:outline-none";

      // Apply active state
      if (choice === 'YES') {
        btnYes.classList.replace('border-white/5', 'border-emerald');
        btnYes.classList.add('shadow-[inset_0_0_20px_rgba(16,185,129,0.1)]');
      } else {
        btnNo.classList.replace('border-white/5', 'border-clay');
        btnNo.classList.add('shadow-[inset_0_0_20px_rgba(217,119,87,0.1)]');
      }

      // Reveal stake section smoothly
      stakeSection.classList.remove('hidden');
      // Small delay to allow display:flex to apply before opacity transition
      setTimeout(() => stakeSection.classList.remove('opacity-0'), 10);
      
      calculateReturn();
    }

    function calculateReturn() {
      const amount = parseFloat(document.getElementById('stake-amount').value) || 0;
      if (currentPrice > 0) {
        const payout = (amount / currentPrice).toFixed(2);
        document.getElementById('projected-return').innerText = \`$\${payout}\`;
      }
    }

    function dispatchPrediction() {
      const btn = document.getElementById('exec-btn');
      const amount = document.getElementById('stake-amount').value;
      
      // Morph button to loading state
      btn.innerHTML = '<span class="flex items-center justify-center gap-2"><span class="w-1.5 h-1.5 bg-ink rounded-full animate-thinking-dot"></span><span class="w-1.5 h-1.5 bg-ink rounded-full animate-thinking-dot delay-75"></span><span class="w-1.5 h-1.5 bg-ink rounded-full animate-thinking-dot delay-150"></span></span>';
      btn.classList.add('opacity-90', 'pointer-events-none');
      
      // Dispatch via IPC Bridge to AURA Host
      if (window.executeAuraCommand) {
        window.executeAuraCommand('Markets Specialist', { 
          action: 'PLACE_PREDICTION', 
          market: 'WWDC_2026_AR',
          outcome: currentSelection, 
          stake: amount,
          implied_probability: currentPrice
        });
      }
    }
  </script>
  <script>
    // Inject AURA Context into the Artifact Sandbox
    window.AURA_ARTIFACT_ID = "ephemeral_html";
    window.executeAuraCommand = (domain, payload) => {
      window.parent.postMessage({ 
        type: 'AURA_EXECUTE', 
        domain, 
        payload, 
        artifactId: "ephemeral_html" 
      }, '*');
    };
    window.onload = function() {
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(function() {
           window.parent.postMessage({ type: 'resize_html', height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) }, '*');
        });
        ro.observe(document.body);
      }
      window.parent.postMessage({ type: 'resize_html', height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) }, '*');
    };
  </script>
</div>`;

async function deploy() {
  try {
    const artifactId = await registry.publishArtifact(htmlPayload, 'html');
    console.log(`[AURA] Artifact successfully deployed bypassing stream limits.`);
    console.log(`[AURA] ARTIFACT_URL: /artifact/${artifactId}`);
  } catch (error) {
    console.error(`[AURA] Deployment failed:`, error);
  }
}

deploy();
