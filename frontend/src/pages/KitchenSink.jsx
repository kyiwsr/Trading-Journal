import { useState } from 'react'

import { Badge, Button, Card, Checkbox, Input, XpBar } from '../components'

export default function KitchenSink() {
  const [checked, setChecked] = useState(true)
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24, display: 'grid', gap: 24 }}>
      <h1>Kitchen sink</h1>

      <Card>
        <h3>Buttons</h3>
        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          <Button variant="primary">Log trade</Button>
          <Button variant="secondary">Export CSV</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <Card>Default card</Card>
        <Card tone="tint">Tint card</Card>
        <Card tone="quest">Quest card</Card>
        <Card tone="penalty">Penalty card</Card>
      </div>

      <Card>
        <h3>Inputs and checklist</h3>
        <div style={{ display: 'grid', gap: 12, marginTop: 12, maxWidth: 360 }}>
          <Input defaultValue="20,380.25" />
          <Checkbox
            label="Wait for liquidity sweep (25 pts)"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <Checkbox label="Stop placed before entry (20 pts)" />
        </div>
      </Card>

      <Card>
        <h3>Badges and XP</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '12px 0' }}>
          <Badge>Long</Badge>
          <Badge tone="win">Win</Badge>
          <Badge tone="loss">Loss</Badge>
          <Badge tone="streak">4-win streak</Badge>
        </div>
        <p className="mono" style={{ margin: '0 0 8px' }}>
          LVL 1 - XP 8,420 / 10,000
        </p>
        <XpBar value={8420} max={10000} />
      </Card>
    </main>
  )
}
