import os

FILE = 'src/components/views/ProfileView.tsx'
with open(FILE, 'r') as f:
    code = f.read()

old_button = """                  <button
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('open_chat', {
                          detail: {
                            id: user.id,
                            username: user.username,
                            avatar: user.avatar,
                          },
                        })
                      );
                    }}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#252233] hover:bg-[#353147] border border-[#3A344E] text-xs font-semibold text-[#F3F1F8] transition-colors"
                    title="Написать личное сообщение"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#AC82FF]" />
                    Сообщение
                  </button>"""

code = code.replace(old_button, "")

with open(FILE, 'w') as f:
    f.write(code)
