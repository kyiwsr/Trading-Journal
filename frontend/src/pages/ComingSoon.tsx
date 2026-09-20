import { Link, useSearchParams } from 'react-router-dom'

import { EmptyState, Panel } from '../components'
import { readScope, scopeSearch } from '../lib/urlState'

// TODO: replaced in Milestone 5 by the Log Trade form and the Setups screen.
export default function ComingSoon({ title, children }: { title: string; children: string }) {
  const [params] = useSearchParams()
  const search = scopeSearch(readScope(params))
  return (
    <Panel title={title}>
      <EmptyState title="Coming soon">
        <p>{children}</p>
        <p>
          <Link to={{ pathname: '/', search }}>Back to Command HQ</Link>
        </p>
      </EmptyState>
    </Panel>
  )
}
