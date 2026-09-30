import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Brain, Zap, Activity, ShieldCheck, Map, TrendingUp, BarChart3, AlertCircle, MessageSquare } from 'lucide-react';
import api from '../../services/api';
import { useI18n } from '../../i18n/index.jsx';

const AIInsights = () => {
  const { t } = useI18n();
  const [data, setData] = useState({
    forecast: null, surge: null, heatmap: null, traffic: null, sentiment: null, score: null
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAI = async () => {
      try {
        const [f, s, h, tData, sc] = await Promise.all([
          api.get('/ai/forecast/global').catch(() => ({ data: null })),
          api.post('/ai/evaluate-pricing').catch(() => ({ data: null })),
          api.get('/ai/heatmap').catch(() => ({ data: null })),
          api.get('/ai/traffic/global').catch(() => ({ data: null })),
          api.get('/ai/parking-score/global').catch(() => ({ data: null }))
        ]);
        setData({
          forecast: f.data, surge: s.data, heatmap: h.data, traffic: tData.data, score: sc.data
        });
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchAI();
  }, []);

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-parking-primary border-t-transparent"></div></div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-asphalt-200 dark:border-asphalt-800">
        <div>
          <h1 className="text-3xl font-black text-asphalt-900 dark:text-white flex items-center gap-2">
            <Brain className="w-8 h-8 text-parking-primary" /> AI Insights Dashboard
          </h1>
          <p className="text-sm text-asphalt-500 dark:text-asphalt-400 mt-1">Real-time predictive intelligence for your parking experience.</p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/40 rounded-full text-xs font-bold self-start md:self-center">
          <div className="w-2 h-2 bg-parking-accent rounded-full animate-pulse"></div>
          <span>AI Engine Online</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Availability Forecast */}
        <motion.div whileHover={{ y: -2 }} className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-50 dark:bg-blue-950/30 text-parking-primary border border-blue-100 dark:border-blue-900/30 rounded-lg">
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className="badge-blue">Availability Forecast</span>
            </div>
            <h3 className="text-base font-bold text-asphalt-900 dark:text-white mb-4">Occupancy Trends</h3>
            
            {/* Bar chart visualization */}
            {data.forecast?.predictions ? (
              <div className="flex items-end gap-1.5 h-28 mb-4 pt-4 border-b border-asphalt-100 dark:border-asphalt-900">
                {data.forecast.predictions.map((p, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="w-full bg-asphalt-200 dark:bg-asphalt-900 rounded-t relative group transition-all h-full flex items-end">
                      <div className="w-full bg-parking-primary/80 rounded-t transition-all group-hover:bg-parking-primary" style={{ height: `${p.predictedOccupancy}%` }}></div>
                    </div>
                    <span className="text-[9px] text-asphalt-450 font-bold">{p.label.split(':')[0]}h</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-28 flex items-center justify-center text-xs text-asphalt-400">Unavailable</div>
            )}
          </div>
          <p className="text-xs text-asphalt-500 italic mt-2">Peak demand expected around 10:00 AM</p>
        </motion.div>

        {/* Dynamic Pricing */}
        <motion.div whileHover={{ y: -2 }} className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-yellow-50 dark:bg-yellow-950/30 text-parking-surge border border-yellow-100 dark:border-yellow-900/30 rounded-lg">
                <Zap className="w-5 h-5" />
              </div>
              <span className="badge-yellow">Smart Pricing</span>
            </div>
            <h3 className="text-base font-bold text-asphalt-900 dark:text-white mb-3">Surge Analysis</h3>
            
            <div className="space-y-3">
              {data.surge?.updates ? (
                data.surge.updates.slice(0, 3).map((u, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-asphalt-50 dark:bg-asphalt-900/40 border border-asphalt-200/50 dark:border-asphalt-800/40 rounded-lg">
                    <div>
                      <p className="text-xs font-bold text-asphalt-850 dark:text-white">{u.zoneName}</p>
                      <p className="text-[10px] text-asphalt-500 mt-0.5">{u.reason}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-black ${u.isSurge ? 'text-parking-danger' : 'text-parking-accent'}`}>₹{u.surgePrice}/hr</p>
                      <p className="text-[8px] uppercase tracking-wider text-asphalt-400 font-bold">{u.multiplier}x rate</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-asphalt-400 py-6 text-center">Unavailable</div>
              )}
            </div>
          </div>
          <p className="text-[10px] text-asphalt-400 mt-3 uppercase tracking-wider font-bold">Updated real-time by AI RL Agent</p>
        </motion.div>

        {/* Traffic Index */}
        <motion.div whileHover={{ y: -2 }} className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-red-50 dark:bg-red-950/30 text-parking-danger border border-red-100 dark:border-red-900/30 rounded-lg">
                <Map className="w-5 h-5" />
              </div>
              <span className="badge-red">Traffic Index</span>
            </div>
            <h3 className="text-base font-bold text-asphalt-900 dark:text-white mb-4">Route Congestion</h3>
            
            <div className="space-y-3">
              {data.traffic?.forecast ? (
                data.traffic.forecast.slice(0, 4).map((f, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${f.trafficLevel === 'GRIDLOCK' ? 'bg-parking-danger animate-pulse' : f.trafficLevel === 'HIGH' ? 'bg-parking-surge' : 'bg-parking-accent'}`}></div>
                    <span className="text-xs font-bold text-asphalt-800 dark:text-asphalt-200 w-10">{f.label}</span>
                    <div className="flex-1 h-1.5 bg-asphalt-200 dark:bg-asphalt-900 rounded-full overflow-hidden">
                      <div className={`h-full ${f.trafficLevel === 'GRIDLOCK' ? 'bg-parking-danger' : f.trafficLevel === 'HIGH' ? 'bg-parking-surge' : 'bg-parking-accent'}`} style={{ width: f.trafficLevel === 'GRIDLOCK' ? '95%' : f.trafficLevel === 'HIGH' ? '70%' : '30%' }}></div>
                    </div>
                    <span className="text-xs font-bold text-asphalt-700 dark:text-asphalt-300 font-mono w-8 text-right">{f.estimatedTravelTimeMin}m</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-asphalt-400 py-6 text-center">Unavailable</div>
              )}
            </div>
          </div>
          <p className="text-xs text-asphalt-500 italic mt-3">Avoid routes during peak hours (17:00-19:00)</p>
        </motion.div>

        {/* Security & Theft Detection */}
        <motion.div whileHover={{ y: -2 }} className="glass-card p-6 border border-asphalt-200 dark:border-asphalt-800 lg:col-span-2 flex flex-col sm:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-2 bg-green-50 dark:bg-green-950/30 text-parking-accent border border-green-100 dark:border-green-900/30 rounded-lg">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <span className="badge-emerald">Active Security</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-asphalt-900 dark:text-white">Theft Vulnerability Assessment</h3>
              <p className="text-xs text-asphalt-500 mt-1">IoT sensors monitoring vibration and motion activity in registered zones.</p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="p-3.5 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200/60 dark:border-asphalt-800/60 rounded-lg">
                <p className="text-[10px] text-asphalt-450 uppercase font-bold tracking-wider">Status</p>
                <p className="text-lg font-black text-parking-accent mt-0.5">Secure</p>
              </div>
              <div className="p-3.5 bg-asphalt-50 dark:bg-asphalt-900 border border-asphalt-200/60 dark:border-asphalt-800/60 rounded-lg">
                <p className="text-[10px] text-asphalt-450 uppercase font-bold tracking-wider">Anomaly Score</p>
                <p className="text-lg font-black text-parking-primary mt-0.5">0.0%</p>
              </div>
            </div>
          </div>
          <div className="hidden sm:block w-px bg-asphalt-200 dark:bg-asphalt-800"></div>
          <div className="flex-1 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-asphalt-450 uppercase tracking-widest">Model Specifications</h4>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs text-asphalt-700 dark:text-asphalt-300 font-medium">
                  <Activity className="w-4 h-4 text-parking-accent" />
                  <span>Isolation Forest Anomaly Check v2.0</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-asphalt-700 dark:text-asphalt-300 font-medium">
                  <AlertCircle className="w-4 h-4 text-parking-primary" />
                  <span>Real-time Vibration CCTV Link</span>
                </div>
              </div>
            </div>
            <button className="btn-primary py-2.5 text-xs w-full shadow-none font-bold">
              Enable Remote Lock
            </button>
          </div>
        </motion.div>

        {/* User Score Card - Asphalt Slate theme instead of indigo gradient */}
        <motion.div whileHover={{ y: -2 }} className="glass-card p-6 bg-asphalt-900 text-white border-none shadow-soft flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-asphalt-800 border border-asphalt-750 text-white rounded-lg">
                <BarChart3 className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-1 bg-white/10 text-white border border-white/15 rounded-full text-xs font-bold tracking-tight">Driver Tier</span>
            </div>
            <h3 className="text-xl font-bold tracking-tight">ParkScore™: {data.score?.overallScore || 850}</h3>
            <p className="text-xs text-asphalt-300 mt-1">You are in the top 4% of drivers this week!</p>
          </div>
          
          <div className="my-5 space-y-3">
            <div className="relative h-2 bg-asphalt-800 rounded-full overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-parking-surge rounded-full" style={{ width: `${data.score?.overallScore || 85}%` }}></div>
            </div>
            <div className="flex justify-between text-[9px] font-bold text-asphalt-400 uppercase tracking-widest">
              <span>Bronze</span>
              <span>Silver</span>
              <span>Gold</span>
              <span className="text-parking-surge">Platinum</span>
            </div>
          </div>
          
          <div className="p-3 bg-asphalt-850 rounded-lg flex items-start gap-2.5 border border-asphalt-800">
            <MessageSquare className="w-4 h-4 text-parking-surge mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-asphalt-300 font-medium leading-relaxed">"{data.score?.aiInsight || 'Your parking behavior is highly optimal.'}"</p>
          </div>
        </motion.div>

      </div>
    </div>
  );
};

export default AIInsights;
