import os

FILE = 'src/components/admin/AdminModerationTab.tsx'
with open(FILE, 'r') as f:
    code = f.read()

old_header = """                  <span className="font-bold text-xs text-[#F3F1F8]">
                    {r.targetType === 'SYSTEM' ? `Обращение #${r.id}` : `Жалоба #${r.id} на ${r.targetType}`}
                  </span>"""
new_header = """                  <span className="font-bold text-xs text-[#F3F1F8]">
                    {r.targetType === 'SYSTEM' ? `Обращение #${r.id} (${r.targetId === 'SUGGESTION' ? 'Идея' : r.targetId === 'BUG' ? 'Баг' : 'Жалоба'})` : `Жалоба #${r.id} на ${r.targetType}`}
                  </span>"""
code = code.replace(old_header, new_header)

with open(FILE, 'w') as f:
    f.write(code)
