import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/calculations'

const TYPE_CONFIG = {
  investment:       { label: 'Investment',        color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',    icon: '+', sign: '+' },
  reinvestment:     { label: 'Reinvestment',       color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',    icon: 'R', sign: '+' },
  withdraw_profit:  { label: 'Profit Withdrawal',  color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: 'W', sign: '-' },
  withdraw_capital: { label: 'Capital Withdrawal', color: 'bg-red-500/20 text-red-400 border-red-500/30',       icon: 'D', sign: '-' },
}

export default function Transactions() {
  const [ledger, setLedger] = useState([])
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterPartner, setFilterPartner] = useState('all')
  const [filterType, setFilterType] = useState('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: l }, { data: p }] = await Promise.all([
      supabase.from('ledger').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('partners').select('*').order('created_at'),
    ])
    setLedger(l || [])
    // Deduplicate: only show partners that actually have ledger entries
    // and remove duplicate names by keeping unique IDs
    const seen = new Set()
    const uniquePartners = (p || []).filter(partner => {
      const key = partner.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    setPartners(uniquePartners)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Only show partners that appear in actual ledger entries
  const partnersWithData = partners.filter(p => ledger.some(e => e.partner_id === p.id))

  const filtered = ledger.filter(e => {
    if (filterPartner !== 'all' && e.partner_id !== filterPartner) return false
    if (filterType !== 'all' && e.type !== filterType) return false
    return true
  })

  const totalInvested = ledger.filter(e => e.type === 'investment').reduce((s, e) => s + parseFloat(e.amount), 0)
  const totalReinvested = ledger.filter(e => e.type === 'reinvestment').reduce((s, e) => s + parseFloat(e.amount), 0)
  const totalWithdrawn = ledger.filter(e => e.type === 'withdraw_profit').reduce((s, e) => s + parseFloat(e.amount), 0)

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <span className="animate-spin text-2xl mr-3">+</span> Loading transactions...
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Transaction History</h1>
        <p className="text-gray-500 text-sm mt-1">Complete ledger of all capital movements</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card-sm">
          <p className="stat-label">Total Invested</p>
          <p className="text-xl font-bold text-blue-400 mt-1">{fmt(totalInvested)}</p>
        </div>
        <div className="card-sm">
          <p className="stat-label">Total Reinvested</p>
          <p className="text-xl font-bold text-cyan-400 mt-1">{fmt(totalReinvested)}</p>
        </div>
        <div className="card-sm">
          <p className="stat-label">Total Withdrawn</p>
          <p className="text-xl font-bold text-amber-400 mt-1">{fmt(totalWithdrawn)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select className="input text-sm py-1.5 w-auto" value={filterPartner} onChange={e => setFilterPartner(e.target.value)}>
          <option value="all">All Partners</option>
          {partnersWithData.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select className="input text-sm py-1.5 w-auto" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All Types</option>
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
        {(filterPartner !== 'all' || filterType !== 'all') && (
          <button onClick={() => { setFilterPartner('all'); setFilterType('all') }} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Clear filters
          </button>
        )}
        <span className="text-xs text-gray-600 ml-auto">{filtered.length} entries</span>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">No transactions found</p>
          </div>
        ) : (
          <div className="divide-y divide-dark-600">
            {filtered.map(entry => {
              const partner = partners.find(p => p.id === entry.partner_id)
              const cfg = TYPE_CONFIG[entry.type] || TYPE_CONFIG.investment
              const isOut = ['withdraw_profit', 'withdraw_capital'].includes(entry.type)
              return (
                <div key={entry.id} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-4">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold border ${cfg.color}`}>
                      {cfg.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-200">{cfg.label}</span>
                        {partner && (
                          <span className={`badge border ${cfg.color}`}>{partner.name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-500">
                          {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        {entry.notes && <span className="text-xs text-gray-600">- {entry.notes}</span>}
                      </div>
                    </div>
                  </div>
                  <span className={`font-bold ${isOut ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {cfg.sign}{fmt(entry.amount)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
