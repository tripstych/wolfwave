import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf-8');

let mermaid = "erDiagram\n";
const relations = [];

const modelRegex = /model\s+(\w+)\s+{([^}]+)}/g;
let match;
while ((match = modelRegex.exec(schema)) !== null) {
  const modelName = match[1];
  const body = match[2];
  
  mermaid += `  ${modelName} {\n`;
  
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
    
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    
    const fieldName = parts[0];
    let fieldType = parts[1];
    
    if (trimmed.includes('@relation')) {
      const targetModel = fieldType.replace('[]', '').replace('?', '');
      const relationMatch = trimmed.match(/@relation\([^)]*fields:\s*\[([^\]]+)\].*references:\s*\[([^\]]+)\]/);
      
      if (relationMatch) {
        const fromField = relationMatch[1];
        relations.push(`  ${targetModel} ||--o{ ${modelName} : "${fromField}"\n`);
      }
    } else {
      const cleanType = fieldType.replace('?', '').replace('[]', '');
      mermaid += `    ${cleanType} ${fieldName}\n`;
    }
  }
  mermaid += `  }\n\n`;
}

mermaid += relations.join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WolfWave DB Schema</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background: #f4f4f5; margin: 0; padding: 20px; }
    </style>
</head>
<body>
    <pre class="mermaid">
${mermaid}
    </pre>
    <script type="module">
      import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
      mermaid.initialize({ 
        startOnLoad: true, 
        theme: 'base',
        themeVariables: {
          primaryColor: '#fef3c7',
          primaryTextColor: '#18181b',
          primaryBorderColor: '#f59e0b',
          lineColor: '#a1a1aa',
          secondaryColor: '#f4f4f5',
          tertiaryColor: '#fff'
        },
        maxTextSize: 900000,
        securityLevel: 'loose'
      });

      // Add mouse wheel zoom after Mermaid renders
      document.addEventListener('DOMContentLoaded', () => {
        const svg = document.querySelector('svg');
        if (svg) {
          let scale = 1;
          const minScale = 0.1;
          const maxScale = 5;
          const scaleFactor = 1.1;

          svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 1 / scaleFactor : scaleFactor;
            scale = Math.min(Math.max(scale * delta, minScale), maxScale);
            svg.style.transform = 'scale(' + scale + ')';
            svg.style.transformOrigin = 'center center';
          });
        }
      });
    </script>
</body>
</html>`;

const outputPath = path.join(__dirname, '../public/DB_SCHEMA.html');
fs.writeFileSync(outputPath, html);
console.log(`✅ Generated graphical schema map at: ${outputPath}`);
