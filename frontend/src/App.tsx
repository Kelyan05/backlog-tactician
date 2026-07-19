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
    fetch('/api/games', { credentials: 'include' })
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
          <th>Genre</th>
          <th>Time to beat</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        {games.map((game) => (
          <tr key={game.id}>
            <td>{game.name}</td>
            <td>{game.genre ?? '—'}</td>
            <td>{formatHours(game.timeToBeatHours)}</td>
            <td>{game.timeToBeatSource ?? 'NONE'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AuthBar({ onLoggedOut }: { onLoggedOut: () => void }) {
  const logout = () => {
    fetch('/auth/logout', { method: 'POST', credentials: 'include' }).then(onLoggedOut)
  }

  return (
    <div className="auth-bar">
      <button type="button" onClick={logout}>
        Log out
      </button>
    </div>
  )
}

function LoginScreen() {
  return (
    <main>
      <h1>Backlog Tactician</h1>
      <p>Sign in with Steam to import your library and build a weekly plan.</p>
      <a className="steam-login" href="/auth/steam/login">
        Log in with Steam
      </a>
      {import.meta.env.DEV && (
        <p>
          <button
            type="button"
            onClick={() => {
              fetch('/auth/dev-login', { method: 'POST', credentials: 'include' }).then(() => window.location.reload())
            }}
          >
            Dev login (local testing only)
          </button>
        </p>
      )}
    </main>
  )
}

function App() {
  const [userId, setUserId] = useState<number | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')

  useEffect(() => {
    fetch('/auth/me', { credentials: 'include' })
      .then((res) => res.json() as Promise<{ userId: number | null }>)
      .then((data) => {
        setUserId(data.userId)
        setStatus('ready')
      })
  }, [])

  if (status === 'loading') return null
  if (userId === null) return <LoginScreen />

  return (
    <main>
      <h1>Backlog Tactician</h1>
      <AuthBar onLoggedOut={() => setUserId(null)} />
      <PlanScreen />
      <h2>Your library</h2>
      <GameList />
    </main>
  )
}

export default App
