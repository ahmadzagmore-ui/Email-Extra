import React from 'react';
import { Globe } from './icons';

interface GroundingSourcesProps {
  sources: any[];
}

export default function GroundingSources({ sources }: GroundingSourcesProps) {
    if (!sources || sources.length === 0) {
        return null;
    }
    
    return (
        <div className="bg-gradient-to-br from-gray-900 to-black border border-red-600 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
                <Globe className="w-6 h-6 text-red-500" />
                <h3 className="text-2xl font-bold text-white">مصادر البحث</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sources.map((source, index) => (
                    source.web && (
                        <a
                            key={`${source.web.uri}-${index}`}
                            href={source.web.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block bg-gray-800/50 p-3 rounded-lg border border-transparent hover:border-red-700 hover:bg-gray-800 transition-all"
                            title={source.web.title}
                        >
                            <p className="text-white font-medium truncate">{source.web.title || source.web.uri}</p>
                            <p className="text-red-400 text-sm truncate">{source.web.uri}</p>
                        </a>
                    )
                ))}
            </div>
        </div>
    );
}