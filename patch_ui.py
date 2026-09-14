import os

FILE = 'src/components/admin/AdminModerationTab.tsx'
with open(FILE, 'r') as f:
    code = f.read()

old_header = """                  <span className="font-bold text-xs text-[#F3F1F8]">
                    Жалоба #{r.id} на {r.targetType}
                  </span>"""
new_header = """                  <span className="font-bold text-xs text-[#F3F1F8]">
                    {r.targetType === 'SYSTEM' ? `Обращение #${r.id}` : `Жалоба #${r.id} на ${r.targetType}`}
                  </span>"""
code = code.replace(old_header, new_header)

old_preview = """              {/* Reported Content / Entity Preview */}
              <div className="p-3.5 rounded-xl bg-[#0F0E12] border border-[#252233]/70 text-xs space-y-2">
                <div className="text-[11px] font-bold text-[#656075] uppercase tracking-wider">
                  Проверяемый объект:
                </div>

                {r.preview ? (
                  <div className="space-y-1">
                    {r.preview.title && (
                      <div className="font-bold text-indigo-300 text-sm">{r.preview.title}</div>
                    )}
                    {r.preview.text && (
                      <div className="text-[#F3F1F8] leading-relaxed whitespace-pre-wrap bg-[#14131A] p-3 rounded-lg border border-[#252233]">
                        «{r.preview.text}»
                      </div>
                    )}
                    {r.preview.isHidden && (
                      <div className="text-amber-400 text-[11px] flex items-center gap-1 font-semibold pt-1">
                        <EyeOff className="w-3.5 h-3.5" />
                        Данный объект уже скрыт модератором
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[#656075] italic">
                    Объект #{r.targetId} (исходный контент был удален или отсутствует)
                  </div>
                )}
              </div>"""

new_preview = """              {/* Reported Content / Entity Preview */}
              {r.targetType !== 'SYSTEM' && (
                <div className="p-3.5 rounded-xl bg-[#0F0E12] border border-[#252233]/70 text-xs space-y-2">
                  <div className="text-[11px] font-bold text-[#656075] uppercase tracking-wider">
                    Проверяемый объект:
                  </div>

                  {r.preview ? (
                    <div className="space-y-1">
                      {r.preview.title && (
                        <div className="font-bold text-indigo-300 text-sm">{r.preview.title}</div>
                      )}
                      {r.preview.text && (
                        <div className="text-[#F3F1F8] leading-relaxed whitespace-pre-wrap bg-[#14131A] p-3 rounded-lg border border-[#252233]">
                          «{r.preview.text}»
                        </div>
                      )}
                      {r.preview.isHidden && (
                        <div className="text-amber-400 text-[11px] flex items-center gap-1 font-semibold pt-1">
                          <EyeOff className="w-3.5 h-3.5" />
                          Данный объект уже скрыт модератором
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[#656075] italic">
                      Объект #{r.targetId} (исходный контент был удален или отсутствует)
                    </div>
                  )}
                </div>
              )}"""
code = code.replace(old_preview, new_preview)

with open(FILE, 'w') as f:
    f.write(code)
