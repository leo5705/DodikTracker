import React from 'react';
import { X, Film, Check, HardDrive, AlertTriangle } from 'lucide-react';
import { TorrentMediaFile } from '../../types/watchParty.ts';

interface TorrentFilePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: TorrentMediaFile[];
  selectedFileName?: string;
  onSelectFile: (fileName: string) => void;
  isHost: boolean;
}

export const TorrentFilePickerModal: React.FC<TorrentFilePickerModalProps> = ({
  isOpen,
  onClose,
  files,
  selectedFileName,
  onSelectFile,
  isHost,
}) => {
  if (!isOpen) return null;

  const videoFiles = files.filter((f) => f.isVideo);
  const otherFiles = files.filter((f) => !f.isVideo);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
      <div
        className="w-full max-w-lg bg-[#0B0D20] border border-[#1E2442] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[#1E2442] flex items-center justify-between bg-gradient-to-r from-[#11152A] to-[#0B0D20]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-2xl bg-[#8B5CF6]/15 text-[#A78BFA]">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Файлы в торренте ({files.length})
              </h3>
              <p className="text-xs text-[#94A3B8]">
                {isHost ? 'Выберите видеофайл для воспроизведения всей комнате' : 'Список файлов раздачи'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#64748B] hover:text-white hover:bg-[#151932] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Files List */}
        <div className="p-5 overflow-y-auto custom-scrollbar space-y-3 flex-1">
          {videoFiles.length > 0 ? (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-[#A78BFA] uppercase tracking-wider">
                Видеофайлы ({videoFiles.length})
              </span>
              {videoFiles.map((file) => {
                const isSelected = selectedFileName === file.name;
                const isMkv = file.extension === '.mkv';

                return (
                  <button
                    key={`vid-file-${file.index}-${file.name}`}
                    disabled={!isHost}
                    onClick={() => {
                      onSelectFile(file.name);
                      onClose();
                    }}
                    className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all ${
                      isHost ? 'cursor-pointer' : 'cursor-default'
                    } ${
                      isSelected
                        ? 'bg-[#8B5CF6]/15 border-[#8B5CF6] text-white shadow-sm'
                        : 'bg-[#080A18] hover:bg-[#11152A] border-[#1E2442] text-[#CBD5E1]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-[#151932] text-[#A78BFA] shrink-0">
                        <Film className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-bold text-white truncate max-w-sm">{file.name}</div>
                        <div className="flex items-center gap-2 text-[11px] font-mono text-[#94A3B8]">
                          <span>{file.formattedSize}</span>
                          <span>•</span>
                          <span className="uppercase text-[#A78BFA]">{file.extension.replace('.', '')}</span>
                          {isMkv && (
                            <span className="text-amber-400 text-[10px]" title="MKV контейнер">
                              (MKV)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {isSelected && (
                        <div className="p-1 rounded-full bg-[#8B5CF6] text-white shadow-md">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-[#080A18] border border-[#1E2442] text-center text-xs text-[#64748B]">
              Видеофайлы не обнаружены
            </div>
          )}

          {otherFiles.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-[#1E2442]">
              <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                Другие файлы ({otherFiles.length})
              </span>
              <div className="space-y-1.5 opacity-60 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                {otherFiles.map((file) => (
                  <div
                    key={`other-file-${file.index}-${file.name}`}
                    className="px-3 py-2 rounded-xl bg-[#080A18] border border-[#1E2442] flex items-center justify-between text-xs text-[#94A3B8]"
                  >
                    <span className="truncate max-w-xs">{file.name}</span>
                    <span className="font-mono text-[10px] shrink-0">{file.formattedSize}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
