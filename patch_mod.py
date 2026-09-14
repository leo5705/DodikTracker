import os

FILE = 'src/components/admin/AdminModerationTab.tsx'
with open(FILE, 'r') as f:
    code = f.read()

# 1. Add IN_REVIEW filter tab
old_tabs = """          <button
            onClick={() => { setStatusFilter('RESOLVED'); setPage(1); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              statusFilter === 'RESOLVED'
                ? 'bg-emerald-500 text-black'
                : 'bg-[#0F0E12] text-[#9A94AA] hover:text-[#F3F1F8]'
            }`}
          >
            Рассмотренные
          </button>"""

new_tabs = """          <button
            onClick={() => { setStatusFilter('IN_REVIEW'); setPage(1); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              statusFilter === 'IN_REVIEW'
                ? 'bg-blue-500 text-black'
                : 'bg-[#0F0E12] text-[#9A94AA] hover:text-[#F3F1F8]'
            }`}
          >
            В работе
          </button>
          <button
            onClick={() => { setStatusFilter('RESOLVED'); setPage(1); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              statusFilter === 'RESOLVED'
                ? 'bg-emerald-500 text-black'
                : 'bg-[#0F0E12] text-[#9A94AA] hover:text-[#F3F1F8]'
            }`}
          >
            Решено
          </button>"""
code = code.replace(old_tabs, new_tabs)

# 2. Add changeStatus logic
old_func = """  const handleAction = async () => {
    if (!actionModal) return;
    setIsActing(true);
    try {
      const res = await authFetch(`/api/admin/moderation/reports/${actionModal.report.id}/action`, {"""

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

  const handleAction = async () => {
    if (!actionModal) return;
    setIsActing(true);
    try {
      const res = await authFetch(`/api/admin/moderation/reports/${actionModal.report.id}/action`, {"""

if "handleChangeStatus" not in code:
    code = code.replace(old_func, new_func)

# 3. Handle SYSTEM reports vs Mod reports UI
# Wait, I need to know exactly how it is structured. Let's do it in a simpler way, replacing the whole report card UI inside the map if it's SYSTEM.

with open(FILE, 'w') as f:
    f.write(code)

