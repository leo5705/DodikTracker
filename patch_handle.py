import os

FILE = 'src/components/admin/AdminModerationTab.tsx'
with open(FILE, 'r') as f:
    code = f.read()

new_func = """  const handleChangeStatus = async (reportId: number, newStatus: string) => {
    try {
      const res = await authFetch(`/api/admin/moderation/reports/${reportId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) fetchReports();
    } catch (err) {
      console.error(err);
    }
  };

  const handleExecuteAction = async () => {"""

code = code.replace("  const handleExecuteAction = async () => {", new_func)

with open(FILE, 'w') as f:
    f.write(code)
