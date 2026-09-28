import { useCallback, useEffect, useState } from 'react'

// ligne horizontale : support ou résistance selon sa position par rapport au prix actuel
export interface Level {
  id: string
  price: number
}

// extrémité d'une ligne de tendance : date (secondes Unix) + prix, pour rester en place quelle que soit l'UT
export interface TrendPoint {
  time: number
  price: number
}

export interface Trend {
  id: string
  a: TrendPoint
  b: TrendPoint
}

// le stockage peut être indisponible (navigation privée, stockage plein) : les traits restent alors en mémoire
function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

function save<T>(key: string, items: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items))
  } catch {
    // on garde la version en mémoire
  }
}

// liste de traits propre à chaque actif (un niveau du DAX n'a pas de sens sur EUR/USD), commune à toutes les UT
function useStoredList<T extends { id: string }>(key: string) {
  const [state, setState] = useState(() => ({ key, items: load<T>(key) }))

  // changement d'actif : on charge ses propres traits
  useEffect(() => {
    setState({ key, items: load<T>(key) })
  }, [key])

  const change = useCallback(
    (fn: (items: T[]) => T[]) =>
      setState((s) => {
        const items = fn(s.items)
        save(s.key, items)
        return { ...s, items }
      }),
    [],
  )

  const add = useCallback(
    (item: Omit<T, 'id'>) => {
      const id = crypto.randomUUID()
      change((items) => [...items, { ...item, id } as T])
      return id
    },
    [change],
  )
  const update = useCallback(
    (id: string, patch: Partial<Omit<T, 'id'>>) => change((items) => items.map((i) => (i.id === id ? { ...i, ...patch } : i))),
    [change],
  )
  const remove = useCallback((id: string) => change((items) => items.filter((i) => i.id !== id)), [change])
  const clear = useCallback(() => change(() => []), [change])

  // pendant le rendu qui suit un changement d'actif, on n'expose pas les traits de l'ancien
  const items = state.key === key ? state.items : []
  return { items, add, update, remove, clear }
}

export const useLevels = (symbol: string) => useStoredList<Level>(`chartscope.levels.${symbol}`)
export const useTrends = (symbol: string) => useStoredList<Trend>(`chartscope.trends.${symbol}`)
