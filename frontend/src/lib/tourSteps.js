// path: null means the target is present on every authenticated page, so no
// navigation is needed to reach it.
export const TOUR_STEPS = [
  {
    id: 'dashboard-balance',
    path: '/',
    target: 'dashboard-balance',
    title: 'Your running balance',
    body: 'Net P&L over the selected date range, starting from each account’s starting balance.',
    example: { metric: 'Net P&L', value: '+$1,240.50', detail: '+0.8% on $150,000.00' },
  },
  {
    id: 'dashboard-discipline',
    path: '/',
    target: 'dashboard-discipline',
    title: 'Discipline vs. win rate',
    body: 'Trades are grouped by how much of their setup’s checklist they followed, not just whether they won.',
    example: { metric: 'Elite (85-100%)', value: '79% win rate', detail: '34 trades · +0.92R avg' },
  },
  {
    id: 'header-log-trade',
    path: null,
    target: 'header-log-trade',
    title: 'Log a trade',
    body: 'Log a trade whenever you close one out. This button follows you to every screen.',
  },
  {
    id: 'trade-log',
    path: '/trades',
    target: 'trade-log',
    title: 'The ledger',
    body: 'Every trade you’ve logged, filterable and exportable to CSV.',
  },
  {
    id: 'setups',
    path: '/setups',
    target: 'setups',
    title: 'Setups',
    body: 'A setup is a way you trade, named in your own words. Each one has a weighted checklist, and how much of it you follow becomes the trade’s checklist score.',
  },
]
