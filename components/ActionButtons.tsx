
import React from 'react';
import { Copy, Trash2, Loader2 } from './icons';

interface ActionButtonsProps {
  onCopy: () => void;
  onClear: () => void;
  copied: boolean;
  isClearing: boolean;
}

export default function ActionButtons({ onCopy, onClear, copied, isClearing }: ActionButtonsProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
      <button
        onClick={onCopy}
        className="w-full sm:w-auto inline-flex items-center justify-center whitespace-nowrap rounded-md text-lg font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-red-600 bg-transparent hover:bg-red-900/30 text-white h-12 px-6"
      >
        <Copy className="w-5 h-5 ml-2" />
        {copied ? "تم النسخ!" : "نسخ القائمة"}
      </button>

      <button
        onClick={onClear}
        disabled={isClearing}
        className="w-full sm:w-auto inline-flex items-center justify-center whitespace-nowrap rounded-md text-lg font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-transparent bg-red-800/50 text-red-300 hover:bg-red-800/80 h-12 px-6"
      >
        {isClearing ? (
          <Loader2 className="w-5 h-5 ml-2 animate-spin" />
        ) : (
          <Trash2 className="w-5 h-5 ml-2" />
        )}
        حذف الكل
      </button>
    </div>
  );
}
