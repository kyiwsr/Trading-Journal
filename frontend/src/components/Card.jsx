

const toneClass = { default: '', tint: 'card-tint', quest: 'card-quest', penalty: 'card-penalty' }

export function Card({ tone = 'default', className = '', ...rest }) {
  return <div className={`card ${toneClass[tone]} ${className}`.trim()} {...rest} />
}
