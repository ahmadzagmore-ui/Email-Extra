
import React from 'react';
import { Loader2 } from './icons';

interface SearchStatusProps {
  isSearching: boolean;
  searchPhase: string;
}

export default function SearchStatus({ isSearching, searchPhase }: SearchStatusProps) {
  if (!isSearching) return null;

  return (
    <div className="flex items-center justify-center gap-4 bg-gradient-to-br from-gray-900 to-black border border-red-600 rounded-xl p-6 text-center text-white">
      <Loader2 className="w-8 h-8 animate-spin text-red-500" />
      <p className="text-lg font-semibold">{searchPhase || "جاري تهيئة البحث..."}</p>
    </div>
  );
}
