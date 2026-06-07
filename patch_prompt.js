const fs = require('fs');
const file = 'backend/lib/intelligence-service.ts';
let code = fs.readFileSync(file, 'utf8');

const startMarker = `When asked for a sports recap, schedule, or match results, NEVER use markdown tables. You MUST output a structured HTML artifact using a code block with the language "html".
You MUST use the following template to render the Premium Sports Recap Feed with CDN Assets:
\`\`\`html`;

const endMarker = `        });
      }
    }
  </script>
</div>
\`\`\`
`;

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker) + endMarker.length;

if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
  console.error("Markers not found");
  process.exit(1);
}

const replacement = `When generating HTML artifacts, you MUST wrap the payload in a complete, standalone HTML5 document. 
You MUST use the following \`<head>\` configuration to inject the Clearspace Design System. The aesthetic MUST be Jony Ive-inspired: OLED blacks, subtle hardware-like elevation, hairline borders, and flawless typographic rhythm. No generic "hacker" dark mode.

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Typography: Inter mimics Apple's San Francisco -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <!-- Iconography -->
  <script src="https://unpkg.com/lucide@latest"></script>
  <!-- Clearspace Design System Engine -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { 
            sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'], 
            mono: ['JetBrains Mono', 'monospace'] 
          },
          colors: {
            /* Jony Ive Palette */
            void: '#000000',        /* Pure OLED Black */
            surface: '#161618',     /* Subtle hardware elevation */
            'surface-hover': '#1C1C1E',
            sand: '#F5F5F7',        /* Apple hardware white */
            taupe: '#86868B',       /* Apple secondary text */
            emerald: '#34C759',     /* iOS Green */
            clay: '#FF3B30',        /* iOS Red */
            blue: '#0A84FF'         /* iOS Blue */
          },
          boxShadow: { 
            'glass': '0 10px 40px -10px rgba(0,0,0,0.5)', 
            'inset': 'inset 0 1px 0 rgba(255,255,255,0.04)' 
          },
          borderColor: {
            DEFAULT: 'rgba(255,255,255,0.08)' /* Hairline borders */
          },
          animation: { 'breathe': 'breathe 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' },
          keyframes: { breathe: { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }
        }
      }
    }
  </script>
  <style>
    body { 
      background-color: #000000; 
      color: #F5F5F7; 
      display: flex; 
      justify-content: center; 
      padding: 3rem 1rem; 
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    /* Smooth out all transitions */
    * { transition-property: background-color, border-color, color, fill, stroke, opacity, box-shadow, transform; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 300ms; }
  </style>
</head>
<body>
  <!-- Artifact Payload Here -->
  <script>
    // Initialize icons with absolute precision
    lucide.createIcons({
      attrs: {
        'stroke-width': 1.5,
        'stroke': 'currentColor'
      }
    });
  </script>
</body>
</html>
\`\`\`
\`;`;

const newCode = code.substring(0, startIndex) + replacement + code.substring(endIndex);
fs.writeFileSync(file, newCode);
console.log("Successfully patched!");
