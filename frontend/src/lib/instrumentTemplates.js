// Published exchange contract specs (tick size, tick value per contract), not
// live market data, so a static list is correct and needs no API: these do
// not change day to day. Verified against CME Group's own contract spec
// pages. Not an exhaustive list; anything else is still entered by hand.
export const INSTRUMENT_TEMPLATES = [
  { symbol: 'NQ', name: 'E-mini Nasdaq-100', tickSize: '0.25', tickValue: '5.00' },
  { symbol: 'ES', name: 'E-mini S&P 500', tickSize: '0.25', tickValue: '12.50' },
  { symbol: 'YM', name: 'E-mini Dow', tickSize: '1', tickValue: '5.00' },
  { symbol: 'RTY', name: 'E-mini Russell 2000', tickSize: '0.10', tickValue: '5.00' },
  { symbol: 'CL', name: 'Crude Oil', tickSize: '0.01', tickValue: '10.00' },
  { symbol: 'GC', name: 'Gold', tickSize: '0.10', tickValue: '10.00' },
  { symbol: '6E', name: 'Euro FX', tickSize: '0.00005', tickValue: '6.25' },
]
