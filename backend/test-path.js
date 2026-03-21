import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log('__dirname:', __dirname);
console.log('import.meta.url:', import.meta.url);

const skillDir = path.resolve(__dirname, '../skills', 'base/ai.chat');
console.log('skillDir:', skillDir);