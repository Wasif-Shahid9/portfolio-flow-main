import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { calculateTradeDistributions, enrichDistributionsWithReinvestStatus, getAllPartnerStats, fmt, fmtPct } from '../lib/calculations'
import Modal from '../components/Modal'

function AddTradeModal({ onClose, onSuccess, partners, ledger }) {
  const [profitLoss, setProfitLoss] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [preview, setPreview] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const val = parseFloat(profitLoss)
    if (isNaN(val) || !partners.length) { setPreview([]); return }
    const dists = calculateTradeDistributions(val, partners, ledger, date)
    const wasif = partners.find(p => parseFloat(p.profit_share_percent) === 100)
    const enriched = dists.map(d => {
      const partner = partners.find(p => p.id === d.partner_id)
      const isWasif = wasif && d.partner_id === wasif.id
      let display = d.partner_net
      if (isWasif) {
        const fees = dists.filter(x => x.partner_id !== wasif.id).reduce((s, x) => s + parseFloat(x.trader_fee), 0)
        display = d.partner_net + fees
      }
      return { ...d, partnerName: partner?.name, displayAmount: display, isWasif }
    })
    setPreview(enriched)
  }, [profitLoss, date, partners, ledger])

  async function handleSubmit(e) {
    e.preventDefault()
    const val = parseFloat(profitLoss)
    if (isNaN(val)) return setError('Enter a valid profit/loss amount')
    if (!partners.length) return setError('No active partners found')
    setLoading(true); setError('')
    try {
      const { data: trade, error: tErr } = await supabase
        .from('trades').insert({ trade_date: date, profit_loss: val, notes: notes || null }).select().single()
      if (tErr) throw tErr
      const distributions = calculateTradeDistributions(val, partners, ledger, date)
      if (distributions.length > 0) {
        const { error: dErr } = await supabase.from('trade_distributions').insert(distributions.map(d => ({ trade_id: trade.id, ...d })))
        if (dErr) throw dErr
      }
      onSuccess(); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const isProfit = parseFloat(profitLoss) > 0
  const isLoss = parseFloat(profitLoss) < 0

  return (
    <Modal title="Log New Trade" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Profit / Loss ($)</label>
            <input
              className={`input ${isProfit ? 'border-emerald-500/50 focus:border-emerald-500' : isLoss ? 'border-red-500/50 focus:border-red-500' : ''}`}
              type="number" step="0.01" placeholder="+10.00 or -5.00"
              value={profitLoss} onChange={e => setProfitLoss(e.target.value)} required
            />
          </div>
          <div>
            <label className="label">Date</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <input className="input" placeholder="Quick note about this trade" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        {preview.length > 0 && (
          <div className="bg-dark-700 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">Distribution Preview</p>
            <div className="space-y-2">
              {preview.map(d => (
                <div key={d.partner_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${d.isWasif ? 'bg-accent-500/20 text-accent-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      {d.partnerName?.charAt(0)}
                    </div>
                    <span className="text-sm text-gray-300">{d.partnerName}</span>
                    <span className="text-xs text-gray-600">{fmtPct(d.capital_ratio)} capital</span>
                  </div>
                  <span className={`font-semibold text-sm ${d.displayAmount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {d.displayAmount >= 0 ? '+' : ''}{fmt(d.displayAmount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Saving...' : 'Log Trade'}</button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteTradeModal({ trade, reinvestments, allDistributions, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const tradeDists = allDistributions.filter(d => d.trade_id === trade.id)
  const linkedReinvestments = reinvestments.filter(r => tradeDists.some(d => d.id === r.trade_distribution_id))
  const hasReinvestments = linkedReinvestments.length > 0
  const isProfit = parseFloat(trade.profit_loss) >= 0

  async function handleDelete() {
    setLoading(true); setError('')
    try {
      if (hasReinvestments) {
        const ledgerIds = linkedReinvestments.map(r => r.ledger_id)
        await supabase.from('reinvestments').delete().in('trade_distribution_id', tradeDists.map(d => d.id))
        if (ledgerIds.length > 0) await supabase.from('ledger').delete().in('id', ledgerIds)
      }
      const { error: err } = await supabase.from('trades').delete().eq('id', trade.id)
      if (err) throw err
      onSuccess(); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <Modal title="Delete Trade" onClose={onClose} size="sm">
      <div className="space-y-4">
        <div className="bg-dark-700 rounded-xl p-4 flex justify-between items-center">
          <span className="text-sm text-gray-400">
            {new Date(trade.trade_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            {trade.notes && <span className="block text-xs text-gray-600 mt-0.5">{trade.notes}</span>}
          </span>
          <span className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
            {isProfit ? '+' : ''}{fmt(trade.profit_loss)}
          </span>
        </div>
        {hasReinvestments ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-300">
            Warning: {linkedReinvestments.length} reinvestment(s) from this trade will also be reversed automatically.
          </div>
        ) : (
          <p className="text-gray-400 text-sm">This will permanently delete the trade and all its profit distributions. Cannot be undone.</p>
        )}
        {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleDelete} disabled={loading}
            className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 font-medium px-4 py-2 rounded-lg text-sm transition-colors">
            {loading ? 'Deleting...' : 'Delete Trade'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function TradeReinvestModal({ distribution, partnerName, maxAmount, onClose, onSuccess }) {
  const [amount, setAmount] = useState(maxAmount.toFixed(2))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const val = parseFloat(amount)
    if (!val || val <= 0) return setError('Enter a valid amount')
    if (val > maxAmount) return setError(`Max: ${fmt(maxAmount)}`)
    setLoading(true)
    try {
      const { data: ledgerRow, error: lErr } = await supabase.from('ledger')
        .insert({ partner_id: distribution.partner_id, type: 'reinvestment', amount: val, date: new Date().toISOString().split('T')[0], notes: 'Reinvested from trade' })
        .select().single()
      if (lErr) throw lErr
      const { error: rErr } = await supabase.from('reinvestments').insert({
        ledger_id: ledgerRow.id, trade_distribution_id: distribution.id,
        partner_id: distribution.partner_id, amount: val,
        date: new Date().toISOString().split('T')[0], notes: 'Reinvested from trade'
      })
      if (rErr) throw rErr
      onSuccess(); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <Modal title={`Reinvest - ${partnerName}`} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-dark-700 rounded-xl p-3 flex justify-between">
          <span className="text-sm text-gray-400">Trade profit</span>
          <span className="font-bold text-emerald-400">{fmt(maxAmount)}</span>
        </div>
        <div>
          <label className="label">Amount to Reinvest</label>
          <input className="input" type="number" step="0.01" min="0.01" max={maxAmount} value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? '...' : 'Reinvest'}</button>
        </div>
      </form>
    </Modal>
  )
}

function TradeWithdrawModal({ distribution, partnerName, availableProfit, onClose, onSuccess }) {
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const val = parseFloat(amount)
    if (!val || val <= 0) return setError('Enter a valid amount')
    if (val > availableProfit) return setError(`Max available: ${fmt(availableProfit)}`)
    setLoading(true)
    try {
      const { error: err } = await supabase.from('ledger').insert({
        partner_id: distribution.partner_id, type: 'withdraw_profit',
        amount: val, date: new Date().toISOString().split('T')[0], notes: 'Withdrawal'
      })
      if (err) throw err
      onSuccess(); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <Modal title={`Withdraw - ${partnerName}`} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-dark-700 rounded-xl p-3 flex justify-between">
          <span className="text-sm text-gray-400">Total available profit</span>
          <span className="font-bold text-emerald-400">{fmt(availableProfit)}</span>
        </div>
        <div>
          <label className="label">Amount to Withdraw</label>
          <input className="input" type="number" step="0.01" min="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
          <button type="button" onClick={() => setAmount(availableProfit.toFixed(2))} className="text-xs text-accent-400 mt-1 hover:text-accent-300 transition-colors">
            Withdraw all ({fmt(availableProfit)})
          </button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? '...' : 'Withdraw'}</button>
        </div>
      </form>
    </Modal>
  )
}

function TradeCard({ trade, allDistributions, reinvestments, partners, partnerStats, onAction, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const isProfit = parseFloat(trade.profit_loss) >= 0
  const tradeDists = allDistributions.filter(d => d.trade_id === trade.id)
  const enriched = enrichDistributionsWithReinvestStatus(tradeDists, reinvestments, partners)
  const wasif = partners.find(p => parseFloat(p.profit_share_percent) === 100)

  const getDisplayAmount = (dist) => {
    if (wasif && dist.partner_id === wasif.id) {
      const fees = tradeDists.filter(d => d.partner_id !== wasif.id).reduce((s, d) => s + parseFloat(d.trader_fee), 0)
      return parseFloat(dist.partner_net) + fees
    }
    return parseFloat(dist.partner_net)
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${isProfit ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
            {isProfit ? '?' : '?'}
          </div>
          <div>
            <p className="font-semibold text-gray-100">
              {new Date(trade.trade_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            {trade.notes && <p className="text-xs text-gray-500 mt-0.5">{trade.notes}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xl font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
            {isProfit ? '+' : ''}{fmt(trade.profit_loss)}
          </span>
          <button onClick={() => setExpanded(v => !v)} className="btn-secondary text-xs px-3">
            {expanded ? 'Hide' : 'Details'}
          </button>
          <button
            onClick={() => onDelete(trade)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors border border-dark-500 hover:border-red-400/30"
            title="Delete"
          >X</button>
        </div>
      </div>

      {expanded && (
        <div className="mt-5 pt-5 border-t border-dark-600">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-4">Profit Distribution</p>
          <div className="space-y-3">
            {enriched.map(dist => {
              const displayAmt = getDisplayAmount(dist)
              const partnerStat = partnerStats.find(s => s.id === dist.partner_id)
              const availableProfit = partnerStat?.availableProfit || 0
              return (
                <div key={dist.id} className="bg-dark-700 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${wasif && dist.partner_id === wasif.id ? 'bg-accent-500/20 text-accent-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {dist.partnerName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-200">{dist.partnerName}</span>
                          <span className="text-xs text-gray-600">{fmtPct(dist.capital_ratio)} pool</span>
                          {dist.isReinvested && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                              Reinvested {dist.reinvestedAmount > 0 ? fmt(dist.reinvestedAmount) : ''}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          Capital: {fmt(dist.capital_snapshot)} · Gross: {fmt(dist.gross_amount)}
                          {parseFloat(dist.trader_fee) > 0 && ` · Fee to Wasif: ${fmt(dist.trader_fee)}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <span className={`font-bold ${displayAmt >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {displayAmt >= 0 ? '+' : ''}{fmt(displayAmt)}
                      </span>
                      {displayAmt > 0 && (
                        <div className="flex gap-1.5">
                          {!dist.isReinvested && (
                            <button onClick={() => onAction('reinvest', dist, dist.partnerName, displayAmt, availableProfit)} className="btn-profit text-xs px-2 py-1">
                              Reinvest
                            </button>
                          )}
                          <button onClick={() => onAction('withdraw', dist, dist.partnerName, displayAmt, availableProfit)} className="btn-warning text-xs px-2 py-1">
                            Withdraw
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Trades() {
  const [trades, setTrades] = useState([])
  const [distributions, setDistributions] = useState([])
  const [reinvestments, setReinvestments] = useState([])
  const [partners, setPartners] = useState([])
  const [ledger, setLedger] = useState([])
  const [partnerStats, setPartnerStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [actionModal, setActionModal] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: t }, { data: d }, { data: r }, { data: p }, { data: l }] = await Promise.all([
      supabase.from('trades').select('*').order('trade_date', { ascending: false }),
      supabase.from('trade_distributions').select('*'),
      supabase.from('reinvestments').select('*'),
      supabase.from('partners').select('*').eq('status', 'active').order('created_at'),
      supabase.from('ledger').select('*'),
    ])
    setTrades(t || [])
    setDistributions(d || [])
    setReinvestments(r || [])
    setPartners(p || [])
    setLedger(l || [])
    setPartnerStats(getAllPartnerStats(p || [], d || [], l || []))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function handleAction(type, dist, partnerName, tradeAmount, availableProfit) {
    setActionModal({ type, dist, partnerName, tradeAmount, availableProfit })
  }

  const totalProfit = trades.reduce((s, t) => s + parseFloat(t.profit_loss), 0)
  const profitTrades = trades.filter(t => parseFloat(t.profit_loss) > 0).length
  const lossTrades = trades.filter(t => parseFloat(t.profit_loss) < 0).length

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <span className="animate-spin text-2xl mr-3">+</span> Loading trades...
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Trade Log</h1>
          <p className="text-gray-500 text-sm mt-1">{trades.length} trades · {profitTrades} profitable · {lossTrades} losses</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">Log Trade</button>
      </div>

      {trades.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card-sm text-center">
            <p className="stat-label">Total P&L</p>
            <p className={`text-xl font-bold mt-1 ${totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(totalProfit)}</p>
          </div>
          <div className="card-sm text-center">
            <p className="stat-label">Win Rate</p>
            <p className="text-xl font-bold mt-1 text-gray-100">{trades.length ? ((profitTrades / trades.length) * 100).toFixed(0) : 0}%</p>
          </div>
          <div className="card-sm text-center">
            <p className="stat-label">Total Trades</p>
            <p className="text-xl font-bold mt-1 text-gray-100">{trades.length}</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {trades.map(trade => (
          <TradeCard key={trade.id} trade={trade} allDistributions={distributions}
            reinvestments={reinvestments} partners={partners} partnerStats={partnerStats}
            onAction={handleAction} onDelete={setDeleteTarget} />
        ))}
        {trades.length === 0 && (
          <div className="card text-center py-16">
            <p className="text-gray-400 font-medium text-lg">No trades logged yet</p>
            <button onClick={() => setShowAdd(true)} className="btn-primary mt-4">Log First Trade</button>
          </div>
        )}
      </div>

      {showAdd && <AddTradeModal onClose={() => setShowAdd(false)} onSuccess={fetchData} partners={partners} ledger={ledger} />}
      {deleteTarget && <DeleteTradeModal trade={deleteTarget} reinvestments={reinvestments} allDistributions={distributions} onClose={() => setDeleteTarget(null)} onSuccess={fetchData} />}
      {actionModal?.type === 'reinvest' && <TradeReinvestModal distribution={actionModal.dist} partnerName={actionModal.partnerName} maxAmount={actionModal.tradeAmount} onClose={() => setActionModal(null)} onSuccess={fetchData} />}
      {actionModal?.type === 'withdraw' && <TradeWithdrawModal distribution={actionModal.dist} partnerName={actionModal.partnerName} availableProfit={actionModal.availableProfit} onClose={() => setActionModal(null)} onSuccess={fetchData} />}
    </div>
  )
}
