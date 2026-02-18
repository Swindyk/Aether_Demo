import React from 'react';
import { ArrowLeft, User, ShieldCheck, Sparkles, Wallet, TrendingUp } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { MOCK_ACCOUNT, MOCK_ASSET_GROWTH, MOCK_GACHA_TREND, MOCK_DAILY_TASKS } from '../constants';
import { Persona } from '../types';

interface DashboardProps {
  onClose: () => void;
  persona?: Persona;
}

export const Dashboard: React.FC<DashboardProps> = ({ onClose, persona = Persona.POWER }) => {
  return (
    <div className="fixed inset-0 bg-black/95 z-[60] text-white overflow-y-auto animate-in fade-in slide-in-from-bottom-10 duration-300">
      <nav className="border-b border-white/10 bg-black sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <ArrowLeft />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">以太账号仪表盘</h1>
              <p className="text-xs text-gray-500">资产概览 · 抽卡记录 · 进度追踪</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
              <User size={14} className="text-aether-400" />
              <span className="text-sm">账号ID: {MOCK_ACCOUNT.uid}</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white/5 border border-white/10 p-6 rounded-2xl hover:border-aether-500/50 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-400 text-sm">账号等级</span>
              <ShieldCheck size={18} className="text-yellow-500" />
            </div>
            <div className="text-3xl font-bold">等级 {MOCK_ACCOUNT.level}</div>
          </div>
          <div className="bg-white/5 border border-white/10 p-6 rounded-2xl hover:border-aether-500/50 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-400 text-sm">角色数量</span>
              <Sparkles size={18} className="text-aether-400" />
            </div>
            <div className="text-3xl font-bold">{MOCK_ACCOUNT.characters}</div>
          </div>
          <div className="bg-white/5 border border-white/10 p-6 rounded-2xl hover:border-aether-500/50 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-400 text-sm">武器库存</span>
              <Wallet size={18} className="text-blue-400" />
            </div>
            <div className="text-3xl font-bold">{MOCK_ACCOUNT.weapons}</div>
          </div>
          <div className="bg-white/5 border border-white/10 p-6 rounded-2xl hover:border-aether-500/50 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-400 text-sm">原石余额</span>
              <TrendingUp size={18} className="text-green-400" />
            </div>
            <div className="text-3xl font-bold">{MOCK_ACCOUNT.primogems.toLocaleString()}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-aether-300">
              <TrendingUp size={18} />
              资产增长趋势
            </h3>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={MOCK_ASSET_GROWTH}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="name" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px' }}
                    itemStyle={{ color: '#2dd4bf' }}
                    cursor={{ stroke: '#2dd4bf', strokeWidth: 1 }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#2dd4bf" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-yellow-400">
              抽卡记录趋势
            </h3>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={MOCK_GACHA_TREND}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="name" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px' }}
                    itemStyle={{ color: '#facc15' }}
                    cursor={{ fill: '#ffffff10' }}
                  />
                  <Bar dataKey="value" fill="#facc15" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
            <h3 className="text-lg font-bold mb-4">账号资产概览</h3>
            <div className="space-y-3 text-sm text-white/70">
              <div className="flex items-center justify-between">
                <span>圣遗物库存</span>
                <span>{MOCK_ACCOUNT.artifacts.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>角色命座完善度</span>
                <span>72%</span>
              </div>
              <div className="flex items-center justify-between">
                <span>五星武器占比</span>
                <span>38%</span>
              </div>
              <div className="flex items-center justify-between">
                <span>当前保底进度</span>
                <span>{MOCK_ACCOUNT.pity} 抽</span>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-r from-aether-900/20 to-transparent border border-aether-500/20 p-6 rounded-2xl">
            <h3 className="text-lg font-bold text-aether-300 mb-4">智能建议</h3>
            <ul className="space-y-2 text-sm text-white/70">
              {MOCK_DAILY_TASKS[persona].map(item => (
                <li key={item} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-aether-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
};


