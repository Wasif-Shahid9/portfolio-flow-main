// ============================================================
// FINANCIAL CALCULATIONS ENGINE
// Core logic for capital ratios, profit splits, balances
// ============================================================

/**
 * Get a partner's total capital at a specific date (or "now" if no date)
 * Capital = sum of investments + reinvestments - capital withdrawals
 */
export function getPartnerCapital(ledgerEntries, partnerId, upToDate = null) {
  const entries = ledgerEntries.filter(e => {
    if (e.partner_id !== partnerId) return false
    if (upToDate && new Date(e.date) > new Date(upToDate)) return false
    return true
  })

  const capitalIn = entries
    .filter(e => ['investment', 'reinvestment'].includes(e.type))
    .reduce((sum, e) => sum + parseFloat(e.amount), 0)

  const capitalOut = entries
    .filter(e => e.type === 'withdraw_capital')
    .reduce((sum, e) => sum + parseFloat(e.amount), 0)

  return Math.max(0, capitalIn - capitalOut)
}

/**
 * Get all partners' capital at a given date and return ratio map
 * Returns: { partnerId: { capital, ratio } }
 */
export function getCapitalRatios(ledgerEntries, partners, upToDate = null) {
  const capitals = {}
  let totalCapital = 0

  for (const p of partners) {
    if (p.status !== 'active') continue
    const capital = getPartnerCapital(ledgerEntries, p.id, upToDate)
    capitals[p.id] = capital
    totalCapital += capital
  }

  const ratios = {}
  for (const p of partners) {
    if (p.status !== 'active') continue
    ratios[p.id] = {
      capital: capitals[p.id] || 0,
      ratio: totalCapital > 0 ? (capitals[p.id] || 0) / totalCapital : 0,
    }
  }

  return { ratios, totalCapital }
}

/**
 * Calculate how a trade's profit/loss is distributed among active partners
 * Returns array of distribution objects ready to insert into trade_distributions
 *
 * Rules:
 *  - Each partner's gross = their capital ratio × total profit/loss
 *  - partner_net = gross × (profit_share_percent / 100)
 *  - trader_fee = gross - partner_net  (goes to Wasif, i.e. the 100% partner)
 *  - Rounding: last partner absorbs any floating-point remainder
 */
export function calculateTradeDistributions(profitLoss, partners, ledgerEntries, tradeDate) {
  const activePartners = partners.filter(p => p.status === 'active')
  const { ratios, totalCapital } = getCapitalRatios(ledgerEntries, activePartners, tradeDate)

  if (totalCapital === 0) return []

  const distributions = []
  let distributedGross = 0

  activePartners.forEach((partner, index) => {
    const { capital, ratio } = ratios[partner.id] || { capital: 0, ratio: 0 }

    // Last partner gets the remainder to fix floating point drift
    let gross
    if (index === activePartners.length - 1) {
      gross = profitLoss - distributedGross
    } else {
      gross = round8(ratio * profitLoss)
      distributedGross += gross
    }

    const partnerNet = round8(gross * (parseFloat(partner.profit_share_percent) / 100))
    const traderFee = round8(gross - partnerNet)

    distributions.push({
      partner_id: partner.id,
      capital_snapshot: round8(capital),
      capital_ratio: round8(ratio),
      gross_amount: round8(gross),
      partner_net: round8(partnerNet),
      trader_fee: round8(traderFee),
    })
  })

  return distributions
}

/**
 * Get a partner's total earned profit from all trade distributions
 * For Wasif (100% partner): adds all trader_fees from OTHER partners too
 */
export function getPartnerEarnedProfit(distributions, partnerId, isWasif = false) {
  let earned = distributions
    .filter(d => d.partner_id === partnerId)
    .reduce((sum, d) => sum + parseFloat(d.partner_net), 0)

  if (isWasif) {
    // Wasif also earns the trader fee from all other partners
    const tradeFees = distributions
      .filter(d => d.partner_id !== partnerId)
      .reduce((sum, d) => sum + parseFloat(d.trader_fee), 0)
    earned += tradeFees
  }

  return round8(earned)
}

/**
 * Get a partner's available (withdrawable) profit
 * = Earned from trades - profit withdrawals - reinvestments
 */
export function getPartnerAvailableProfit(distributions, ledgerEntries, partnerId, isWasif = false) {
  const earned = getPartnerEarnedProfit(distributions, partnerId, isWasif)

  const deducted = ledgerEntries
    .filter(e => e.partner_id === partnerId && ['withdraw_profit', 'reinvestment'].includes(e.type))
    .reduce((sum, e) => sum + parseFloat(e.amount), 0)

  return round8(earned - deducted)
}

/**
 * Get full stats for all partners in one pass (for dashboard)
 */
export function getAllPartnerStats(partners, distributions, ledgerEntries) {
  // Find Wasif (100% profit share partner)
  const wasif = partners.find(p => parseFloat(p.profit_share_percent) === 100 && p.status === 'active')

  return partners.map(partner => {
    const isWasif = wasif && partner.id === wasif.id
    const capital = getPartnerCapital(ledgerEntries, partner.id)
    const earnedProfit = getPartnerEarnedProfit(distributions, partner.id, isWasif)
    const availableProfit = getPartnerAvailableProfit(distributions, ledgerEntries, partner.id, isWasif)
    const totalWithdrawn = ledgerEntries
      .filter(e => e.partner_id === partner.id && e.type === 'withdraw_profit')
      .reduce((sum, e) => sum + parseFloat(e.amount), 0)
    const totalReinvested = ledgerEntries
      .filter(e => e.partner_id === partner.id && e.type === 'reinvestment')
      .reduce((sum, e) => sum + parseFloat(e.amount), 0)

    return {
      ...partner,
      capital,
      earnedProfit,
      availableProfit,
      totalWithdrawn,
      totalReinvested,
      isWasif,
    }
  })
}

/**
 * Get per-trade display data: enriched distributions with reinvestment status
 */
export function enrichDistributionsWithReinvestStatus(distributions, reinvestments, partners) {
  return distributions.map(dist => {
    const partner = partners.find(p => p.id === dist.partner_id)
    const reinvested = reinvestments.find(r => r.trade_distribution_id === dist.id)
    return {
      ...dist,
      partnerName: partner?.name || 'Unknown',
      isReinvested: !!reinvested,
      reinvestedAmount: reinvested ? parseFloat(reinvested.amount) : 0,
    }
  })
}

/**
 * Format dollar amount for display
 */
export function fmt(amount, decimals = 2) {
  const num = parseFloat(amount) || 0
  const sign = num >= 0 ? '' : '-'
  return `${sign}$${Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

/**
 * Format as percentage
 */
export function fmtPct(ratio) {
  return `${(parseFloat(ratio) * 100).toFixed(1)}%`
}

/**
 * Round to 8 decimal places to avoid floating point drift
 */
function round8(val) {
  return Math.round(val * 1e8) / 1e8
}
