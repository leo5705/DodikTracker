const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = "import { ErrorBoundary } from './components/ErrorBoundary.tsx';\n" + code;
code = code.replace("<MainApp />", "<ErrorBoundary><MainApp /></ErrorBoundary>");
fs.writeFileSync('src/App.tsx', code);
