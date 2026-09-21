/**
 * The API serializes decimals as strings; convert at the edge of a component, never in state.
 * @typedef {string} Dec
 */

/**
 * @typedef {'long' | 'short'} Direction
 */

/**
 * @typedef {'win' | 'loss' | 'breakeven'} Result
 */

/**
 * @typedef {'elite' | 'solid' | 'sub_optimal' | 'rule_breach'} Band
 */

/**
 * @typedef {'elite' | 'solid' | 'negative_edge'} SetupRank
 */

/**
 * @typedef {'30D' | '90D' | 'YTD' | 'ALL'} RangeName
 */

/**
 * @typedef {'closed_at' | 'opened_at' | 'net_pnl' | 'r_multiple' | 'execution_score'} SortField
 */

/**
 * @typedef {'asc' | 'desc'} Order
 */

/**
 * @typedef {{ id: number; email: string }} User
 */

/**
 * @typedef {Object} Account
 * @property {number} id
 * @property {string} name
 * @property {string | null} label
 * @property {string | null} broker_name
 * @property {string | null} route
 * @property {Dec} starting_balance
 * @property {string} currency
 * @property {number | null} fee_profile_id
 * @property {string | null} archived_at
 * @property {string} created_at
 */

/**
 * @typedef {{ id: number; label: string; weight: Dec; display_order: number }} Criterion
 */

/**
 * @typedef {Object} Setup
 * @property {number} id
 * @property {string} name
 * @property {string | null} subtitle
 * @property {string | null} description
 * @property {string | null} archived_at
 * @property {string} created_at
 * @property {Criterion[]} criteria
 */

/**
 * @typedef {{ id: number; name: string; subtitle: string | null }} SetupBrief
 */

/**
 * @typedef {Object} TradeListItem
 * @property {number} id
 * @property {number} account_id
 * @property {string} opened_at
 * @property {string} closed_at
 * @property {string | null} session
 * @property {string} symbol
 * @property {string | null} instrument_name
 * @property {Direction} direction
 * @property {SetupBrief | null} setup
 * @property {number} entry_fills
 * @property {number} exit_fills
 * @property {Dec} quantity
 * @property {Dec} avg_entry
 * @property {Dec} avg_exit
 * @property {Dec} gross_pnl
 * @property {Dec} fees_total
 * @property {Dec} net_pnl
 * @property {Result} result
 * @property {Dec | null} r_multiple
 * @property {number | null} execution_score
 * @property {Band | null} score_band
 * @property {string[]} tags
 * @property {boolean} has_screenshot
 * @property {boolean | null} compliant
 */

/**
 * Totals for every trade matching the filters, not just the current page.
 * @typedef {Object} TradeSummary
 * @property {number} trades
 * @property {number} wins
 * @property {number} losses
 * @property {number} breakeven
 * @property {Dec} net_pnl
 * @property {Dec} fees_total
 * @property {Dec | null} win_rate
 * @property {Dec | null} profit_factor
 * @property {Dec | null} avg_score
 * @property {number} scored_count
 * @property {number} compliant_count
 * @property {number} elite_count
 * @property {number | null} avg_hold_seconds
 */

/**
 * @typedef {Object} TradeList
 * @property {TradeListItem[]} items
 * @property {TradeSummary} summary
 * @property {number} total
 * @property {number} page
 * @property {number} page_size
 */

/**
 * @typedef {Object} Settings
 * @property {number} compliance_cutoff
 * @property {{ elite_min: number; solid_min: number; sub_optimal_min: number }} bands
 * @property {number} low_sample_threshold
 * @property {number} elite_setup_min
 */

/**
 * @typedef {Object} Fill
 * @property {number} id
 * @property {'entry' | 'exit'} fill_type
 * @property {Dec} price
 * @property {Dec} quantity
 * @property {string} filled_at
 * @property {string | null} note
 * @property {Dec | null} realized_points
 * @property {Dec | null} realized_pnl
 */

/**
 * @typedef {Object} CriterionCheck
 * @property {number} criterion_id
 * @property {string} label
 * @property {Dec} weight
 * @property {boolean} checked
 * @property {string | null} note
 */

/**
 * @typedef {Object} TradeDetail
 * @property {number} id
 * @property {number} account_id
 * @property {{ id: number; symbol: string; name: string | null; tick_size: Dec; tick_value: Dec }} instrument
 * @property {SetupBrief | null} setup
 * @property {Direction} direction
 * @property {string | null} session
 * @property {string[]} tags
 * @property {string} opened_at
 * @property {string} closed_at
 * @property {Dec | null} stop_price
 * @property {Dec | null} target_price
 * @property {Dec} quantity
 * @property {Dec} avg_entry
 * @property {Dec} avg_exit
 * @property {Dec} points
 * @property {Dec | null} risk_amount
 * @property {Dec} gross_pnl
 * @property {Dec} fees_total
 * @property {Dec} slippage_ticks
 * @property {Dec} slippage_cost
 * @property {Dec} net_pnl
 * @property {Dec | null} r_multiple
 * @property {number | null} execution_score
 * @property {Band | null} score_band
 * @property {string | null} pre_trade_focus
 * @property {string | null} environment
 * @property {string | null} debrief_notes
 * @property {string | null} screenshot_path
 * @property {string | null} screenshot_url
 * @property {Fill[]} fills
 * @property {{ name: string; amount: Dec }[]} fees
 * @property {CriterionCheck[]} criteria
 * @property {boolean | null} compliant
 * @property {string | null} fee_profile_name
 * @property {number | null} xp_points
 * @property {number | null} prev_trade_id
 * @property {number | null} next_trade_id
 * @property {string} created_at
 */

/**
 * @typedef {Object} Summary
 * @property {number} trade_count
 * @property {number} wins
 * @property {number} losses
 * @property {number} breakevens
 * @property {Dec} net_pnl
 * @property {Dec} gross_pnl
 * @property {Dec} fees_total
 * @property {Dec} gross_profits
 * @property {Dec} gross_losses
 * @property {Dec | null} profit_factor
 * @property {Dec | null} win_rate
 * @property {Dec | null} expectancy
 * @property {Dec} total_r
 * @property {Dec | null} avg_execution_score
 * @property {Dec | null} return_pct
 */

/**
 * @typedef {Object} EquityPoint
 * @property {string} closed_at
 * @property {Dec} equity
 * @property {number} trade_id
 * @property {Dec} net_pnl
 * @property {Result} result
 */

/**
 * @typedef {Object} Equity
 * @property {Dec} baseline
 * @property {EquityPoint[]} points
 * @property {Dec} peak
 * @property {Dec} current
 * @property {Dec} drawdown_amount
 * @property {Dec} drawdown_pct
 * @property {Dec} max_drawdown_pct
 */

/**
 * @typedef {Object} DisciplineBucket
 * @property {Band} band
 * @property {number} trade_count
 * @property {Dec | null} win_rate
 * @property {Dec} net_pnl
 * @property {Dec | null} avg_r
 */

/**
 * @typedef {Object} SetupRow
 * @property {number} setup_id
 * @property {string | null} name
 * @property {string | null} subtitle
 * @property {number} trade_count
 * @property {Dec | null} win_rate
 * @property {Dec} net_pnl
 * @property {Dec | null} expectancy
 * @property {Dec | null} avg_execution_score
 * @property {SetupRank} rank
 * @property {boolean} low_sample
 */

/**
 * @typedef {Object} Xp
 * @property {number} total_xp
 * @property {number} level
 * @property {number} xp_in_level
 * @property {number} xp_per_level
 * @property {number} win_streak
 */

/**
 * @typedef {Object} Dashboard
 * @property {string} range
 * @property {string} account
 * @property {string | null} currency
 * @property {Dec} starting_balance
 * @property {Summary} summary
 * @property {Equity} equity
 * @property {{ buckets: DisciplineBucket[]; saved_capital: Dec }} discipline
 * @property {SetupRow[]} setups
 * @property {TradeListItem[]} recent_trades
 * @property {Xp} xp
 */

/**
 * @typedef {'per_fill' | 'per_contract'} FeeBasis
 */

/**
 * @typedef {Object} Instrument
 * @property {number} id
 * @property {string} symbol
 * @property {string | null} name
 * @property {Dec} tick_size
 * @property {Dec} tick_value
 * @property {string | null} archived_at
 * @property {string} created_at
 */

/**
 * @typedef {{ id: number; name: string; amount: Dec; basis: FeeBasis }} FeeComponent
 */

/**
 * @typedef {Object} FeeProfile
 * @property {number} id
 * @property {string} name
 * @property {string | null} notes
 * @property {string | null} archived_at
 * @property {string} created_at
 * @property {FeeComponent[]} components
 */

/**
 * @typedef {Object} FeeTemplate
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {{ name: string; amount: Dec; basis: FeeBasis }[]} components
 */

/**
 * @typedef {{ name: string; amount: string; basis: FeeBasis }} FeeComponentInput
 */

/**
 * @typedef {{ path: string; upload_url: string; expires_in: number }} UploadTicket
 */

/**
 * @typedef {Object} TradePayload
 * @property {number} account_id
 * @property {number} instrument_id
 * @property {number | null} setup_id
 * @property {Direction} direction
 * @property {string | null} session
 * @property {string[]} tags
 * @property {string | null} stop_price
 * @property {string | null} target_price
 * @property {string} slippage_ticks
 * @property {{ fill_type: 'entry' | 'exit'; price: string; quantity: string; filled_at: string; note: string | null }[]} fills
 * @property {{ criterion_id: number; checked: boolean; note: string | null }[]} criteria_checks
 * @property {string | null} pre_trade_focus
 * @property {string | null} environment
 * @property {string | null} debrief_notes
 * @property {string | null} screenshot_path
 */

export {}
