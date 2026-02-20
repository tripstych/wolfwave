import fs from 'fs';
import path from 'path';

const placeholders = [
  { name: '400x300', w: 400, h: 300, text: 'Image 400x300', color: '#e2e8f0' },
  { name: '300x300', w: 300, h: 300, text: 'Chef/Profile 300x300', color: '#cbd5e1' },
  { name: '150x150', w: 150, h: 150, text: 'Avatar 150x150', color: '#94a3b8' },
  { name: '800x450', w: 800, h: 450, text: 'Hero 800x450', color: '#64748b' },
  { name: '1920x600', w: 1920, h: 600, text: 'Background 1920x600', color: '#475569' }
];

const outDir = 'public/images/placeholders';

placeholders.forEach(p => {
  const svg = `<svg width="${p.w}" height="${p.h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${p.color}" />
  <text x="50%" y="50%" font-family="Arial" font-size="24" fill="white" text-anchor="middle" dy=".3em">${p.text}</text>
</svg>`;
  
  fs.writeFileSync(path.join(outDir, `${p.name}.svg`), svg);
  console.log(`Generated ${p.name}.svg`);
});
