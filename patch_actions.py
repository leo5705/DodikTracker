import os

FILE = 'src/components/admin/AdminModerationTab.tsx'
with open(FILE, 'r') as f:
    code = f.read()

old_footer = """              {/* Resolution / Action Footer */}
              {r.status === 'PENDING' ? (
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#252233]/60">
                  {/* Dismiss */}
                  <button
                    onClick={() => setActionModal({ report: r, actionType: 'DISMISS' })}
                    className="px-3 py-1.5 rounded-xl bg-[#252233] hover:bg-[#322E45] text-xs font-semibold text-[#F3F1F8] transition-colors"
                  >
                    Отклонить жалобу
                  </button>

                  {/* Hide content */}
                  <button
                    onClick={() => setActionModal({ report: r, actionType: 'HIDE_CONTENT' })}
                    className="px-3 py-1.5 rounded-xl bg-purple-900/40 hover:bg-purple-900/60 border border-purple-500/40 text-purple-200 text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    Скрыть контент
                  </button>

                  {/* Warn user */}
                  {r.targetUserId && (
                    <button
                      onClick={() => setActionModal({ report: r, actionType: 'WARN_USER', warnReason: `Нарушение правил: ${r.reason}` })}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Предупредить автора
                    </button>
                  )}

                  {/* Ban user */}
                  {r.targetUserId && (
                    <button
                      onClick={() => setActionModal({ report: r, actionType: 'BAN_USER', banHours: '24' })}
                      className="px-3 py-1.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Временный бан
                    </button>
                  )}

                  {/* Block user permanently */}
                  {r.targetUserId && (
                    <button
                      onClick={() => setActionModal({ report: r, actionType: 'BLOCK_USER' })}
                      className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Заблокировать
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-[#0F0E12] border border-[#252233] text-xs text-[#9A94AA] flex items-center justify-between">
                  <div>
                    <span className="text-emerald-400 font-bold">Рассмотрено: </span>
                    <span>Действие: {r.actionTaken || 'Решено'}</span>
                    {r.moderatorNotes && <span className="block text-[11px] text-[#656075] mt-0.5">«{r.moderatorNotes}»</span>}
                  </div>
                  {r.resolvedAt && <span>{new Date(r.resolvedAt).toLocaleString('ru-RU')}</span>}
                </div>
              )}"""

new_footer = """              {/* Resolution / Action Footer */}
              {r.targetType === 'SYSTEM' ? (
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#252233]/60">
                  {r.status === 'PENDING' && (
                    <button
                      onClick={() => handleChangeStatus(r.id, 'IN_REVIEW')}
                      className="px-3 py-1.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 text-xs font-bold transition-colors"
                    >
                      Взять в работу
                    </button>
                  )}
                  {['PENDING', 'IN_REVIEW'].includes(r.status) && (
                    <>
                      <button
                        onClick={() => handleChangeStatus(r.id, 'RESOLVED')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-colors"
                      >
                        Решено
                      </button>
                      <button
                        onClick={() => handleChangeStatus(r.id, 'DISMISSED')}
                        className="px-3 py-1.5 rounded-xl bg-[#252233] hover:bg-[#322E45] text-xs font-semibold text-[#F3F1F8] transition-colors"
                      >
                        Закрыть
                      </button>
                    </>
                  )}
                  {['RESOLVED', 'DISMISSED'].includes(r.status) && (
                    <div className="p-2 rounded-lg bg-[#0F0E12] border border-[#252233] text-xs text-[#9A94AA] flex items-center justify-between w-full">
                      <span className="text-emerald-400 font-bold">Статус: {r.status === 'RESOLVED' ? 'Решено' : 'Закрыто'}</span>
                      {r.resolvedAt && <span>{new Date(r.resolvedAt).toLocaleString('ru-RU')}</span>}
                    </div>
                  )}
                </div>
              ) : r.status === 'PENDING' ? (
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#252233]/60">
                  {/* Dismiss */}
                  <button
                    onClick={() => setActionModal({ report: r, actionType: 'DISMISS' })}
                    className="px-3 py-1.5 rounded-xl bg-[#252233] hover:bg-[#322E45] text-xs font-semibold text-[#F3F1F8] transition-colors"
                  >
                    Отклонить жалобу
                  </button>

                  {/* Hide content */}
                  <button
                    onClick={() => setActionModal({ report: r, actionType: 'HIDE_CONTENT' })}
                    className="px-3 py-1.5 rounded-xl bg-purple-900/40 hover:bg-purple-900/60 border border-purple-500/40 text-purple-200 text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    Скрыть контент
                  </button>

                  {/* Warn user */}
                  {r.targetUserId && (
                    <button
                      onClick={() => setActionModal({ report: r, actionType: 'WARN_USER', warnReason: `Нарушение правил: ${r.reason}` })}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Предупредить автора
                    </button>
                  )}

                  {/* Ban user */}
                  {r.targetUserId && (
                    <button
                      onClick={() => setActionModal({ report: r, actionType: 'BAN_USER', banHours: '24' })}
                      className="px-3 py-1.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Временный бан
                    </button>
                  )}

                  {/* Block user permanently */}
                  {r.targetUserId && (
                    <button
                      onClick={() => setActionModal({ report: r, actionType: 'BLOCK_USER' })}
                      className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Заблокировать
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-[#0F0E12] border border-[#252233] text-xs text-[#9A94AA] flex items-center justify-between">
                  <div>
                    <span className="text-emerald-400 font-bold">Рассмотрено: </span>
                    <span>Действие: {r.actionTaken || 'Решено'}</span>
                    {r.moderatorNotes && <span className="block text-[11px] text-[#656075] mt-0.5">«{r.moderatorNotes}»</span>}
                  </div>
                  {r.resolvedAt && <span>{new Date(r.resolvedAt).toLocaleString('ru-RU')}</span>}
                </div>
              )}"""

code = code.replace(old_footer, new_footer)

with open(FILE, 'w') as f:
    f.write(code)

