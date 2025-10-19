
import React from 'react';
import { Target, Mail, TrendingUp } from './icons';

interface ProgressStatsProps {
  currentCount: number;
  targetCount: number;
}

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
}> = ({ title, value, icon }) => (
  <div className="bg-gradient-to-br from-gray-900 to-black border border-red-600 rounded-xl p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-gray-400 text-sm mb-1">{title}</p>
        <p className="text-4xl font-bold text-red-500">{value}</p>
      </div>
      <div className="w-12 h-12 text-red-600">{icon}</div>
    </div>
  </div>
);

export default function ProgressStats({ currentCount, targetCount }: ProgressStatsProps) {
  const percentage = Math.min((currentCount / targetCount) * 100, 100);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="الإيميلات المكتشفة" value={currentCount} icon={<Mail />} />
        <StatCard title="الهدف" value={targetCount} icon={<Target />} />
        <StatCard title="نسبة التقدم" value={`${percentage.toFixed(0)}%`} icon={<TrendingUp />} />
      </div>

      <div className="bg-gradient-to-br from-gray-900 to-black border border-red-600 rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-white font-semibold">التقدم الإجمالي</p>
          <p className="text-red-500 font-bold">{currentCount} / {targetCount}</p>
        </div>
        <div className="relative w-full h-3 bg-gray-800 rounded-full overflow-hidden">
            <div 
                className="absolute top-0 right-0 h-full bg-red-600 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${percentage}%` }}
            ></div>
        </div>
      </div>
    </div>
  );
}
