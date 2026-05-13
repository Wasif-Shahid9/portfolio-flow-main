import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getAllPartnerStats, fmt } from '../lib/calculations'
import Modal from '../components/Modal'

function AddPartnerModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ name: '', profitShare: '50', initialInvestment: '', investmentDate: new Date().toISOString().split('T')[0], notes: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  function set(key, val) { setForm(prev => ({ ...prev, [key]: val })) }
  async function handleSubmit(e) {
    e.preventDefault()
    const share = parseFloat(form.profitShare)
    const investment = parseFloat(form.initialInvestment)
    if (!form.name.trim()) return setError('Name is required')
    if (isNaN(share) || share < 0 || share > 100) return setError('Profit share must be 0-100')
    if (isNaN(investment) || investment <= 0) return setError('Initial investment must be > 0')
    setLoading(true); setError('')
    try {
      const { data: partner, error: pErr } = await supabase.from('partners').insert({ name: form.name.trim(), profit_share_percent: share, notes: form.notes }).select().single()
      if (pErr) throw pErr
      const { error: lErr } = await supabase.from('ledger').insert({ partner_id: partner.id, type: 'investment', amount: investment, date: form.investmentDate, notes: 'Initial investment' })
      if (lErr) throw lErr
      onSuccess(); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  const traderFee = 100 - (parseFloat(form.profitShare) || 0)
  return (
    <Modal title="Add New Partner" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><label className="label">Partner Name</label><input className="input" placeholder="e.g. Ali" value={form.name} onChange={e => set('name', e.target.value)} required /></div>
        <div>
          <label className="label">Profit Share %</label>
          <input className="input" type="number" min="0" max="100" step="0.01" value={form.profitShare} onChange={e => set('profitShare', e.target.value)} />
          <p className="text-xs text-gray-500 mt-1.5">Partner keeps <span className="text-accent-400 font-medium">{form.profitShare}%</span>. Wasif earns <span className="text-emerald-400 font-medium">{isNaN(traderFee) ? '-' : traderFee.toFixed(2)}%</span> as trader fee.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Initial Investment ($)</label><input className="input" type="number" min="0.01" step="0.01" placeholder="0.00" value={form.initialInvestment} onChange={e => set('initialInvestment', e.target.value)} required /></div>
          <div><label className="label">Investment Date</label><input className="input" type="date" value={form.investmentDate} onChange={e => set('investmentDate', e.target.value)} required /></div>
        </div>
        <div><label className="label">Notes (optional)</label><input className="input" placeholder="Any notes" value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
        {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Adding...' : 'Add Partner'}</button>
        </div>
      </form>
    </Modal>
  )
}

function AddInvestmentModal({ partner, onClose, onSuccess }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function handleSubmit(e) {
    e.preventDefault()
    const val = parseFloat(amount)
    if (!val || val <= 0) return setError('Enter a valid amount')
    setLoading(true)
    try {
      const { error: err } = await supabase.from('ledger').insert({ partner_id: partner.id, type: 'investment', amount: val, date, notes: notes || 'Top-up investment' })
      if (err) throw err
      onSuccess(); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  return (
    <Modal title={`Add Investment - ${partner.name}`} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><label className="label">Amount ($)</label><input className="input" type="number" step="0.01" min="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required /></div>
        <div><label className="label">Date</label><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><label className="label">Notes (optional)</label><input className="input" placeholder="e.g. Top-up investment" value={notes} onChange={e => setNotes(e.target.value)} /></div>
        {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Adding...' : 'Add Investment'}</button>
        </div>
      </form>
    </Modal>
  )
}

function EditLedgerModal({ entry, onClose, onSuccess }) {
  const [amount, setAmount] = useState(parseFloat(entry.amount).toFixed(2))
  const [date, setDate] = useState(entry.date)
  const [notes, setNotes] = useState(entry.notes || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const typeLabels = { investment: 'Investment', reinvestment: 'Reinvestment', withdraw_profit: 'Profit Withdrawal', withdraw_capital: 'Capital Withdrawal' }
  async function handleSubmit(e) {
    e.preventDefault()
    const val = parseFloat(amount)
    if (!val || val <= 0) return setError('Amount must be greater than 0')
    setLoading(true); setError('')
    try {
      const { error: err } = await supabase.from('ledger').update({ amount: val, date, notes: notes || null }).eq('id', entry.id)
      if (err) throw err
      onSuccess(); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  async function handleDelete() {
    if (!window.confirm('Delete this entry? This cannot be undone.')) return
    setLoading(true); setError('')
    try {
      if (entry.type === 'reinvestment') {
        await supabase.from('reinvestments').delete().eq('ledger_id', entry.id)
      }
      const { error: err } = await supabase.from('ledger').delete().eq('id', entry.id)
      if (err) throw err
      onSuccess(); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  return (
    <Modal title={`Edit - ${typeLabels[entry.type] || entry.type}`} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-xs text-amber-400">
          Editing capital entries affects profit calculations for all trades after this date.
        </div>
        <div><label className="label">Amount ($)</label><input className="input" type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} required /></div>
        <div><label className="label">Date</label><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><label className="label">Notes</label><input className="input" placeholder="Optional note" value={notes} onChange={e => setNotes(e.target.value)} /></div>
        {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={handleDelete} disabled={loading} className="px-3 py-2 rounded-lg text-sm border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">Delete</button>
          <div className="flex-1 flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function ExitPartnerModal({ partner, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false)
  async function handleExit() {
    setLoading(true)
    await supabase.from('partners').update({ status: 'exited', exit_date: new Date().toISOString().split('T')[0] }).eq('id', partner.id)
    onSuccess(); onClose()
  }
  return (
    <Modal title="Mark Partner as Exited" onClose={onClose} size="sm">
      <div className="space-y-4">
        <p className="text-gray-300">Mark <strong className="text-white">{partner.name}</strong> as exited? History preserved, removed from future trades.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleExit} disabled={loading} className="flex-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-600/30 font-medium px-4 py-2 rounded-lg text-sm transition-colors">
            {loading ? 'Processing...' : 'Mark as Exited'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function DeletePartnerModal({ partner, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState('')
  async function handleDelete() {
    if (confirmed.toLowerCase() !== partner.name.toLowerCase()) return setError('Name does not match')
    setLoading(true); setError('')
    try {
      const { data: reinvestLedger } = await supabase.from('ledger').select('id').eq('partner_id', partner.id).eq('type', 'reinvestment')
      if (reinvestLedger && reinvestLedger.length > 0) {
        await supabase.from('reinvestments').delete().in('ledger_id', reinvestLedger.map(r => r.id))
      }
      await supabase.from('reinvestments').delete().eq('partner_id', partner.id)
      await supabase.from('trade_distributions').delete().eq('partner_id', partner.id)
      await supabase.from('ledger').delete().eq('partner_id', partner.id)
      const { error: err } = await supabase.from('partners').delete().eq('id', partner.id)
      if (err) throw err
      onSuccess(); onClose()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  const nameMatch = confirmed.toLowerCase() === partner.name.toLowerCase()
  return (
    <Modal title="Delete Partner Permanently" onClose={onClose} size="sm">
      <div className="space-y-4">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
          This permanently deletes <strong>{partner.name}</strong> and ALL their data — investments, profit history, reinvestments. Cannot be undone.
        </div>
        <div>
          <label className="label">Type <span className="text-red-400 font-bold">{partner.name}</span> to confirm</label>
          <input className="input border-red-500/40 focus:border-red-500" placeholder={partner.name} value={confirmed} onChange={e => setConfirmed(e.target.value)} />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleDelete} disabled={loading || !nameMatch}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-30 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors">
            {loading ? 'Deleting...' : 'Delete Forever'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function LedgerEntryRow({ entry, onEdit }) {
  const dotColor = { investment: 'bg-blue-400', reinvestment: 'bg-cyan-400', withdraw_profit: 'bg-amber-400', withdraw_capital: 'bg-red-400' }[entry.type] || 'bg-gray-400'
  const isOut = ['withdraw_profit', 'withdraw_capital'].includes(entry.type)
  const label = { investment: 'Investment', reinvestment: 'Reinvestment', withdraw_profit: 'Profit Withdrawal', withdraw_capital: 'Capital Withdrawal' }[entry.type] || entry.type
  return (
    <div className="flex items-center justify-between py-2 group">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="text-sm text-gray-300">{label}</span>
        <span className="text-xs text-gray-600 flex-shrink-0">{new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        {entry.notes && <span className="text-xs text-gray-600 truncate max-w-40 hidden sm:block">- {entry.notes}</span>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`font-semibold text-sm ${isOut ? 'text-amber-400' : 'text-emerald-400'}`}>{isOut ? '-' : '+'}{fmt(entry.amount)}</span>
        <button onClick={() => onEdit(entry)} className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-md bg-dark-600 hover:bg-dark-500 flex items-center justify-center text-gray-400 hover:text-gray-200 text-xs" title="Edit">e</button>
      </div>
    </div>
  )
}

function PartnerRow({ stats, ledger, onAddInvestment, onExit, onEditLedger, onDeletePartner }) {
  const traderFee = 100 - parseFloat(stats.profit_share_percent)
  const partnerLedger = ledger.filter(e => e.partner_id === stats.id).sort((a, b) => new Date(b.date) - new Date(a.date))
  return (
    <div className={`card transition-opacity ${stats.status === 'exited' ? 'opacity-60' : ''}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex items-center gap-3 min-w-44">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0 ${stats.isWasif ? 'bg-accent-500/20 text-accent-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {stats.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-100">{stats.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {stats.status === 'exited' ? <span className="badge bg-gray-600/20 text-gray-400 border border-gray-600/30">Exited</span>
                : stats.isWasif ? <span className="badge bg-accent-500/20 text-accent-400 border border-accent-500/30">Trader</span>
                : <span className="badge bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Active</span>}
            </div>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-dark-700 rounded-xl p-3"><p className="stat-label">Capital</p><p className="font-bold text-gray-100 mt-1">{fmt(stats.capital)}</p></div>
          <div className="bg-dark-700 rounded-xl p-3"><p className="stat-label">Total Profit</p><p className={`font-bold mt-1 ${stats.earnedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(stats.earnedProfit)}</p></div>
          <div className="bg-dark-700 rounded-xl p-3"><p className="stat-label">Available</p><p className={`font-bold mt-1 ${stats.availableProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(stats.availableProfit)}</p></div>
          <div className="bg-dark-700 rounded-xl p-3"><p className="stat-label">Profit Split</p><p className="font-bold text-gray-100 mt-1">{stats.profit_share_percent}% / {traderFee.toFixed(1)}%</p></div>
        </div>
        <div className="flex flex-col gap-2 min-w-36">
          {stats.status === 'active' && (
            <>
              <button onClick={() => onAddInvestment(stats)} className="btn-secondary text-xs py-2 text-center w-full">+ Add Investment</button>
              {!stats.isWasif && <button onClick={() => onExit(stats)} className="text-xs text-gray-500 hover:text-amber-400 transition-colors text-center py-1">Mark as Exited</button>}
            </>
          )}
          {stats.status === 'exited' && (
            <button onClick={() => onDeletePartner(stats)} className="text-xs text-red-400 hover:text-red-300 transition-colors text-center py-1.5 border border-red-500/20 rounded-lg px-2 hover:bg-red-500/10">
              Delete Permanently
            </button>
          )}
        </div>
      </div>
      {partnerLedger.length > 0 && (
        <div className="mt-5 pt-5 border-t border-dark-600">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Capital History <span className="text-gray-600 normal-case tracking-normal font-normal ml-1">- hover to edit</span></p>
          <div className="divide-y divide-dark-700">
            {partnerLedger.map(entry => <LedgerEntryRow key={entry.id} entry={entry} onEdit={onEditLedger} />)}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Partners() {
  const [partners, setPartners] = useState([])
  const [ledger, setLedger] = useState([])
  const [distributions, setDistributions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [investTarget, setInvestTarget] = useState(null)
  const [exitTarget, setExitTarget] = useState(null)
  const [editLedgerEntry, setEditLedgerEntry] = useState(null)
  const [deletePartnerTarget, setDeletePartnerTarget] = useState(null)
  const [showExited, setShowExited] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: p }, { data: l }, { data: d }] = await Promise.all([
      supabase.from('partners').select('*').order('created_at'),
      supabase.from('ledger').select('*').order('date', { ascending: false }),
      supabase.from('trade_distributions').select('*'),
    ])
    setPartners(p || []); setLedger(l || []); setDistributions(d || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const allStats = getAllPartnerStats(partners, distributions, ledger)
  const activeStats = allStats.filter(s => s.status === 'active')
  const exitedStats = allStats.filter(s => s.status === 'exited')
  const displayed = showExited ? allStats : activeStats

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400"><span className="animate-spin text-2xl mr-3">+</span> Loading...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Partners</h1>
          <p className="text-gray-500 text-sm mt-1">{activeStats.length} active{exitedStats.length > 0 ? ` - ${exitedStats.length} exited` : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          {exitedStats.length > 0 && <button onClick={() => setShowExited(v => !v)} className="btn-secondary text-xs">{showExited ? 'Hide Exited' : `Show Exited (${exitedStats.length})`}</button>}
          <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add Partner</button>
        </div>
      </div>
      <div className="space-y-4">
        {displayed.map(stats => (
          <PartnerRow key={stats.id} stats={stats} ledger={ledger} onAddInvestment={setInvestTarget} onExit={setExitTarget} onEditLedger={setEditLedgerEntry} onDeletePartner={setDeletePartnerTarget} />
        ))}
        {displayed.length === 0 && <div className="card text-center py-16"><p className="text-gray-400 font-medium">No partners yet</p><button onClick={() => setShowAdd(true)} className="btn-primary mt-4">Add First Partner</button></div>}
      </div>
      {showAdd && <AddPartnerModal onClose={() => setShowAdd(false)} onSuccess={fetchData} />}
      {investTarget && <AddInvestmentModal partner={investTarget} onClose={() => setInvestTarget(null)} onSuccess={fetchData} />}
      {exitTarget && <ExitPartnerModal partner={exitTarget} onClose={() => setExitTarget(null)} onSuccess={fetchData} />}
      {editLedgerEntry && <EditLedgerModal entry={editLedgerEntry} onClose={() => setEditLedgerEntry(null)} onSuccess={fetchData} />}
      {deletePartnerTarget && <DeletePartnerModal partner={deletePartnerTarget} onClose={() => setDeletePartnerTarget(null)} onSuccess={fetchData} />}
    </div>
  )
}
