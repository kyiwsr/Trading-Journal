

export function Button({ variant = 'secondary', className = '', type = 'button', ...rest }) {
  return <button type={type} className={`btn btn-${variant} ${className}`.trim()} {...rest} />
}
