import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getAllPartnerStats, fmt } from '../lib/calculations'
import Modal from '../components/Modal'

// ── Reinvest Modal ──────────────────────────────────────────
function ReinvestModal({ partner, onClose, onSuccess }) {
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const max = partner.availableProfit

  async function handleSubmit(e) {
    e.preventDefault()
    const val = parseFloat(amount)
    if (!val || val <= 0) return setError('Enter a valid amount')
    if (val > max) return setError(`Max available: ${fmt(max)}`)

    setLoading(true)
    setError('')
    try {
      // Insert into ledger as reinvestment
      const { data: ledgerRow, error: ledgerErr } = await supabase
        .from('ledger')
        .insert({ partner_id: partner.id, type: 'reinvestment', amount: val, date: new Date().toISOString().split('T')[0], notes: 'Reinvested from profit' })
        .select()
        .single()

      if (ledgerErr) throw ledgerErr

      // Also insert into reinvestments table (without trade link — general reinvest)
      await supabase.from('reinvestments').insert({
        ledger_id: ledgerRow.id,
        partner_id: partner.id,
        amount: val,
        date: new Date().toISOString().split('T')[0],
        notes: 'General profit reinvestment',
      })

      onSuccess()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title={`Reinvest — ${partner.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-dark-700 rounded-xl p-4 flex justify-between items-center">
          <span className="text-sm text-gray-400">Available Profit</span>
          <span className="font-bold text-emerald-400">{fmt(max)}</span>
        </div>

        <div>
          <label className="label">Amount to Reinvest</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0.01"
            max={max}
            placeholder={`Max ${fmt(max)}`}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setAmount(max.toFixed(2))}
            className="text-xs text-accent-400 hover:text-accent-300 mt-1 transition-colors"
          >
            Use max ({fmt(max)})
          </button>
        </div>

        {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {loading ? <span className="animate-spin">↻</span> : '🔄'}
            {loading ? 'Processing...' : 'Reinvest'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Withdraw Modal ──────────────────────────────────────────
function WithdrawModal({ partner, onClose, onSuccess }) {
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const max = partner.availableProfit

  async function handleSubmit(e) {
    e.preventDefault()
    const val = parseFloat(amount)
    if (!val || val <= 0) return setError('Enter a valid amount')
    if (val > max) return setError(`Max available: ${fmt(max)}`)

    setLoading(true)
    setError('')
    try {
      const { error: err } = await supabase.from('ledger').insert({
        partner_id: partner.id,
        type: 'withdraw_profit',
        amount: val,
        date: new Date().toISOString().split('T')[0],
        notes: 'Profit withdrawal',
      })
      if (err) throw err
      onSuccess()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title={`Withdraw — ${partner.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-dark-700 rounded-xl p-4 flex justify-between items-center">
          <span className="text-sm text-gray-400">Available Profit</span>
          <span className="font-bold text-emerald-400">{fmt(max)}</span>
        </div>

        <div>
          <label className="label">Amount to Withdraw</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0.01"
            max={max}
            placeholder={`Max ${fmt(max)}`}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setAmount(max.toFixed(2))}
            className="text-xs text-accent-400 hover:text-accent-300 mt-1 transition-colors"
          >
            Withdraw all ({fmt(max)})
          </button>
        </div>

        {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {loading ? <span className="animate-spin">↻</span> : '↑'}
            {loading ? 'Processing...' : 'Withdraw'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Partner Card ────────────────────────────────────────────
function PartnerCard({ stats, onReinvest, onWithdraw }) {
  const profit = stats.availableProfit
  const isNegative = profit < 0

  return (
    <div className="card flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${stats.isWasif ? 'bg-accent-500/20 text-accent-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {stats.name.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-gray-100">{stats.name}</p>
            <p className="text-xs text-gray-500">{stats.profit_share_percent}% profit share</p>
          </div>
        </div>
        {stats.isWasif && (
          <span className="badge bg-accent-500/20 text-accent-400 border border-accent-500/30">Trader</span>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-dark-700 rounded-xl p-3">
          <p className="stat-label">Capital</p>
          <p className="stat-value text-base">{fmt(stats.capital)}</p>
        </div>
        <div className="bg-dark-700 rounded-xl p-3">
          <p className="stat-label">Total Earned</p>
          <p className={`stat-value text-base ${stats.earnedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmt(stats.earnedProfit)}
          </p>
        </div>
        <div className="bg-dark-700 rounded-xl p-3">
          <p className="stat-label">Withdrawn</p>
          <p className="stat-value text-base text-amber-400">{fmt(stats.totalWithdrawn)}</p>
        </div>
        <div className="bg-dark-700 rounded-xl p-3">
          <p className="stat-label">Reinvested</p>
          <p className="stat-value text-base text-cyan-400">{fmt(stats.totalReinvested)}</p>
        </div>
      </div>

      {/* Available Profit */}
      <div className={`rounded-xl p-4 border ${isNegative ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">Available to Withdraw</p>
          <p className={`text-xl font-bold ${isNegative ? 'text-red-400' : 'text-emerald-400'}`}>
            {fmt(profit)}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onReinvest(stats)}
          disabled={profit <= 0}
          className="flex-1 btn-profit disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          🔄 Reinvest
        </button>
        <button
          onClick={() => onWithdraw(stats)}
          disabled={profit <= 0}
          className="flex-1 btn-warning disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          ↑ Withdraw
        </button>
      </div>
    </div>
  )
}

// ── Recent Trades Mini List ─────────────────────────────────
function RecentTrades({ trades }) {
  const navigate = useNavigate()

  if (!trades.length) {
    return (
      <div className="card text-center py-12">
        <p className="text-4xl mb-3">⚡</p>
        <p className="text-gray-400 font-medium">No trades yet</p>
        <p className="text-gray-600 text-sm mt-1">Log your first trade to get started</p>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-200">Recent Trades</h3>
        <button onClick={() => navigate('/trades')} className="text-xs text-accent-400 hover:text-accent-300 transition-colors">
          View all →
        </button>
      </div>
      <div className="space-y-2">
        {trades.map(trade => {
          const isProfit = parseFloat(trade.profit_loss) >= 0
          return (
            <div key={trade.id} className="flex items-center justify-between py-3 border-b border-dark-600 last:border-0">
              <div>
                <p className="text-sm text-gray-300 font-medium">
                  {new Date(trade.trade_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
                {trade.notes && <p className="text-xs text-gray-600 mt-0.5 truncate max-w-48">{trade.notes}</p>}
              </div>
              <span className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                {isProfit ? '+' : ''}{fmt(trade.profit_loss)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Dashboard Page ──────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const [partnerStats, setPartnerStats] = useState([])
  const [recentTrades, setRecentTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [reinvestTarget, setReinvestTarget] = useState(null)
  const [withdrawTarget, setWithdrawTarget] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: partners }, { data: ledger }, { data: distributions }, { data: trades }] = await Promise.all([
        supabase.from('partners').select('*').eq('status', 'active').order('created_at'),
        supabase.from('ledger').select('*'),
        supabase.from('trade_distributions').select('*'),
        supabase.from('trades').select('*').order('trade_date', { ascending: false }).limit(8),
      ])

      setPartnerStats(getAllPartnerStats(partners || [], distributions || [], ledger || []))
      setRecentTrades(trades || [])
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const totalCapital = partnerStats.reduce((s, p) => s + p.capital, 0)
  const totalProfit = partnerStats.reduce((s, p) => s + p.earnedProfit, 0)
  const totalPortfolio = totalCapital + totalProfit

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-400">
          <span className="animate-spin text-2xl">↻</span>
          <span>Loading portfolio...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Portfolio Overview</h1>
          <p className="text-gray-500 text-sm mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button onClick={() => navigate('/trades')} className="btn-primary flex items-center gap-2">
          ⚡ Log Trade
        </button>
      </div>

      {/* Total Portfolio Banner */}
      <div className="card bg-gradient-to-r from-dark-800 to-dark-700 border-accent-500/30">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <p className="stat-label">Total Portfolio</p>
            <p className="text-3xl font-bold text-gray-100 mt-2">{fmt(totalPortfolio)}</p>
          </div>
          <div>
            <p className="stat-label">Total Capital</p>
            <p className="text-3xl font-bold text-gray-100 mt-2">{fmt(totalCapital)}</p>
          </div>
          <div>
            <p className="stat-label">Total Profit Earned</p>
            <p className={`text-3xl font-bold mt-2 ${totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalProfit >= 0 ? '+' : ''}{fmt(totalProfit)}
            </p>
          </div>
        </div>
      </div>

      {/* Partner Cards */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Partner Accounts</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {partnerStats.map(stats => (
            <PartnerCard
              key={stats.id}
              stats={stats}
              onReinvest={setReinvestTarget}
              onWithdraw={setWithdrawTarget}
            />
          ))}
        </div>
      </div>

      {/* Recent Trades */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Recent Activity</h2>
        <RecentTrades trades={recentTrades} />
      </div>

      {/* Modals */}
      {reinvestTarget && (
        <ReinvestModal
          partner={reinvestTarget}
          onClose={() => setReinvestTarget(null)}
          onSuccess={fetchData}
        />
      )}
      {withdrawTarget && (
        <WithdrawModal
          partner={withdrawTarget}
          onClose={() => setWithdrawTarget(null)}
          onSuccess={fetchData}
        />
      )}
    </div>
  )
}
