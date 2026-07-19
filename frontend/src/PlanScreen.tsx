import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Plan, PlanEntry } from './types'

function explain(entry: PlanEntry): string {
  const reasons: string[] = []
  if (entry.completionBonus >= 5) reasons.push('almost done — big finish bonus')
  else if (entry.completionBonus > 0) reasons.push('some progress already banked')
  if (entry.recencyPenalty > 0) reasons.push('played very recently, so slightly deprioritised')
  if (entry.varietyBonus > 0) reasons.push(`adds a genre${entry.game.genre ? ` (${entry.game.genre})` : ''} not already in this plan`)
  if (reasons.length === 0) reasons.push('fresh pick from your backlog')
  return reasons.join('; ')
}

function PlanEntryRow({ entry }: { entry: PlanEntry }) {
  const [hoursPlayed, setHoursPlayed] = useState('1')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const markPlayed = () => {
    const value = Number(hoursPlayed)
    if (!Number.isFinite(value) || value <= 0) {
      setStatus('error')
      return
    }

    setStatus('saving')
    fetch(`/api/games/${entry.game.id}/play-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hoursPlayed: value }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        setStatus('saved')
      })
      .catch(() => setStatus('error'))
  }

  return (
    <li>
      <strong>{entry.game.name}</strong> — {entry.allocatedHours.toFixed(1)}h
      <div className="why">{explain(entry)}</div>
      <div className="mark-played">
        <input
          type="number"
          min="0.25"
          step="0.25"
          value={hoursPlayed}
          onChange={(event) => setHoursPlayed(event.target.value)}
          aria-label={`Hours played on ${entry.game.name}`}
        />
        <button type="button" onClick={markPlayed} disabled={status === 'saving'}>
          Mark played
        </button>
        {status === 'saved' && <span> Logged — regenerate your plan to see it reflected.</span>}
        {status === 'error' && <span role="alert"> Couldn't log that session.</span>}
      </div>
    </li>
  )
}

function PlanResult({ plan }: { plan: Plan }) {
  if (plan.entries.length === 0) {
    return <p>Nothing fits that budget yet — try a bigger number, or add time-to-beat estimates to more games.</p>
  }

  const totalHours = plan.entries.reduce((sum, entry) => sum + entry.allocatedHours, 0)

  return (
    <div>
      <p>
        <strong>{plan.entries.length}</strong> game{plan.entries.length === 1 ? '' : 's'}, using{' '}
        <strong>{totalHours.toFixed(1)}h</strong>
      </p>
      <ol>
        {plan.entries.map((entry) => (
          <PlanEntryRow key={entry.id} entry={entry} />
        ))}
      </ol>
    </div>
  )
}

function PlanScreen() {
  const [hours, setHours] = useState('8')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const hoursAvailable = Number(hours)
    if (!Number.isFinite(hoursAvailable) || hoursAvailable <= 0) {
      setStatus('error')
      return
    }

    setStatus('loading')
    fetch('/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hoursAvailable }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        return res.json() as Promise<Plan>
      })
      .then((data) => {
        setPlan(data)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }

  return (
    <section>
      <h2>This week's plan</h2>
      <form onSubmit={handleSubmit}>
        <label htmlFor="hours">Hours free this week</label>
        <input
          id="hours"
          type="number"
          min="0.5"
          step="0.5"
          value={hours}
          onChange={(event) => setHours(event.target.value)}
        />
        <button type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Building plan…' : 'Build my plan'}
        </button>
      </form>

      {status === 'error' && <p role="alert">Couldn't build a plan. Check the hours you entered and try again.</p>}
      {status === 'ready' && plan && <PlanResult plan={plan} />}
    </section>
  )
}

export default PlanScreen
