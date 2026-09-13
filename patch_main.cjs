const fs = require('fs');
let code = fs.readFileSync('src/main.tsx', 'utf8');
code = "import { ErrorBoundary } from './components/ErrorBoundary.tsx';\n" + code;
code = code.replace("<App />", "<ErrorBoundary><App /></ErrorBoundary>");
fs.writeFileSync('src/main.tsx', code);
