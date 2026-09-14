import fs from 'fs';
const FILE = 'src/components/admin/AdminAuditTab.tsx';
let code = fs.readFileSync(FILE, 'utf-8');
code = code.replace(
  "const res = await authFetch(`/api/admin/settings/audit-logs?${params.toString()}`);",
  "const res = await authFetch(`/api/admin/audit-logs?${params.toString()}`);"
);
fs.writeFileSync(FILE, code);
