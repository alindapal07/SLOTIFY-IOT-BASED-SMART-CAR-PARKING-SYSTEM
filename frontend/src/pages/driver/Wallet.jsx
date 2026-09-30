import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, TrendingUp, Gift, AlertTriangle, CreditCard, Loader2 } from 'lucide-react';
import { useI18n } from '../../i18n/index.jsx';
import api from '../../services/api';

const WalletPage = () => {
  const { user, updateWalletBalance } = useStore();
  const { t } = useI18n();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topupAmount, setTopupAmount] = useState(500);
  const [topupLoading, setTopupLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [walletRes, txRes] = await Promise.all([
          api.get('/wallet'),
          api.get('/wallet/transactions')
        ]);
        setWallet(walletRes.data);
        setTransactions(txRes.data || []);
        updateWalletBalance(walletRes.data.balance);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleTopUp = async () => {
    if (topupAmount <= 0) return;
    setTopupLoading(true);
    try {
      const { data } = await api.post('/wallet/topup', { amount: topupAmount });
      setWallet({ ...wallet, balance: data.balance });
      updateWalletBalance(data.balance);
      const txRes = await api.get('/wallet/transactions');
      setTransactions(txRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setTopupLoading(false);
    }
  };

  const getCategoryIcon = (cat) => {
    switch(cat) {
      case 'booking_payment': return <ArrowUpRight className="w-4 h-4" />;
      case 'fine': return <AlertTriangle className="w-4 h-4" />;
      case 'refund': return <ArrowDownLeft className="w-4 h-4" />;
      case 'topup': return <CreditCard className="w-4 h-4" />;
      case 'reward': return <Gift className="w-4 h-4" />;
      case 'provider_earning': return <TrendingUp className="w-4 h-4" />;
      default: return <ArrowUpRight className="w-4 h-4" />;
    }
  };

  const getCategoryBadge = (type) =>
    type === 'credit'
      ? 'badge-emerald'
      : 'badge-red';

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-2 sm:px-4">
      <div className="border-b border-asphalt-200 dark:border-asphalt-800 py-2">
        <h1 className="text-3xl font-black text-asphalt-900 dark:text-white tracking-tight">{t('wallet.title')}</h1>
        <p className="text-sm text-asphalt-500 dark:text-asphalt-400 mt-1">{t('wallet.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Balance Card - Refactored to Solid Asphalt Slate Color instead of gradient */}
        <motion.div 
          initial={{opacity:0,y:10}} 
          animate={{opacity:1,y:0}} 
          className="md:col-span-2 glass-card p-6 bg-asphalt-900 text-white border-none flex flex-col justify-between h-48 shadow-soft"
        >
          <div className="flex justify-between items-start">
            <div className="bg-asphalt-800 p-2.5 rounded-lg border border-asphalt-700/50">
              <WalletIcon className="w-6 h-6 text-white" />
            </div>
            <span className="px-2.5 py-1 bg-white/10 text-white border border-white/10 rounded-full text-xs font-bold uppercase tracking-wider">
              {t('wallet.activeBalance')}
            </span>
          </div>
          <div>
            <p className="text-xs text-asphalt-300 font-semibold uppercase tracking-wider">{t('wallet.totalAvailable')}</p>
            <h2 className="text-4xl font-extrabold font-mono tracking-tight mt-1.5 flex items-center gap-2">
              {loading ? <Loader2 className="w-8 h-8 animate-spin text-white/55" /> : `₹${wallet?.balance?.toLocaleString() || '0'}`}
              <span className="text-sm text-asphalt-400 font-normal">{wallet?.currency || 'INR'}</span>
            </h2>
          </div>
        </motion.div>

        {/* Top-up Form Panel */}
        <motion.div 
          initial={{opacity:0,scale:0.98}} 
          animate={{opacity:1,scale:1}} 
          transition={{delay:0.1}} 
          className="glass-card p-6 flex flex-col justify-between gap-4 border border-asphalt-200 dark:border-asphalt-800"
        >
          <div>
            <h3 className="font-bold text-sm uppercase tracking-wider text-asphalt-500 mb-3">Add Funds</h3>
            <div className="flex gap-2">
              {[500, 1000, 2000].map(amt => (
                <button 
                  key={amt} 
                  onClick={() => setTopupAmount(amt)} 
                  className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${topupAmount === amt ? 'bg-parking-primary text-white' : 'bg-asphalt-100 dark:bg-asphalt-900 text-asphalt-750 dark:text-asphalt-200 hover:bg-asphalt-200 dark:hover:bg-asphalt-800'}`}
                >
                  ₹{amt}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <input 
                type="number" 
                min={100}
                value={topupAmount} 
                onChange={(e) => setTopupAmount(parseInt(e.target.value) || 0)} 
                className="form-input text-center font-bold text-lg" 
                placeholder="Enter custom amount"
              />
            </div>
          </div>
          <button 
            onClick={handleTopUp} 
            disabled={topupLoading || topupAmount <= 0} 
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 text-sm shadow-none"
          >
            {topupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t('wallet.addFunds')}
          </button>
        </motion.div>
      </div>

      {/* Transactions Table Layout */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-asphalt-850 dark:text-white tracking-tight">{t('wallet.recentTransactions')}</h3>
        <div className="glass-card p-0">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-parking-primary" /></div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center text-asphalt-500 text-sm">
              <WalletIcon className="w-8 h-8 mx-auto mb-2 text-asphalt-350" />
              {t('wallet.noTransactions')}
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-asphalt-200 dark:border-asphalt-800 bg-asphalt-50 dark:bg-asphalt-900/40">
                    <th className="py-3 px-4 font-bold text-asphalt-600 dark:text-asphalt-400 text-xs uppercase tracking-wider w-10">Type</th>
                    <th className="py-3 px-4 font-bold text-asphalt-600 dark:text-asphalt-400 text-xs uppercase tracking-wider">Description</th>
                    <th className="py-3 px-4 font-bold text-asphalt-600 dark:text-asphalt-400 text-xs uppercase tracking-wider">Date & Time</th>
                    <th className="py-3 px-4 font-bold text-asphalt-600 dark:text-asphalt-400 text-xs uppercase tracking-wider">Amount</th>
                    <th className="py-3 px-4 font-bold text-asphalt-600 dark:text-asphalt-400 text-xs uppercase tracking-wider">Balance After</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, i) => (
                    <tr key={tx._id || i} className="border-b border-asphalt-100 dark:border-asphalt-800 last:border-0 hover:bg-asphalt-50/50 dark:hover:bg-asphalt-900/20 transition-colors">
                      <td className="py-3 px-4">
                        <span className={`status-chip text-[10px] inline-flex items-center justify-center p-1.5 ${getCategoryBadge(tx.type)}`}>
                          {getCategoryIcon(tx.category)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-asphalt-850 dark:text-white text-sm">{tx.description}</td>
                      <td className="py-3.5 px-4 text-xs text-asphalt-450">{new Date(tx.createdAt).toLocaleString()}</td>
                      <td className={`py-3.5 px-4 font-bold font-mono ${tx.type === 'credit' ? 'text-green-600 dark:text-green-400' : 'text-asphalt-850 dark:text-white'}`}>
                        {tx.type === 'credit' ? '+' : '-'}₹{tx.amount}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono text-asphalt-400">₹{tx.balanceAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WalletPage;
