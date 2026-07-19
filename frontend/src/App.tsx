import { useEffect, useState } from 'react'
import type { Game } from './types'
import PlanScreen from './PlanScreen'
import './App.css'

function formatHours(hours: number | null): string {
  if (hours === null) return '—'
  return `${hours}h`
}

function GameList() {
  const [games, setGames] = useState<Game[]>([])
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')

  useEffect(() => {
    fetch('/api/games')
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        return res.json() as Promise<Game[]>
      })
      .then((data) => {
        setGames(data)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [])

  if (status === 'loading') return <p>Loading your library…</p>
  if (status === 'error') return <p>Couldn't load your games. Is the API running?</p>

  return (
    <table>
      <thead>
        <tr>
          <th>Game</th>
          <th>Time to beat</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        {games.map((game) => (
          <tr key={game.id}>
            <td>{game.name}</td>
            <td>{formatHours(game.timeToBeatHours)}</td>
            <td>{game.timeToBeatSource ?? 'NONE'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function App() {
  return (
    <main>
      <h1>Backlog Tactician</h1>
      <PlanScreen />
      <h2>Your library</h2>
      <GameList />
    </main>
  )
}

export default App
