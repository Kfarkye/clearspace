const fs = require('fs');
const file = 'backend/lib/intelligence-service.ts';
let code = fs.readFileSync(file, 'utf8');

const lines = code.split('\n');

let startLine = -1;
let endLine = -1;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('When asked for a sports recap, schedule, or match results, NEVER use markdown tables')) {
        startLine = i;
    }
    if (startLine > -1 && i > startLine && lines[i].includes('});')) {
        if (lines[i+3] && lines[i+3].includes('</script>') && lines[i+4] && lines[i+4].includes('</div>')) {
            endLine = i + 6; // Include the \`;
            break;
        }
    }
}

if (startLine > -1 && endLine > -1) {
    const newText = `When generating HTML artifacts, you MUST wrap the payload in a complete, standalone HTML5 document. 
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

    lines.splice(startLine, endLine - startLine + 1, newText);
    fs.writeFileSync(file, lines.join('\n'));
    console.log('Successfully patched lines ' + startLine + ' to ' + endLine);
} else {
    console.log('Error: bounds not found', startLine, endLine);
}
