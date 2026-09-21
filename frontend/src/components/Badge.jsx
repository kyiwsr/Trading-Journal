

export function Badge({ tone = 'neutral', className = '', ...rest }) {
  const toneClass = tone === 'neutral' ? '' : `badge-${tone}`
  return <span className={`badge ${toneClass} ${className}`.trim()} {...rest} />
}
